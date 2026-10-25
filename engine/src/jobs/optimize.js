// Weekly: pick the post with the best refresh opportunity and open a refresh PR (same approval flow).
import { batchComplete, extractJson, llmConfigured, BRAND_RULES } from '../llm.js';
import { checkBudget, budgetSkip } from '../cost.js';
import { gh, repoName, githubConfigured } from '../github.js';
import { parsePost, serializePost } from '../frontmatter.js';
import { openPostPr } from './publish.js';
import { lintPost } from './draft.js';
import { autoPublish, gateOne } from './gate.js';

/** rows: [{ slug, impressions, clicks, position, views, signups }] -> [{ slug, reason, priority }] */
export function findCandidates(rows) {
  const out = [];
  for (const r of rows) {
    const ctr = r.impressions ? r.clicks / r.impressions : 0;
    const reasons = [];
    let p = 0;
    if (r.impressions >= 100 && ctr < 0.02) { reasons.push(`high impressions (${r.impressions}) / low CTR (${(ctr * 100).toFixed(1)}%)`); p += 3; }
    if (r.position >= 5 && r.position <= 20 && r.impressions >= 20) { reasons.push(`avg position ${r.position.toFixed(1)}`); p += 2; }
    if (r.views >= 100 && r.signups / r.views < 0.01) { reasons.push(`low signup rate (${r.signups}/${r.views} views)`); p += 2; }
    if (reasons.length) out.push({ slug: r.slug, reason: reasons.join('; '), priority: p + Math.log10(1 + r.impressions) });
  }
  return out.sort((a, b) => b.priority - a.priority);
}

export const minImpressions = (env = process.env) => Number(env.OPTIMIZE_MIN_IMPRESSIONS ?? 200);

export async function run({ db, env = process.env, log, deps = {} }) {
  const d = { gh, openPr: openPostPr, gate: gateOne, fetchImpl: undefined, ...deps };
  if (!llmConfigured(env)) return { skipped: 'not configured: ANTHROPIC_API_KEY / OPENAI_API_KEY' };
  if (!githubConfigured(env)) return { skipped: 'not configured: GITHUB_TOKEN' };
  const posts = (await db.query("SELECT slug FROM posts WHERE status = 'published' AND (updated_at < now() - interval '21 days')")).rows;
  if (!posts.length) return { skipped: 'no published posts old enough to refresh' };
  const rows = [];
  for (const { slug } of posts) {
    const g = (await db.query(
      `SELECT COALESCE(SUM(impressions),0)::int AS impressions, COALESCE(SUM(clicks),0)::int AS clicks,
              COALESCE(SUM(position*impressions)/NULLIF(SUM(impressions),0),0) AS position
       FROM metrics_daily WHERE provider='gsc' AND day > CURRENT_DATE - 28 AND page LIKE $1`, [`%/blog/${slug}%`])).rows[0];
    const v = (await db.query("SELECT COALESCE(SUM(count),0)::int AS n FROM events WHERE type='pageview' AND day > CURRENT_DATE - 28 AND path LIKE $1", [`/blog/${slug}%`])).rows[0];
    const s = (await db.query("SELECT COUNT(*)::int AS n FROM signups WHERE created_at > now() - interval '28 days' AND source LIKE $1", [`blog:${slug}:%`])).rows[0];
    rows.push({ slug, impressions: g.impressions, clicks: g.clicks, position: Number(g.position), views: v.n, signups: s.n });
  }
  // Only spend on the LLM once a post has enough Search Console data (>= 200 impressions in 28 days by default).
  const min = minImpressions(env);
  const enough = rows.filter((r) => r.impressions >= min);
  if (!enough.length) return { skipped: 'not enough data', minImpressions: min, checked: rows.length };
  const [cand] = findCandidates(enough);
  if (!cand) return { skipped: 'no post meets refresh criteria', checked: rows.length };
  const budget = await checkBudget(db, 'optimize', { env });
  const saved = (await db.query("SELECT id, suggestion FROM optimize_suggestions WHERE slug = $1 AND NOT used AND created_at > now() - interval '14 days' ORDER BY id DESC LIMIT 1", [cand.slug])).rows[0];
  if (!saved && !budget.ok) return budgetSkip(budget);
  const repo = repoName(env);
  const file = await d.gh('GET', `/repos/${repo}/contents/content/posts/${cand.slug}.md`, null, env);
  const post = parsePost(Buffer.from(file.content, 'base64').toString('utf8'));
  const queries = (await db.query(
    "SELECT query, SUM(impressions)::int AS impressions FROM metrics_daily WHERE provider='gsc' AND page LIKE $1 AND day > CURRENT_DATE - 28 GROUP BY query ORDER BY 2 DESC LIMIT 20", [`%/blog/${cand.slug}%`])).rows;
  let imp, suggestionId;
  if (saved) { imp = saved.suggestion; suggestionId = saved.id; log.log(`[optimize] reusing stored suggestion for ${cand.slug}`); }
  else {
  const out = await batchComplete({ db, env, job: 'optimize', key: cand.slug, fetchImpl: d.fetchImpl,
    system: `You are an SEO/AEO editor for Back2SleepNow.com. ${BRAND_RULES}`,
    prompt: `Improve this post's search snippet and answer-engine readiness. Problem: ${cand.reason}. Queries it ranks for: ${JSON.stringify(queries)}.
Current title: ${post.title}\nCurrent description: ${post.description}\nCurrent answer: ${post.answer}\nCurrent FAQ: ${JSON.stringify(post.faq)}\nSources (only these may back claims): ${JSON.stringify(post.sources)}
Return JSON {"title","description" (150-160 chars),"answer" (40-60 words),"faq":[{"q","a"}],"new_claims":[{"text","source"}]} — keep claims inside the existing sources, no efficacy claims.` });
  if (out.pending) { log.log(`[optimize] batch ${out.batchId} pending`); return { pending: 'batch', batchId: out.batchId, slug: cand.slug }; }
  imp = extractJson(out.text);
  suggestionId = (await db.query('INSERT INTO optimize_suggestions (slug, suggestion) VALUES ($1,$2) RETURNING id', [cand.slug, JSON.stringify(imp)])).rows[0].id;
  }
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const updated = {
    ...post,
    title: imp.title || post.title, description: imp.description || post.description, answer: imp.answer || post.answer,
    faq: Array.isArray(imp.faq) && imp.faq.length ? imp.faq.filter((f) => f.q && f.a) : post.faq,
    claims: [...(post.claims || []), ...((imp.new_claims || []).filter((c) => c && c.text))],
    updated: today, status: 'draft', approved_by: ''
  };
  const issues = lintPost({ ...updated, sources: updated.sources || [], claims: updated.claims, secondary_keywords: updated.secondary_keywords || [] });
  const notes = `\n\n**Note:** status is reset to \`draft\` until approved${autoPublish(env) ? ' by the gate (or `/approve`)' : ''} — merging without approving would unpublish the post.${issues.length ? `\n\n## ⚠️ Automated checks\n${issues.map((i) => `- ${i}`).join('\n')}` : ''}`;
  const r = await d.openPr({ db, env, post: updated, fileText: serializePost(updated), dropped: [], kind: 'refresh', reason: cand.reason, notes, log });
  await db.query('UPDATE optimize_suggestions SET used = true WHERE id = $1', [suggestionId]);
  if (r.number && autoPublish(env)) {
    try { r.gate = await d.gate({ db, env, log, number: r.number }); }
    catch (e) { r.gate = { error: e.message.slice(0, 500), retry: 'next hourly gate run' }; log.error(`[gate] PR #${r.number}: ${e.message}`); }
  }
  return r;
}
