import { completeJson, llmConfigured, BRAND_RULES } from '../llm.js';
import { serializePost, dropSources, slugify, citedIds } from '../frontmatter.js';
import { verifySources } from '../sources.js';
import { githubConfigured } from '../github.js';
import { openPostPr } from './publish.js';

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

export async function writeDraft({ env, opportunity, today, extra = '' }) {
  return completeJson(
    `You are Marian Grout, founder of 3:17, writing for Back2SleepNow.com. Voice: warm, plain-spoken, first person where natural, a woman who has been there; evidence-first, never salesy. ${BRAND_RULES}`,
    `Write an evidence-backed blog post.
Target keyword: ${opportunity.keyword}
Working title: ${opportunity.title || ''}
Angle / gap: ${opportunity.angle || ''}
${extra}
Requirements:
- 1,200-1,800 word Markdown body. Open with a short empathetic paragraph, then H2s phrased as the reader's questions (end with "?"), H3s where useful.
- Cite with [^n] markers matching source ids. 4-8 sources, ONLY real peer-reviewed papers or NAMS/NIH/ACOG/AASM/CDC/NHS/Cochrane pages with exact URLs you are certain exist (DOI or PubMed preferred).
- "answer": 40-60 word direct answer to the title question. "description": 150-160 characters.
- 4-6 FAQ items (1-3 sentence answers).
- "claims": EVERY medical or product statement in the post, each with the id of the source backing it.
- End with a short, non-promotional note that 3:17 is building a middle-of-the-night sleep shot for women in menopause and readers can join the founding list. No efficacy claims. Add "This is general information, not medical advice."
Return JSON: {"title","slug","description","primary_keyword","secondary_keywords":[],"answer","faq":[{"q","a"}],"sources":[{"id","title","publisher","year","url"}],"claims":[{"text","source"}],"body"}`,
    { env, maxTokens: 12000 }
  ).then((raw) => buildPost(raw, { today, keyword: opportunity.keyword }));
}

export async function finalizePost(post, { fetchImpl } = {}) {
  const { verified, dropped } = await verifySources(post.sources, { fetchImpl });
  const cleaned = dropSources({ ...post, sources: verified }, dropped.map((d) => d.source.id));
  return { post: cleaned, dropped, issues: lintPost(cleaned) };
}

export async function run({ db, env = process.env, log }) {
  if (!llmConfigured(env)) return { skipped: 'not configured: ANTHROPIC_API_KEY / OPENAI_API_KEY' };
  if (!githubConfigured(env)) return { skipped: 'not configured: GITHUB_TOKEN' };
  const { rows } = await db.query("SELECT * FROM opportunities WHERE status = 'open' ORDER BY score DESC, created_at LIMIT 1");
  if (!rows.length) return { skipped: 'no open opportunities (run research)' };
  const opp = rows[0];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  let post = await writeDraft({ env, opportunity: opp, today });
  const taken = await db.query('SELECT 1 FROM posts WHERE slug = $1', [post.slug]);
  if (taken.rows.length) post = { ...post, slug: `${post.slug}-${today.replace(/-/g, '')}` };
  const fin = await finalizePost(post);
  if (fin.post.sources.length < 2) throw new Error(`only ${fin.post.sources.length} sources verified; refusing to open PR`);
  const notes = fin.issues.length ? `\n\n## ⚠️ Automated checks\n${fin.issues.map((i) => `- ${i}`).join('\n')}` : '';
  const r = await openPostPr({ db, env, post: fin.post, fileText: serializePost(fin.post), dropped: fin.dropped, log, notes });
  await db.query("UPDATE opportunities SET status = 'drafted', post_slug = $2, updated_at = now() WHERE id = $1", [opp.id, fin.post.slug]);
  return { ...r, issues: fin.issues };
}
