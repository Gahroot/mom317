import { batchComplete, extractJson, llmConfigured, BRAND_RULES } from '../llm.js';
import { checkBudget, budgetSkip } from '../cost.js';

export const SEED_TOPICS = [
  'waking at 3am menopause', 'perimenopause insomnia', 'night sweats waking up', 'cant get back to sleep after waking menopause',
  'menopause sleep maintenance insomnia', 'hot flashes at night', 'CBT-I menopause', 'hormone therapy and sleep', 'sleep apnea after menopause',
  'what to do when you wake at 3am', 'magnesium and sleep menopause evidence', 'alcohol and night waking women over 45'
];

/** Qualified-signup score: intent fit dominates; volume is a tiebreaker. */
export function scoreOpportunity({ audienceFit = 0, nightWakingFit = 0, intent = 'informational', impressions = 0, position = null }) {
  const intentW = { problem_aware: 1, solution_seeking: 1, informational: 0.7, navigational: 0.2, unrelated: 0 }[intent] ?? 0.5;
  const fit = (Math.max(0, Math.min(1, audienceFit)) * 0.5 + Math.max(0, Math.min(1, nightWakingFit)) * 0.5) * intentW;
  const volume = Math.min(1, Math.log10(1 + impressions) / 4);
  const gap = position && position > 4 && position <= 30 ? 0.1 : 0;
  return Math.round((fit * 80 + volume * 10 + gap * 100) * 10) / 10;
}

export async function run({ db, env = process.env, log, fetchImpl }) {
  if (!llmConfigured(env)) return { skipped: 'not configured: ANTHROPIC_API_KEY / OPENAI_API_KEY' };
  const budget = await checkBudget(db, 'research', { env });
  if (!budget.ok) return budgetSkip(budget);
  const gsc = (await db.query(
    `SELECT query, SUM(impressions)::int AS impressions, SUM(clicks)::int AS clicks, AVG(position) AS position
     FROM metrics_daily WHERE provider = 'gsc' AND query <> '' AND day > CURRENT_DATE - 28 GROUP BY query ORDER BY impressions DESC LIMIT 150`
  )).rows;
  const existing = (await db.query('SELECT keyword, status FROM opportunities')).rows;
  const posts = (await db.query('SELECT slug, primary_keyword FROM posts')).rows;

  const out = await batchComplete({ db, env, job: 'research', fetchImpl, system:
    `You are an SEO/AEO/GEO strategist. ${BRAND_RULES}`,
    prompt: `Find keyword, search-intent and content gaps for the blog. The goal is QUALIFIED waitlist signups: women in peri/menopause who wake at night. Intent fit with that audience matters far more than search volume.
Search Console queries (last 28 days, may be empty): ${JSON.stringify(gsc)}
Seed topics: ${JSON.stringify(SEED_TOPICS)}
Already covered/planned keywords: ${JSON.stringify([...existing.map((e) => e.keyword), ...posts.map((p) => p.primary_keyword)])}
Return a JSON array of up to 15 NEW opportunities: [{"keyword": "...", "title": "question-style H1", "intent": "problem_aware|solution_seeking|informational|navigational|unrelated", "angle": "what the post should answer and why it's a gap", "audienceFit": 0-1 (how surely the searcher is a woman in peri/menopause), "nightWakingFit": 0-1 (how much it is about waking at night / getting back to sleep), "rationale": "one sentence"}]` });
  if (out.pending) { log.log(`[research] batch ${out.batchId} pending`); return { pending: 'batch', batchId: out.batchId }; }
  const ideas = extractJson(out.text);
  const gscByQuery = new Map(gsc.map((g) => [g.query.toLowerCase(), g]));
  let stored = 0;
  for (const o of Array.isArray(ideas) ? ideas : []) {
    if (!o || typeof o.keyword !== 'string' || !o.keyword.trim()) continue;
    const kw = o.keyword.trim().toLowerCase().slice(0, 200);
    const g = gscByQuery.get(kw) || {};
    const score = scoreOpportunity({ ...o, impressions: g.impressions || 0, position: g.position ? Number(g.position) : null });
    await db.query(
      `INSERT INTO opportunities (keyword, title, intent, angle, score, rationale) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (keyword) DO UPDATE SET score = EXCLUDED.score, angle = EXCLUDED.angle, rationale = EXCLUDED.rationale, updated_at = now()`,
      [kw, String(o.title || '').slice(0, 200), o.intent || null, String(o.angle || '').slice(0, 1000), score, String(o.rationale || '').slice(0, 500)]
    );
    await db.query(
      `INSERT INTO keywords (keyword, intent, source, impressions, position) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (keyword) DO UPDATE SET intent = EXCLUDED.intent, impressions = EXCLUDED.impressions, position = EXCLUDED.position, updated_at = now()`,
      [kw, o.intent || null, g.impressions ? 'gsc' : 'llm', g.impressions || 0, g.position ? Number(g.position) : null]
    );
    stored++;
  }
  log.log(`[research] stored ${stored} opportunities`);
  return { stored, gscQueries: gsc.length };
}
