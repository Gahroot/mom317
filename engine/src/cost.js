// AI cost controls: price table, usage ledger (ai_usage), monthly budget with a hard ceiling, 80% alert.
import { githubConfigured, upsertIssue } from './github.js';

// USD per million tokens (input / output / cacheWrite = 5-minute cache write / cacheRead = cache hit) and
// per-request fees. Checked 2026-10-25 on the official pricing pages:
//   Anthropic  https://platform.claude.com/docs/en/about-claude/pricing
//     Sonnet 5.5 $2 in / $10 out / $2.50 5m write / $0.10 hit. Haiku 5.5 (prompts <= 100k tokens) $0.10 / $0.50 / $0.125 / $0.01;
//     prompts over 100k cost 5x on Haiku 5.5, which the engine never sends. Batch API = 50% off tokens.
//   OpenAI     https://platform.openai.com/docs/pricing
//     gpt-4.1 $2 in / $8 out / $0.50 cached in; web search tool $10 per 1k calls (+ search content tokens at model rates).
//   Perplexity https://docs.perplexity.ai/getting-started/pricing
//     'sonar' is no longer listed there (the page now covers the Agent API). UNCONFIRMED, so a conservative (high) estimate
//     is used: $1 / $1 per M tokens + $0.012 per request (the old high-search-context fee). If the API reports
//     usage.cost.total_cost, that exact figure is used instead.
// Override any of it with env AI_PRICES_JSON, e.g. {"sonar":{"input":1,"output":1,"request":0.005}}.
export const PRICES = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  'gpt-4.1': { input: 2, output: 8, cacheRead: 0.5, webSearch: 0.01 },
  sonar: { input: 1, output: 1, request: 0.012 },
  // Unknown model: deliberately high (Opus-4.1-level) so the cap errs on the safe side.
  default: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5, request: 0.02, webSearch: 0.025 }
};

export const ESSENTIAL_JOBS = new Set(['draft', 'gate']);
export const HARD_CEILING = 1.5;
export const ALERT_AT = 0.8;

export function prices(env = process.env) {
  let extra = {};
  if (env.AI_PRICES_JSON) { try { extra = JSON.parse(env.AI_PRICES_JSON); } catch { extra = {}; } }
  const out = { ...PRICES };
  for (const [k, v] of Object.entries(extra)) out[k] = { ...(PRICES[k] || {}), ...v };
  return out;
}

/** Longest price key that prefixes the model id (so dated ids like gpt-4.1-2025-04-14 match gpt-4.1). */
export function priceFor(model, env = process.env) {
  const table = prices(env);
  const m = String(model || '');
  if (table[m]) return table[m];
  const key = Object.keys(table).filter((k) => k !== 'default' && m.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return table[key || 'default'];
}

/** u: { model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, requests, webSearches, batch } -> USD */
export function estimateCost(u, env = process.env) {
  const p = priceFor(u.model, env);
  const n = (x) => Number(x) || 0;
  let tokens = (n(u.inputTokens) * n(p.input) + n(u.outputTokens) * n(p.output)
    + n(u.cacheWriteTokens) * n(p.cacheWrite ?? p.input * 1.25) + n(u.cacheReadTokens) * n(p.cacheRead ?? p.input * 0.1)) / 1e6;
  if (u.batch) tokens *= 0.5;
  return tokens + n(u.requests) * n(p.request) + n(u.webSearches) * n(p.webSearch);
}

export const monthKey = (now = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}`;
};

export const budgetUsd = (env = process.env) => {
  const b = Number(env.AI_MONTHLY_BUDGET_USD ?? 10);
  return Number.isFinite(b) && b >= 0 ? b : 10;
};

export async function monthSpend(db, now = new Date()) {
  const { rows } = await db.query('SELECT COALESCE(SUM(usd),0) AS usd FROM ai_usage WHERE month = $1', [monthKey(now)]);
  return Number(rows[0].usd) || 0;
}

export async function spendByJob(db, now = new Date()) {
  const { rows } = await db.query('SELECT job, COUNT(*)::int AS calls, COALESCE(SUM(usd),0) AS usd FROM ai_usage WHERE month = $1 GROUP BY job ORDER BY job', [monthKey(now)]);
  return rows.map((r) => ({ job: r.job, calls: r.calls, usd: Math.round(Number(r.usd) * 10000) / 10000 }));
}

export async function budgetStatus(db, { env = process.env, now = new Date() } = {}) {
  const spent = await monthSpend(db, now);
  const budget = budgetUsd(env);
  return { month: monthKey(now), spentUsd: Math.round(spent * 10000) / 10000, budgetUsd: budget, hardCeilingUsd: budget * HARD_CEILING,
    pct: budget ? Math.round((spent / budget) * 1000) / 10 : null, byJob: await spendByJob(db, now) };
}

/**
 * May `job` spend money now? Optional jobs stop at 100% of the budget; essential ones (draft, gate fact-check)
 * keep going until the 1.5x hard ceiling.
 */
export async function checkBudget(db, job, { env = process.env, now = new Date() } = {}) {
  if (!db) return { ok: true };
  const spent = await monthSpend(db, now);
  const budget = budgetUsd(env);
  const essential = ESSENTIAL_JOBS.has(job);
  const limit = essential ? budget * HARD_CEILING : budget;
  return { ok: spent < limit, essential, spentUsd: spent, budgetUsd: budget, limitUsd: limit };
}

export const budgetSkip = (b) => ({ skipped: 'budget', reason: 'budget', spentUsd: Math.round(b.spentUsd * 10000) / 10000, limitUsd: b.limitUsd });

export class BudgetError extends Error {
  constructor(job, b) { super(`budget: ${job} skipped, month-to-date $${b.spentUsd.toFixed(4)} >= $${b.limitUsd}`); this.budget = true; this.retryable = false; }
}

const defaultNotify = async ({ title, body }, env) => { if (githubConfigured(env)) await upsertIssue({ title, body, label: 'engine-alert' }, env); };

/** Opens/updates one `engine-alert` issue the first time spend crosses 80% in a month. */
export async function maybeAlert(db, { env = process.env, now = new Date(), notify = defaultNotify } = {}) {
  const spent = await monthSpend(db, now);
  const budget = budgetUsd(env);
  if (!budget || spent < budget * ALERT_AT) return false;
  const month = monthKey(now);
  const seen = await db.query('SELECT 1 FROM budget_alerts WHERE month = $1', [month]);
  if (seen.rows.length) return false;
  await db.query('INSERT INTO budget_alerts (month, spent_usd) VALUES ($1,$2)', [month, spent]);
  await notify({
    title: `AI spend over 80% of the monthly budget (${month})`,
    body: `Month-to-date AI spend is **$${spent.toFixed(2)}** of the **$${budget.toFixed(2)}** budget (AI_MONTHLY_BUDGET_USD).\n\nAt 100% the optional jobs (research, optimize, ai_visibility) are skipped; draft and the gate fact-check keep running until $${(budget * HARD_CEILING).toFixed(2)} (1.5x). See /api/admin/status. To raise the cap: \`railway variables --service engine --set AI_MONTHLY_BUDGET_USD=<n>\`.`
  }, env);
  return true;
}

/** Writes one ledger row. u as in estimateCost plus job, provider, usd (optional exact cost). */
export async function recordUsage(db, u, { env = process.env, now = new Date(), notify } = {}) {
  if (!db) return null;
  const usd = Number.isFinite(u.usd) ? u.usd : estimateCost(u, env);
  await db.query(
    `INSERT INTO ai_usage (month, job, provider, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, requests, web_searches, batch, usd)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [monthKey(now), u.job || 'unknown', u.provider, u.model || '', u.inputTokens || 0, u.outputTokens || 0, u.cacheReadTokens || 0, u.cacheWriteTokens || 0,
      u.requests ?? 1, u.webSearches || 0, Boolean(u.batch), usd]
  );
  try { await maybeAlert(db, { env, now, ...(notify ? { notify } : {}) }); } catch (e) { console.error('[budget] alert failed', e.message); }
  return usd;
}
