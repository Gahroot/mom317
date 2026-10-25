import { completeJson, llmConfigured, BRAND_RULES } from '../llm.js';
import { serializePost, parsePost, dropSources, slugify, citedIds } from '../frontmatter.js';
import { checkBudget, budgetSkip } from '../cost.js';
import { verifySources } from '../sources.js';
import { githubConfigured } from '../github.js';
import { openPostPr } from './publish.js';
import { autoPublish, gateOne } from './gate.js';
import { existingArticles, duplicateOf } from '../existing.js';

const FORBIDDEN = /\b(cures?|treats?|clinically proven|guaranteed|works in minutes)\b/i;

/** Normalises LLM output into a contract-shaped post object. */
export function buildPost(raw, { today, keyword }) {
  const slug = slugify(raw.slug || raw.title);
  if (!slug) throw new Error('post has no title/slug');
  let desc = String(raw.description || '').trim();
  if (desc.length > 160) desc = desc.slice(0, 157).replace(/\s+\S*$/, '') + '…';
  return {
    title: String(raw.title).trim(),
    slug,
    description: desc,
    date: today,
    updated: today,
    status: 'draft',
    approved_by: '',
    primary_keyword: String(raw.primary_keyword || keyword).trim().toLowerCase(),
    secondary_keywords: (raw.secondary_keywords || []).map(String).slice(0, 8),
    answer: String(raw.answer || '').trim(),
    faq: (raw.faq || []).filter((f) => f && f.q && f.a).slice(0, 8).map((f) => ({ q: f.q, a: f.a })),
    sources: (raw.sources || []).map((s, i) => ({ id: Number(s.id) || i + 1, title: s.title, publisher: s.publisher, year: s.year, url: s.url })),
    claims: (raw.claims || []).filter((c) => c && c.text).map((c) => ({ text: c.text, source: c.source ?? '' })),
    body: String(raw.body || '').trim()
  };
}

/** Checks a post after source verification; returns a list of problems (flagged in the PR, never silently shipped). */
export function lintPost(post) {
  const issues = [];
  const ids = new Set(post.sources.map((s) => String(s.id)));
  for (const id of citedIds(post.body)) if (!ids.has(id)) issues.push(`citation [^${id}] has no source`);
  for (const c of post.claims) if (!ids.has(String(c.source))) issues.push(`unsourced claim: ${c.text}`);
  const words = post.answer.split(/\s+/).filter(Boolean).length;
  if (words < 30 || words > 70) issues.push(`answer is ${words} words (target 40-60)`);
  if (post.description.length < 120 || post.description.length > 160) issues.push(`description is ${post.description.length} chars`);
  if (FORBIDDEN.test(post.body + ' ' + post.answer)) issues.push('possible efficacy/cure language — review carefully');
  if (!/^##\s+.+\?\s*$/m.test(post.body)) issues.push('no question-style H2');
  return issues;
}

// Static system prompt (voice + brand rules + editorial guidelines): sent as a cached block (prompt caching).
export const DRAFT_SYSTEM = `You are Marian Grout, founder of 3:17, writing for Back2SleepNow.com. Voice: warm, plain-spoken, first person where natural, a woman who has been there; evidence-first, never salesy. ${BRAND_RULES}
Editorial guidelines for every evidence-backed blog post:
- 1,200-1,800 word Markdown body. Open with a short empathetic paragraph, then H2s phrased as the reader's questions (end with "?"), H3s where useful.
- Cite with [^n] markers matching source ids. 4-8 sources, ONLY real peer-reviewed papers or NAMS/NIH/ACOG/AASM/CDC/NHS/Cochrane pages with exact URLs you are certain exist (DOI or PubMed preferred).
- "answer": 40-60 word direct answer to the title question. "description": 150-160 characters.
- 4-6 FAQ items (1-3 sentence answers).
- "claims": EVERY sentence in the body, answer or FAQ that states a medical/health fact (causes, symptoms, prevalence, risks, what a treatment does, what a guideline or society recommends) must appear in "claims", each with the id of ONE source that states it directly. An independent fact-checker will compare each claim with that source's abstract/summary and will hold the post if a claim is missing, overstated or not in the source.
- Write claims conservatively: say only what the cited source's abstract or summary actually says (same strength, same hedging, same population). Prefer "is linked with" over "causes" unless the source says causes. Don't add numbers the source doesn't give.
- Cite the specific page that contains the statement (e.g. a NICE recommendations page, not a guideline overview; a paper's DOI or PubMed URL, not a journal home page). A guideline/position statement's recommendation should be cited to that statement's DOI or PubMed record.
- Practical tips that aren't medical facts (e.g. "keep a glass of water by the bed") are fine without a citation only if phrased as personal suggestions ("What helped me…", "Some women find…") and making no health claim.
- Never put 3:17, "the sleep shot" or the waitlist in the same sentence as words like fix, help, treat, relieve, work, improve or cure.
- End with a short, non-promotional note that 3:17 is building a middle-of-the-night sleep shot for women in menopause and readers can join the founding list. No efficacy claims. Add "This is general information, not medical advice."
Return JSON: {"title","slug","description","primary_keyword","secondary_keywords":[],"answer","faq":[{"q","a"}],"sources":[{"id","title","publisher","year","url"}],"claims":[{"text","source"}],"body"}`;

export async function writeDraft({ env, opportunity, today, extra = '', db, completeImpl = completeJson }) {
  return completeImpl(
    DRAFT_SYSTEM,
    `Write an evidence-backed blog post following the editorial guidelines.
Target keyword: ${opportunity.keyword}
Working title: ${opportunity.title || ''}
Angle / gap: ${opportunity.angle || ''}
${extra}`,
    { env, db, job: 'draft', cacheSystem: true }
  ).then((raw) => buildPost(raw, { today, keyword: opportunity.keyword }));
}

export async function finalizePost(post, { fetchImpl } = {}) {
  const { verified, dropped } = await verifySources(post.sources, { fetchImpl });
  const cleaned = dropSources({ ...post, sources: verified }, dropped.map((d) => d.source.id));
  return { post: cleaned, dropped, issues: lintPost(cleaned) };
}

/** Claims or citations left without a source (e.g. after unverifiable sources were dropped). */
export function orphanIssues(issues) {
  return issues.filter((i) => /^unsourced claim:|^citation \[\^\d+\] has no source/.test(i));
}

/**
 * One repair pass: ask the writer to back each orphaned claim with a different real source or remove it.
 * Never more than one extra LLM call per draft.
 */
export async function repairDraft({ env, db, post, dropped, issues, today, completeImpl = completeJson }) {
  const failed = (dropped || []).map((d) => `${d.source.url} (${d.reason || 'did not resolve'})`);
  const raw = await completeImpl(
    DRAFT_SYSTEM,
    `This draft has claims or citations without a working source.
Sources removed because their URL did not resolve: ${JSON.stringify(failed)}
Problems: ${JSON.stringify(orphanIssues(issues))}
Return the COMPLETE post JSON again (same fields). For each problem, either cite a DIFFERENT real, verifiable source you are certain exists (DOI, PubMed, NHS, NIH/NIA, The Menopause Society, ACOG, AASM, CDC, NICE) with a matching [^n] marker and a claims entry, or remove the statement from both the body and claims. Every claims entry must have a "source" id that exists in sources. Keep everything else unchanged.
Current post JSON:
${JSON.stringify(post)}`,
    { env, db, job: 'draft', cacheSystem: true }
  );
  return { ...buildPost(raw, { today, keyword: post.primary_keyword }), slug: post.slug };
}

/**
 * Rewrite a post from the approval gate's feedback (fact-check verdicts, unlisted medical statements,
 * lint problems, unverifiable sources). One LLM call; the caller re-verifies and re-gates the result.
 */
export async function reviseFromFeedback({ env, db, post, verdicts = [], unlisted = [], lint = [], dropped = [], completeImpl = completeJson }) {
  const bad = verdicts.filter((v) => v.verdict !== 'supported').map((v) => ({ claim: v.claim || v.text, source: v.source, verdict: v.verdict, reason: v.reason }));
  const raw = await completeImpl(
    DRAFT_SYSTEM,
    `An independent fact-checker compared this post with each cited source's abstract/summary and held it. Fix EVERY problem below, then return the COMPLETE post JSON (same fields).
- Claims judged overstated or unsupported: rewrite the claim AND the matching sentence(s) in the body/answer/FAQ so they say only what the source supports (same strength and hedging), OR cite a different real source that states it directly, OR remove the statement everywhere.
- Medical statements found in the post but missing from "claims": add each to "claims" with a source that states it, OR rephrase it as plain personal experience with no health claim, OR remove it.
- Lint problems: fix them (e.g. never put 3:17 / the sleep shot near words like fix, help, treat, relieve, work).
- Sources listed as unverifiable must not be used again.
Keep the title, slug, voice and structure unless a fix requires changing them. Every "claims" entry needs a "source" id that exists in "sources", and every [^n] marker must match a source id.
Claim verdicts: ${JSON.stringify(bad)}
Unlisted medical statements: ${JSON.stringify(unlisted)}
Lint problems: ${JSON.stringify(lint)}
Unverifiable sources: ${JSON.stringify(dropped)}
Current post JSON:
${JSON.stringify(post)}`,
    { env, db, job: 'draft', cacheSystem: true }
  );
  const next = buildPost(raw, { today: post.date, keyword: post.primary_keyword });
  return { ...next, slug: post.slug, date: post.date, updated: post.updated || post.date };
}

export async function run({ db, env = process.env, log, deps = {} }) {
  if (!llmConfigured(env)) return { skipped: 'not configured: ANTHROPIC_API_KEY / OPENAI_API_KEY' };
  if (!githubConfigured(env)) return { skipped: 'not configured: GITHUB_TOKEN' };
  const d = { complete: completeJson, finalize: finalizePost, openPr: openPostPr, gate: gateOne, ...deps };
  // Pick the best open opportunity that doesn't duplicate an existing article (no keyword cannibalisation).
  const open = (await db.query("SELECT * FROM opportunities WHERE status = 'open' ORDER BY score DESC, created_at LIMIT 30")).rows;
  if (!open.length) return { skipped: 'no open opportunities (run research)' };
  const resumable = new Set((await db.query("SELECT opportunity_id FROM posts WHERE status = 'pending' AND draft_md IS NOT NULL")).rows.map((r) => r.opportunity_id));
  const articles = await (d.existing || existingArticles)({ db, env });
  let opp = null;
  const skippedDupes = [];
  for (const o of open) {
    if (resumable.has(o.id)) { opp = o; break; }
    const dup = duplicateOf(o, articles);
    if (!dup) { opp = o; break; }
    skippedDupes.push(`${o.keyword} ~ ${dup.slug}`);
    await db.query("UPDATE opportunities SET status = 'duplicate', post_slug = $2, updated_at = now() WHERE id = $1", [o.id, dup.slug]);
  }
  if (skippedDupes.length) log.log(`[draft] skipped duplicates: ${skippedDupes.join('; ')}`);
  if (!opp) return { skipped: 'all open opportunities duplicate existing articles (run research)', duplicates: skippedDupes };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  // No double-paying: a draft generated by an earlier (failed) attempt is stored in posts.draft_md and reused.
  const stored = (await db.query("SELECT slug, draft_md FROM posts WHERE opportunity_id = $1 AND status = 'pending' AND draft_md IS NOT NULL ORDER BY created_at DESC LIMIT 1", [opp.id])).rows[0];
  let post;
  if (stored) {
    post = { ...parsePost(stored.draft_md), slug: stored.slug };
    log.log(`[draft] reusing stored draft ${stored.slug}`);
  } else {
    const budget = await checkBudget(db, 'draft', { env });
    if (!budget.ok) return budgetSkip(budget);
    post = await writeDraft({ env, opportunity: opp, today, db, completeImpl: d.complete });
    // A rejected draft never went live: free its slug instead of suffixing the new one with a date.
    await db.query("DELETE FROM posts WHERE slug = $1 AND status = 'rejected'", [post.slug]);
    const taken = await db.query('SELECT 1 FROM posts WHERE slug = $1', [post.slug]);
    if (taken.rows.length) post = { ...post, slug: `${post.slug}-${today.replace(/-/g, '')}` };
    await db.query("INSERT INTO posts (slug, title, primary_keyword, status, kind, draft_md, opportunity_id) VALUES ($1,$2,$3,'pending','new',$4,$5)",
      [post.slug, post.title, post.primary_keyword, serializePost(post), opp.id]);
  }
  let fin = await d.finalize(post);
  if (orphanIssues(fin.issues).length) {
    log.log(`[draft] ${orphanIssues(fin.issues).length} orphaned claim(s)/citation(s); one repair pass`);
    try {
      const repaired = await repairDraft({ env, db, post: fin.post, dropped: fin.dropped, issues: fin.issues, today, completeImpl: d.complete });
      const fin2 = await d.finalize(repaired);
      fin = { ...fin2, dropped: [...fin.dropped, ...fin2.dropped] };
      await db.query('UPDATE posts SET draft_md = $2, updated_at = now() WHERE slug = $1', [post.slug, serializePost(fin.post)]);
    } catch (e) {
      if (e && e.budget) throw e;
      log.error(`[draft] repair failed: ${e.message}`); // keep the original; the gate will hold it
    }
  }
  if (fin.post.sources.length < 2) {
    await db.query("UPDATE posts SET status = 'rejected', updated_at = now() WHERE slug = $1 AND status = 'pending'", [post.slug]);
    throw Object.assign(new Error(`only ${fin.post.sources.length} sources verified; refusing to open PR`), { retryable: false });
  }
  const notes = fin.issues.length ? `\n\n## ⚠️ Automated checks\n${fin.issues.map((i) => `- ${i}`).join('\n')}` : '';
  const r = await d.openPr({ db, env, post: fin.post, fileText: serializePost(fin.post), dropped: fin.dropped, log, notes });
  await db.query("UPDATE opportunities SET status = 'drafted', post_slug = $2, updated_at = now() WHERE id = $1", [opp.id, fin.post.slug]);
  if (r.number && autoPublish(env)) {
    try { r.gate = await d.gate({ db, env, log, number: r.number }); }
    catch (e) { r.gate = { error: e.message.slice(0, 500), retry: 'next hourly gate run' }; log.error(`[gate] PR #${r.number}: ${e.message}`); }
  }
  return { ...r, issues: fin.issues, ...(skippedDupes.length ? { duplicates: skippedDupes } : {}) };
}
