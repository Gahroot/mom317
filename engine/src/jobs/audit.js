// Weekly quality audit: re-checks published articles against the current fact-checker (standards tighten,
// sources change). A post that no longer passes gets a refresh PR, which goes through the normal approval gate:
// self-revision from the verdicts, then auto-merge on pass or a needs-review hold. The live version stays up meanwhile.
import { gh, repoName, githubConfigured } from '../github.js';
import { parsePost, serializePost } from '../frontmatter.js';
import { llmConfigured } from '../llm.js';
import { openPostPr } from './publish.js';
import { autoPublish, gateOne, factCheck, claimsLint } from './gate.js';

export const auditEveryDays = (env = process.env) => Number(env.AUDIT_EVERY_DAYS ?? 30);
export const auditMaxPerRun = (env = process.env) => Math.max(1, Number(env.AUDIT_MAX_PER_RUN ?? 2));

/** Published posts on main: [{ slug, post, text }] */
async function publishedPosts(env, ghImpl) {
  const repo = repoName(env);
  const files = await ghImpl('GET', `/repos/${repo}/contents/content/posts?ref=main`, null, env);
  const out = [];
  for (const f of Array.isArray(files) ? files : []) {
    if (!/\.md$/.test(f.name)) continue;
    const file = await ghImpl('GET', `/repos/${repo}/contents/content/posts/${encodeURIComponent(f.name)}?ref=main`, null, env);
    const text = Buffer.from(file.content || '', 'base64').toString('utf8');
    const post = parsePost(text);
    if (post.status === 'approved') out.push({ slug: post.slug || f.name.replace(/\.md$/, ''), post, text });
  }
  return out;
}

export async function run({ db, env = process.env, log = console, deps = {} }) {
  const d = { gh, openPr: openPostPr, gate: gateOne, factCheck, ...deps };
  if (!llmConfigured(env)) return { skipped: 'not configured: LLM' };
  if (!githubConfigured(env)) return { skipped: 'not configured: GITHUB_TOKEN' };
  const repo = repoName(env);
  const open = await d.gh('GET', `/repos/${repo}/pulls?state=open&per_page=100`, null, env);
  const busy = new Set((open || []).map((p) => (p.head && p.head.ref) || '').filter((r) => r.startsWith('blog/')).map((r) => r.slice(5).replace(/-refresh-\d{4}-\d{2}-\d{2}$/, '')));
  const posts = await publishedPosts(env, d.gh);
  const cutoff = new Date(Date.now() - auditEveryDays(env) * 86_400_000);
  const recent = new Set((await db.query('SELECT DISTINCT slug FROM post_audits WHERE checked_at > $1', [cutoff])).rows.map((r) => r.slug));
  const due = posts.filter((p) => !recent.has(p.slug) && !busy.has(p.slug));
  if (!due.length) return { skipped: 'every published post was audited recently or has an open PR', posts: posts.length };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const results = [];
  for (const { slug, post } of due.slice(0, auditMaxPerRun(env))) {
    const fc = await d.factCheck(post, { env, db }); // DeferError (Codex unavailable) propagates: whole run retried in an hour
    const lint = claimsLint(post);
    const bad = fc.verdicts.filter((v) => v.verdict !== 'supported');
    if (fc.ok && !lint.length) {
      await db.query('INSERT INTO post_audits (slug, ok, detail) VALUES ($1, true, $2)', [slug, `${fc.verdicts.length} claims supported`]);
      results.push({ slug, ok: true });
      continue;
    }
    const reason = [bad.length ? `${bad.length} of ${fc.verdicts.length} claims not fully supported by their sources` : '', fc.unlisted.length ? `${fc.unlisted.length} medical statement(s) not listed as claims` : '', lint.length ? `lint: ${lint.length} issue(s)` : '']
      .filter(Boolean).join('; ');
    const draft = { ...post, updated: today, status: 'draft', approved_by: '' };
    const notes = `\n\n**Quality audit:** the published version no longer passes the current fact-check (${reason}). The live article stays up; the gate revises this draft from the verdicts and merges it only if it passes.`;
    const r = await d.openPr({ db, env, post: draft, fileText: serializePost(draft), dropped: [], kind: 'refresh', reason: `quality audit: ${reason}`, notes, log });
    await db.query('INSERT INTO post_audits (slug, ok, detail, pr_number) VALUES ($1, false, $2, $3)', [slug, reason, r.number || null]);
    if (r.number && autoPublish(env)) {
      try { r.gate = await d.gate({ db, env, log, number: r.number }); }
      catch (e) {
        if (e && e.defer) throw e;
        r.gate = { error: e.message.slice(0, 500), retry: 'next hourly gate run' };
        log.error(`[gate] PR #${r.number}: ${e.message}`);
      }
    }
    log.log(`[audit] ${slug}: ${reason} -> PR #${r.number}`);
    results.push({ slug, ok: false, reason, pr: r.number, gate: r.gate && (r.gate.outcome || r.gate.error) });
  }
  return { audited: results.length, results };
}
