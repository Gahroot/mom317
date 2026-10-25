// Automated approval gate (owner's decision, replaces human approval when AUTO_PUBLISH != 'false').
// Hourly + right after draft/optimize push a PR: for each open engine blog/* PR not yet gated, run
//   1. sources resolve  2. build-blog.mjs --check after approval  3. claims lint  4. independent LLM fact-check.
// All pass -> approve, rebuild, push, wait for green CI, squash-merge, delete branch.
// Any fail -> no merge, label `needs-review`, comment, open/update a `needs-review` issue assigned to the owner.
// Owner `/approve` comment = manual override. AUTO_PUBLISH=false = old flow (approve on /approve, never merge).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as GH from '../github.js';
import { parsePost, setApproval } from '../frontmatter.js';
import { verifySources, isTrustedUrl } from '../sources.js';
import { createHash } from 'node:crypto';
import { complete, extractJson, llmConfigured, BRAND_RULES } from '../llm.js';
import { checkBudget } from '../cost.js';

export const AUTO_APPROVER = 'auto-review (3:17 engine)';
export const autoPublish = (env = process.env) => String(env.AUTO_PUBLISH ?? 'true').toLowerCase() !== 'false';
const todayNY = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const UA = 'Mozilla/5.0 (compatible; Back2SleepNow-FactCheck/1.0; +https://back2sleepnow.com)';

export function findApproval(comments, owner) {
  return comments.find((c) => c.user && c.user.login.toLowerCase() === owner.toLowerCase() && /^\s*\/approve\b/m.test(c.body || '')) || null;
}

// ---------- check 3: claims lint ----------
const FORBIDDEN = /\b(cures?|treats?|clinically proven|guaranteed|works in minutes)\b/i;
const PRODUCT = /(3:17|sleep shot|our (product|shot|formula|drink))/i;
const PRODUCT_EFFICACY = /\b(cur(e|es|ed|ing)|treat(s|ed|ing|ment)?|prevent(s|ed|ing|ion)?|heal(s|ed|ing)?|help(s|ed|ing)?|work(s|ed)?|relie(f|ves?|ved)|improv(e|es|ed|ing)|reduc(e|es|ed|ing)|fix(es|ed)?|eliminat(e|es|ed)|restor(e|es|ed)|proven|effective)\b/i;
const PRODUCT_INGREDIENT = /\b(ingredients?|contains?|formulat(ed|ion)|dos(e|es|age)|\d+(\.\d+)?\s?(mg|mcg|µg|iu|g|ml))\b/i;
const COUNTS = /\b(\d[\d,.]*\s*k?\+?|thousands|hundreds)\s+(of\s+)?(women|people|members|readers|subscribers|signups)\s+(have\s+)?(already\s+)?(joined|signed up|are on)/i;
const TESTIMONIAL = /\b(testimonials?|customers (say|love)|5-star|five-star|rave reviews)\b/i;

export function claimsLint(post) {
  const text = [post.title, post.description, post.answer, ...(post.faq || []).flatMap((f) => [f.q, f.a]), post.body].filter(Boolean).join('\n');
  const issues = [];
  if (FORBIDDEN.test(text)) issues.push(`efficacy/cure language: "${text.match(FORBIDDEN)[0]}"`);
  if (/liquid dietary supplement/i.test(text)) issues.push("uses 'liquid dietary supplement'");
  if (COUNTS.test(text)) issues.push('signup/member count');
  if (TESTIMONIAL.test(text)) issues.push('testimonial language');
  for (const s of text.split(/(?<=[.!?])\s+|\n+/)) {
    if (!PRODUCT.test(s)) continue;
    if (PRODUCT_EFFICACY.test(s)) issues.push(`product efficacy/treat/prevent language: "${s.trim().slice(0, 140)}"`);
    if (PRODUCT_INGREDIENT.test(s)) issues.push(`product ingredient/dose: "${s.trim().slice(0, 140)}"`);
  }
  const ids = new Set((post.sources || []).map((s) => String(s.id)));
  for (const c of post.claims || []) if (!ids.has(String(c.source))) issues.push(`unsourced claim: ${c.text}`);
  return [...new Set(issues)];
}

// ---------- check 4: independent fact-check ----------
export function pageText(html) {
  const h = String(html);
  const pick = (re) => { const m = h.match(re); return m ? m[1] : ''; };
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const metas = [...h.matchAll(/<meta[^>]+(?:name|property)=["'](?:citation_abstract|description|og:description|dc\.description)["'][^>]*content=["']([^"']*)["']/gi)].map((m) => m[1]);
  const abs = pick(/<(?:div|section)[^>]+(?:id|class)=["'][^"']*abstract[^"']*["'][^>]*>([\s\S]{0,12000})/i);
  const strip = (s) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
  const body = abs ? strip(abs) : strip(h.replace(/<head[\s\S]*?<\/head>/i, ''));
  return [strip(title), ...metas.map(strip), body].filter(Boolean).join('\n').slice(0, 6000);
}

/** Source text, cached for 7 days in source_cache when a db is given. */
export async function cachedSourceText(db, url, fetchImpl = globalThis.fetch) {
  if (!db) return fetchSourceText(url, fetchImpl);
  const hit = (await db.query("SELECT text FROM source_cache WHERE url = $1 AND fetched_at > now() - interval '7 days'", [url])).rows[0];
  if (hit) return hit.text;
  const text = await fetchSourceText(url, fetchImpl);
  if (text) {
    await db.query('DELETE FROM source_cache WHERE url = $1', [url]);
    await db.query('INSERT INTO source_cache (url, text) VALUES ($1,$2)', [url, text]);
  }
  return text;
}

export const claimKey = (claim, url) => createHash('sha256').update(`${claim}\n${url}`).digest('hex');
const bodyKey = (post) => createHash('sha256').update(`body\n${post.answer || ''}\n${post.body || ''}`).digest('hex');

async function cachedSupported(db, key) {
  if (!db) return false;
  return (await db.query("SELECT 1 FROM claim_checks WHERE key = $1 AND verdict = 'supported' AND checked_at > now() - interval '90 days'", [key])).rows.length > 0;
}
async function saveCheck(db, key, verdict, reason) {
  if (!db) return;
  await db.query('DELETE FROM claim_checks WHERE key = $1', [key]);
  await db.query('INSERT INTO claim_checks (key, verdict, reason) VALUES ($1,$2,$3)', [key, verdict, String(reason || '').slice(0, 500)]);
}

export async function fetchSourceText(url, fetchImpl = globalThis.fetch) {
  if (!isTrustedUrl(url)) return null;
  try {
    const res = await fetchImpl(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, signal: AbortSignal.timeout(20_000) });
    if (res.status < 200 || res.status >= 400 || typeof res.text !== 'function') return null;
    const t = pageText(await res.text());
    return t.length >= 40 ? t : null;
  } catch { return null; }
}

const FACT_SYSTEM = `You are a skeptical, independent medical fact-checker. You did not write this blog post and have no stake in it being published.
For each numbered claim, judge it ONLY against the source excerpt given for it (title/abstract text), not your own knowledge.
- "supported": the excerpt directly backs the claim, with no stronger certainty, causality, magnitude or broader population than the source.
- "overstated": the source backs only a weaker, narrower or more hedged version.
- "unsupported": the excerpt does not back it, or is too thin to tell.
Then read the post body and list every medical or health statement that is NOT covered by one of the listed claims (ignore the "not medical advice" disclaimer and invitations to join the waitlist).
Reply with JSON only: {"verdicts":[{"index":0,"verdict":"supported|overstated|unsupported","reason":"short"}],"unlisted_medical_statements":["..."]}
The blog's editorial rules, for context (a post must also respect these):
${BRAND_RULES}`;

export async function factCheck(post, { env = process.env, fetchImpl = globalThis.fetch, completeImpl, db } = {}) {
  const verdicts = [];
  const items = [];
  const claims = post.claims || [];
  for (let i = 0; i < claims.length; i++) {
    const c = claims[i];
    const src = (post.sources || []).find((s) => String(s.id) === String(c.source));
    const row = { claim: c.text, source: c.source ?? '', url: src ? src.url : '', verdict: 'unsupported', reason: '' };
    verdicts.push(row);
    if (!src) { row.reason = 'cited source does not exist'; continue; }
    // Claim cache: a 'supported' verdict for the same claim + source URL from the last 90 days is reused.
    row.key = claimKey(c.text, src.url);
    if (await cachedSupported(db, row.key)) { row.verdict = 'supported'; row.reason = 'cached verdict (< 90 days)'; row.cached = true; continue; }
    const text = await cachedSourceText(db, src.url, fetchImpl);
    if (!text) { row.reason = 'source unfetchable'; continue; }
    items.push({ index: i, claim: c.text, source: `${src.title || ''} (${src.publisher || ''} ${src.year || ''})`, excerpt: text });
  }
  const llm = completeImpl || (llmConfigured(env) ? complete : null);
  let unlisted = [];
  const bKey = bodyKey(post);
  if (llm && items.length === 0 && verdicts.length && verdicts.every((v) => v.cached) && await cachedSupported(db, bKey)) {
    // Every claim and the unchanged body were checked clean recently: no LLM call.
  } else if (!llm) {
    for (const it of items) verdicts[it.index].reason = 'fact-checker LLM not configured';
    unlisted = ['fact-check could not run: no LLM configured'];
  } else {
    const prompt = `Claims to check (with source excerpts):\n${JSON.stringify(items.map(({ index, claim, source, excerpt }) => ({ index, claim, source, excerpt })), null, 1)}\n\nListed claims (all):\n${JSON.stringify(claims.map((c) => c.text))}\n\nPost body:\n"""\n${String(post.answer || '')}\n\n${String(post.body || '').slice(0, 20000)}\n"""`;
    const out = extractJson(await llm(FACT_SYSTEM, prompt, { env, temperature: 0, db, job: 'gate', cacheSystem: true }));
    const by = new Map((out.verdicts || []).map((v) => [Number(v.index), v]));
    for (const it of items) {
      const v = by.get(it.index);
      const verdict = v && ['supported', 'overstated', 'unsupported'].includes(String(v.verdict).toLowerCase()) ? String(v.verdict).toLowerCase() : 'unsupported';
      verdicts[it.index].verdict = verdict;
      verdicts[it.index].reason = v ? String(v.reason || '') : 'no verdict returned';
    }
    unlisted = (out.unlisted_medical_statements || []).map(String).filter((s) => s.trim());
    for (const it of items) if (verdicts[it.index].verdict === 'supported') await saveCheck(db, verdicts[it.index].key, 'supported', verdicts[it.index].reason);
    if (!unlisted.length) await saveCheck(db, bKey, 'supported', 'no unlisted medical statements');
  }
  for (const v of verdicts) { delete v.key; delete v.cached; }
  const ok = claims.length > 0 && verdicts.every((v) => v.verdict === 'supported') && unlisted.length === 0;
  return { ok, verdicts, unlisted };
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 220);
export function verdictTable(verdicts) {
  if (!verdicts.length) return '_No claims._';
  return ['| # | Claim | Source | Verdict | Reason |', '|---|---|---|---|---|',
    ...verdicts.map((v, i) => `| ${i + 1} | ${cell(v.claim)} | [^${cell(v.source)}] | ${v.verdict === 'supported' ? '✅' : '❌'} ${v.verdict} | ${cell(v.reason)} |`)].join('\n');
}

export function gateReport(g) {
  return [
    ...g.checks.map((c) => `- ${c.ok ? '✅' : '❌'} **${c.name}**: ${c.detail}`),
    '', '### Fact-check verdicts', verdictTable(g.verdicts),
    ...(g.unlisted.length ? ['', '**Medical statements not listed in `claims`:**', ...g.unlisted.map((s) => `- ${s}`)] : [])
  ].join('\n');
}

/** Runs all four checks on the checkout. Leaves the post files set to approved + rebuilt (caller pushes only on pass). */
export async function runChecks(dir, posts, { env, deps, db }) {
  const checks = [];
  const verdicts = [];
  const unlisted = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });
  const texts = {};
  for (const rel of posts) {
    const text = await readFile(path.join(dir, rel), 'utf8');
    texts[rel] = text;
    const post = parsePost(text);
    const slug = path.basename(rel, '.md');
    const { dropped } = await verifySources(post.sources || [], { fetchImpl: deps.fetch });
    add(`sources resolve (${slug})`, dropped.length === 0 && (post.sources || []).length > 0,
      dropped.length ? dropped.map((d) => `${d.source.url} (${d.reason})`).join(', ') : `${(post.sources || []).length} sources resolved`);
    const lint = claimsLint(post);
    add(`claims lint (${slug})`, lint.length === 0, lint.length ? lint.join('; ') : 'clean');
    let fc;
    try { fc = await factCheck(post, { env, fetchImpl: deps.fetch, completeImpl: deps.complete, db }); }
    catch (e) { fc = { ok: false, verdicts: [], unlisted: [`fact-check error: ${e.message}`] }; }
    verdicts.push(...fc.verdicts.map((v) => ({ ...v, slug })));
    unlisted.push(...fc.unlisted);
    const bad = fc.verdicts.filter((v) => v.verdict !== 'supported').length;
    add(`independent fact-check (${slug})`, fc.ok,
      fc.ok ? `${fc.verdicts.length}/${fc.verdicts.length} claims supported` : `${bad} of ${fc.verdicts.length} claims not supported${fc.unlisted.length ? `; ${fc.unlisted.length} unlisted medical statement(s)` : ''}${fc.verdicts.length ? '' : '; no claims listed'}`);
  }
  for (const rel of posts) await writeFile(path.join(dir, rel), setApproval(texts[rel], AUTO_APPROVER, todayNY()));
  const buildNote = await deps.buildBlog(dir);
  const chk = await deps.checkBlog(dir);
  add('build-blog.mjs --check', chk.ok, chk.ok ? chk.detail : `${buildNote}; ${chk.detail}`);
  return { pass: posts.length > 0 && checks.every((c) => c.ok), checks, verdicts, unlisted };
}

export async function waitForChecks(sha, { env, deps }) {
  const repo = GH.repoName(env);
  const timeout = Number(env.GATE_CI_TIMEOUT_MS || 20 * 60_000);
  const every = Number(env.GATE_CI_POLL_MS || 30_000);
  const start = deps.now();
  for (;;) {
    const r = await deps.gh('GET', `/repos/${repo}/commits/${sha}/check-runs?per_page=100`, null, env);
    const runs = (r && r.check_runs) || [];
    const bad = runs.filter((c) => c.status === 'completed' && !['success', 'neutral', 'skipped'].includes(c.conclusion));
    if (bad.length) return { state: 'failure', detail: bad.map((c) => `${c.name}: ${c.conclusion}`).join(', ') };
    if (runs.length && runs.every((c) => c.status === 'completed')) return { state: 'success', detail: runs.map((c) => c.name).join(', ') };
    if (deps.now() - start >= timeout) return { state: 'timeout', detail: runs.length ? 'checks still running' : 'no checks reported yet' };
    await deps.sleep(every);
  }
}

const defaultDeps = () => ({
  gh: GH.gh, withCheckout: GH.withCheckout, buildBlog: GH.buildBlog, checkBlog: GH.checkBlog, commitAndPush: GH.commitAndPush,
  headSha: GH.headSha, upsertIssue: GH.upsertIssue, fetch: globalThis.fetch, complete: undefined,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now()
});

async function record(db, pr, { slugs = [], sha, outcome, mode = 'auto', checks = null, verdicts = null, detail = '' }) {
  await db.query('INSERT INTO gate_results (pr_number, slugs, head_sha, outcome, mode, checks, verdicts, detail) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [pr.number, slugs.join(','), sha || null, outcome, mode, checks ? JSON.stringify(checks) : null, verdicts ? JSON.stringify(verdicts) : null, String(detail).slice(0, 4000)]);
}

async function postFiles(pr, env, deps) {
  const files = await deps.gh('GET', `/repos/${GH.repoName(env)}/pulls/${pr.number}/files?per_page=100`, null, env);
  return files.map((f) => f.filename).filter((f) => /^content\/posts\/[a-z0-9-]+\.md$/.test(f));
}

async function hold(db, pr, { env, deps, slugs, sha, why, report, checks, verdicts, mode = 'auto' }) {
  const repo = GH.repoName(env);
  const owner = repo.split('/')[0];
  try { await deps.gh('POST', `/repos/${repo}/labels`, { name: 'needs-review', color: 'd73a4a' }, env); } catch {}
  await deps.gh('POST', `/repos/${repo}/issues/${pr.number}/labels`, { labels: ['needs-review'] }, env);
  const body = `**Held by the automated approval gate — not merged.** ${why}\n\n${report || ''}\n\nFix the branch (the gate re-runs on the next hourly run after a new commit) or, as repo owner, comment \`/approve\` to override.`;
  await deps.gh('POST', `/repos/${repo}/issues/${pr.number}/comments`, { body }, env);
  await deps.upsertIssue({ title: `Blog PR #${pr.number} held for review`, label: 'needs-review', assignees: [owner],
    body: `@${owner} PR ${pr.html_url || '#' + pr.number} (${slugs.join(', ')}) was held by the automated approval gate.\n\n${why}\n\n${report || ''}` }, env);
  await record(db, pr, { slugs, sha, outcome: 'held', mode, checks, verdicts, detail: why });
  return { pr: pr.number, outcome: 'held', why };
}

/** Waits for green CI on sha, then squash-merges and deletes the branch. */
async function finish(db, pr, { env, deps, sha, slugs, mode }) {
  const repo = GH.repoName(env);
  const ci = await waitForChecks(sha, { env, deps });
  if (ci.state === 'timeout') return { pr: pr.number, outcome: 'approved', pending: `CI ${ci.detail}; retry next hourly run` };
  if (ci.state === 'failure') return hold(db, pr, { env, deps, slugs, sha, mode, why: `CI checks failed: ${ci.detail}.` });
  try {
    await deps.gh('PUT', `/repos/${repo}/pulls/${pr.number}/merge`, { merge_method: 'squash', sha, commit_title: `${pr.title} (#${pr.number})` }, env);
  } catch (e) {
    return hold(db, pr, { env, deps, slugs, sha, mode, why: `Merge failed: ${e.message.slice(0, 300)}` });
  }
  try { await deps.gh('DELETE', `/repos/${repo}/git/refs/heads/${pr.head.ref}`, null, env); } catch {}
  for (const s of slugs) await db.query("UPDATE posts SET status = 'published', updated_at = now() WHERE slug = $1", [s]);
  await record(db, pr, { slugs, sha, outcome: 'merged', mode, detail: `CI green (${ci.detail}); squash-merged` });
  try {
    const open = await deps.gh('GET', `/repos/${repo}/issues?state=open&labels=needs-review&per_page=100`, null, env);
    const iss = (open || []).find((i) => i.title === `Blog PR #${pr.number} held for review` && !i.pull_request);
    if (iss) await deps.gh('PATCH', `/repos/${repo}/issues/${iss.number}`, { state: 'closed' }, env);
  } catch {}
  return { pr: pr.number, outcome: 'merged', mode };
}

/** Old human-only flow: on owner /approve, approve + rebuild + push. Never merges. */
async function legacyApprove(db, pr, c, { env, deps }) {
  const repo = GH.repoName(env);
  const today = todayNY();
  const approver = env.APPROVER_NAME || c.user.login;
  const res = await deps.withCheckout(async (dir) => {
    const posts = await postFiles(pr, env, deps);
    for (const rel of posts) { const p = path.join(dir, rel); await writeFile(p, setApproval(await readFile(p, 'utf8'), approver, today)); }
    const buildNote = await deps.buildBlog(dir);
    const pushed = await deps.commitAndPush(dir, pr.head.ref, `Approve post (${approver})`);
    return { posts, buildNote, pushed };
  }, { branch: pr.head.ref, env });
  await deps.gh('POST', `/repos/${repo}/issues/${pr.number}/comments`, { body: `Approved by engine on behalf of @${c.user.login}: set \`status: approved\`, \`approved_by: ${approver}\`, \`updated: ${today}\` in ${res.posts.join(', ')}.\nBuild: ${res.buildNote}\n\nReady to merge — merging deploys to production.` }, env);
  for (const rel of res.posts) await db.query("UPDATE posts SET status = 'approved', updated_at = now() WHERE slug = $1", [path.basename(rel, '.md')]);
  return { pr: pr.number, outcome: 'approved', mode: 'manual' };
}

export async function processPr(db, pr, { env = process.env, deps: d = {}, log = console } = {}) {
  const deps = { ...defaultDeps(), ...d };
  const repo = GH.repoName(env);
  const owner = repo.split('/')[0];
  const comments = await deps.gh('GET', `/repos/${repo}/issues/${pr.number}/comments?per_page=100`, null, env);
  const c = findApproval(comments, owner);
  const override = c && !comments.some((x) => /^Approved by engine/.test(x.body || '') && new Date(x.created_at) > new Date(c.created_at)) ? c : null;
  if (!autoPublish(env)) return override ? legacyApprove(db, pr, override, { env, deps }) : null;

  const last = (await db.query('SELECT * FROM gate_results WHERE pr_number = $1 ORDER BY id DESC LIMIT 1', [pr.number])).rows[0];
  if (last && last.outcome === 'merged') return null;
  if (last && last.outcome === 'approved' && !override) {
    return finish(db, pr, { env, deps, sha: last.head_sha, slugs: String(last.slugs || '').split(',').filter(Boolean), mode: last.mode });
  }
  const today = todayNY();
  if (override) {
    const approver = env.APPROVER_NAME || override.user.login;
    const res = await deps.withCheckout(async (dir) => {
      const posts = await postFiles(pr, env, deps);
      for (const rel of posts) { const p = path.join(dir, rel); await writeFile(p, setApproval(await readFile(p, 'utf8'), approver, today)); }
      const buildNote = await deps.buildBlog(dir);
      await deps.commitAndPush(dir, pr.head.ref, `Approve post (${approver}, manual override)`);
      return { posts, buildNote, sha: await deps.headSha(dir) };
    }, { branch: pr.head.ref, env });
    const slugs = res.posts.map((r) => path.basename(r, '.md'));
    await deps.gh('POST', `/repos/${repo}/issues/${pr.number}/comments`, { body: `Approved by engine on behalf of @${override.user.login} (manual override): set \`status: approved\`, \`approved_by: ${approver}\`, \`updated: ${today}\`.\nBuild: ${res.buildNote}\n\nMerging once CI is green.` }, env);
    for (const s of slugs) await db.query("UPDATE posts SET status = 'approved', updated_at = now() WHERE slug = $1", [s]);
    await record(db, pr, { slugs, sha: res.sha, outcome: 'approved', mode: 'override', detail: `owner /approve by ${override.user.login}` });
    log.log(`[gate] PR #${pr.number} manual override`);
    return finish(db, pr, { env, deps, sha: res.sha, slugs, mode: 'override' });
  }
  if (last && last.outcome === 'held' && last.head_sha === pr.head.sha) return null; // already gated; waits for a new commit or /approve
  // The fact-check is essential spend: it runs past the monthly budget, but not past the 1.5x hard ceiling.
  const budget = await checkBudget(db, 'gate', { env });
  if (!budget.ok) { log.log(`[gate] PR #${pr.number} deferred: AI budget ceiling`); return { pr: pr.number, outcome: 'deferred', reason: 'budget' }; }

  const res = await deps.withCheckout(async (dir) => {
    const posts = await postFiles(pr, env, deps);
    const g = await runChecks(dir, posts, { env, deps, db });
    let sha = pr.head.sha;
    if (g.pass) { await deps.commitAndPush(dir, pr.head.ref, 'Auto-approve post (approval gate passed)'); sha = await deps.headSha(dir); }
    return { ...g, posts, sha };
  }, { branch: pr.head.ref, env });
  const slugs = res.posts.map((r) => path.basename(r, '.md'));
  const report = gateReport(res);
  if (!res.pass) {
    log.log(`[gate] PR #${pr.number} held`);
    return hold(db, pr, { env, deps, slugs, sha: pr.head.sha, report, checks: res.checks, verdicts: res.verdicts,
      why: `Failing: ${res.checks.filter((x) => !x.ok).map((x) => x.name).join(', ') || 'no post files in PR'}.` });
  }
  await deps.gh('POST', `/repos/${repo}/issues/${pr.number}/comments`, { body: `Approved by engine (automated approval gate passed): \`status: approved\`, \`approved_by: ${AUTO_APPROVER}\`, \`updated: ${today}\`. Merging once CI is green.\n\n${report}` }, env);
  for (const s of slugs) await db.query("UPDATE posts SET status = 'approved', updated_at = now() WHERE slug = $1", [s]);
  await record(db, pr, { slugs, sha: res.sha, outcome: 'approved', checks: res.checks, verdicts: res.verdicts, detail: 'all gate checks passed' });
  log.log(`[gate] PR #${pr.number} passed`);
  return finish(db, pr, { env, deps, sha: res.sha, slugs, mode: 'auto' });
}

/** Gates one PR right after draft/optimize opened it. */
export async function gateOne({ db, env = process.env, log = console, number, deps = {} }) {
  const gh = deps.gh || GH.gh;
  const pr = await gh('GET', `/repos/${GH.repoName(env)}/pulls/${number}`, null, env);
  return processPr(db, pr, { env, deps, log });
}

export async function run({ db, env = process.env, log = console, deps: d = {} }) {
  if (!GH.githubConfigured(env)) return { skipped: 'not configured: GITHUB_TOKEN' };
  const deps = { ...defaultDeps(), ...d };
  const repo = GH.repoName(env);
  const prs = (await deps.gh('GET', `/repos/${repo}/pulls?state=open&per_page=100`, null, env)).filter((p) => p.head.ref.startsWith('blog/') && p.head.repo && p.head.repo.full_name === repo);
  const results = [];
  const errors = [];
  for (const pr of prs) {
    try { const r = await processPr(db, pr, { env, deps, log }); if (r) results.push(r); }
    catch (e) { errors.push(`PR #${pr.number}: ${e.message}`); }
  }
  // Mark posts merged by hand as published.
  const tracked = (await db.query("SELECT slug, pr_number FROM posts WHERE status <> 'published' AND pr_number IS NOT NULL")).rows;
  for (const t of tracked) {
    const pr = await deps.gh('GET', `/repos/${repo}/pulls/${t.pr_number}`, null, env);
    if (pr && pr.merged_at) await db.query("UPDATE posts SET status = 'published', updated_at = now() WHERE slug = $1", [t.slug]);
  }
  if (errors.length) throw new Error(errors.join(' | ')); // scheduler retries + alerts
  return { checked: prs.length, autoPublish: autoPublish(env), results };
}
