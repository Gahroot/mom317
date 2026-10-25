// Articles that already exist in the repo (content/posts on main), so research and drafting
// never produce a near-duplicate of a live post (keyword cannibalisation).
import { gh, repoName, githubConfigured } from './github.js';
import { parsePost } from './frontmatter.js';

const STOP = new Set(['a', 'an', 'the', 'i', 'do', 'does', 'my', 'me', 'you', 'your', 'is', 'are', 'at', 'in', 'on', 'of', 'to', 'for', 'and', 'or',
  'why', 'what', 'how', 'when', 'can', 'up', 'keep', 'get', 'it', 'with', 'during', 'after', 'about', 'should', 'will', 'am']);

/** Normalise a keyword/title to a set of comparable word stems. */
export function terms(text) {
  const t = String(text || '').toLowerCase()
    .replace(/3\s*a\.?\s*m\.?/g, '3am').replace(/three\s+am/g, '3am')
    .replace(/[^a-z0-9\s]/g, ' ');
  const out = new Set();
  for (let w of t.split(/\s+/)) {
    if (!w || STOP.has(w)) continue;
    if (/^(peri|post)?menopaus/.test(w)) w = 'menopause';
    else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
    else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    if (w === 'wak' || w === 'woke' || w === 'awake') w = 'wake';
    out.add(w);
  }
  return out;
}

export function similarity(a, b) {
  const x = terms(a), y = terms(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}

/** The existing article a keyword/title would duplicate, or null. Threshold 0.6 (Jaccard on stems). */
export function duplicateOf(candidate, articles, threshold = 0.6) {
  let best = null;
  for (const a of articles) {
    for (const k of [a.title, a.primary_keyword, ...(a.secondary_keywords || [])]) {
      for (const c of [candidate.keyword, candidate.title]) {
        if (!c || !k) continue;
        const s = similarity(c, k);
        if (s >= threshold && (!best || s > best.score)) best = { slug: a.slug, title: a.title, matched: k, score: Math.round(s * 100) / 100 };
      }
    }
  }
  return best;
}

/** All posts in content/posts on main (any status), plus pending/published rows from the DB. */
export async function existingArticles({ db, env = process.env, ghImpl = gh } = {}) {
  const out = [];
  if (githubConfigured(env)) {
    try {
      const files = await ghImpl('GET', `/repos/${repoName(env)}/contents/content/posts?ref=main`, null, env);
      for (const f of Array.isArray(files) ? files : []) {
        if (!/\.md$/.test(f.name)) continue;
        try {
          const file = await ghImpl('GET', `/repos/${repoName(env)}/contents/content/posts/${encodeURIComponent(f.name)}?ref=main`, null, env);
          const p = parsePost(Buffer.from(file.content || '', 'base64').toString('utf8'));
          out.push({ slug: p.slug || f.name.replace(/\.md$/, ''), title: p.title, primary_keyword: p.primary_keyword, secondary_keywords: p.secondary_keywords || [] });
        } catch { /* one unreadable file must not hide the rest */ }
      }
    } catch { /* GitHub down: fall back to the DB list */ }
  }
  if (db) {
    const rows = (await db.query("SELECT slug, title, primary_keyword FROM posts WHERE status IN ('pending','published','approved')")).rows;
    for (const r of rows) if (!out.some((a) => a.slug === r.slug)) out.push({ slug: r.slug, title: r.title, primary_keyword: r.primary_keyword, secondary_keywords: [] });
  }
  return out;
}
