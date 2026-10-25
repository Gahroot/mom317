// LLM access: Codex CLI (ChatGPT subscription, $0) for research/draft/optimize when allowed, then Anthropic, then OpenAI.
// Plain fetch, no SDKs. Every call is written to the ai_usage ledger (when a db is passed); paid calls are checked
// against the monthly budget (codex calls cost 0 and are not).
import { checkBudget, recordUsage, BudgetError } from './cost.js';
import { codexBlock, runCodex, handleFailure, recordSuccess, providerOrder } from './codex.js';

export function llmConfigured(env = process.env) {
  return Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
}

export const mainModel = (env = process.env) => env.LLM_MODEL || 'claude-sonnet-5-5';
export const fastModel = (env = process.env) => env.LLM_MODEL_FAST || 'claude-haiku-5-5';

// Per-job model tier and output cap. research/optimize: fast model; draft/gate fact-check: main model.
export const JOB_LLM = {
  research: { tier: 'fast', maxTokens: 3000 },
  optimize: { tier: 'fast', maxTokens: 2000 },
  gate: { tier: 'main', maxTokens: 2500 },
  draft: { tier: 'main', maxTokens: 9000 }
};
export function modelFor(job, env = process.env) {
  const j = JOB_LLM[job];
  return { model: j && j.tier === 'fast' ? fastModel(env) : mainModel(env), maxTokens: j ? j.maxTokens : 4000 };
}

const NON_RETRYABLE = new Set([400, 401, 403, 404]);
export function httpError(provider, status, text) {
  return Object.assign(new Error(`${provider} ${status}: ${String(text).slice(0, 300)}`), { status, retryable: !NON_RETRYABLE.has(status) });
}

const ANTHROPIC = 'https://api.anthropic.com/v1';
const aHeaders = (env) => ({ 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' });

/** Messages API params. cacheSystem puts the static system prompt in a cached block. */
export function anthropicParams(system, prompt, { model, maxTokens, temperature, cacheSystem }) {
  return {
    model, max_tokens: maxTokens, ...(temperature != null ? { temperature } : {}),
    system: cacheSystem ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : system,
    messages: [{ role: 'user', content: prompt }]
  };
}

const anthropicUsage = (u = {}) => ({
  inputTokens: u.input_tokens || 0, outputTokens: u.output_tokens || 0,
  cacheWriteTokens: u.cache_creation_input_tokens || 0, cacheReadTokens: u.cache_read_input_tokens || 0
});
const textOf = (msg) => (msg.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');

async function anthropic(env, system, prompt, o) {
  const params = anthropicParams(system, prompt, o);
  const res = await o.fetchImpl(`${ANTHROPIC}/messages`, { method: 'POST', headers: aHeaders(env), body: JSON.stringify(params), signal: AbortSignal.timeout(240_000) });
  if (!res.ok) throw httpError('anthropic', res.status, await res.text());
  const j = await res.json();
  await recordUsage(o.db, { job: o.job, provider: 'anthropic', model: params.model, ...anthropicUsage(j.usage) }, { env });
  return textOf(j);
}

async function openai(env, system, prompt, o) {
  const model = env.OPENAI_MODEL || 'gpt-4.1';
  const res = await o.fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_completion_tokens: o.maxTokens, ...(o.temperature != null ? { temperature: o.temperature } : {}), messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(240_000)
  });
  if (!res.ok) throw httpError('openai', res.status, await res.text());
  const j = await res.json();
  const u = j.usage || {};
  const cached = (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0;
  await recordUsage(o.db, { job: o.job, provider: 'openai', model, inputTokens: (u.prompt_tokens || 0) - cached, cacheReadTokens: cached, outputTokens: u.completion_tokens || 0 }, { env });
  return j.choices[0].message.content;
}

/**
 * opts: { maxTokens, env, temperature, db, job, model, cacheSystem, fetchImpl }.
 * Throws a non-retryable BudgetError when the job may not spend; errors carry `retryable` for the scheduler.
 */
/** Tries Codex for this call if the job/limits allow it. Returns text, or null to use the next provider. */
export async function tryCodex(system, prompt, { db, env = process.env, job, now = new Date(), log = console } = {}) {
  if (!job || await codexBlock(db, job, { env, now })) return null;
  try {
    const r = await runCodex(`${system}\n\n---\n\n${prompt}`, { env });
    await recordUsage(db, { job, provider: 'codex', model: env.CODEX_MODEL || 'codex-default', usd: 0, ...r.usage }, { env });
    await recordSuccess(db);
    return r.text;
  } catch (e) {
    const h = await handleFailure(db, e, { env, now });
    log.error(`[codex] ${job} failed (${h.kind}); falling back`);
    return null;
  }
}

export async function complete(system, prompt, opts = {}) {
  const env = opts.env || process.env;
  const tier = opts.job ? modelFor(opts.job, env) : { model: mainModel(env), maxTokens: 8000 };
  const o = { ...opts, env, model: opts.model || tier.model, maxTokens: opts.maxTokens || tier.maxTokens, fetchImpl: opts.fetchImpl || globalThis.fetch };
  if (!opts.noCodex) {
    const text = await tryCodex(system, prompt, { db: o.db, env, job: o.job, now: opts.now });
    if (text != null) return text;
  }
  if (o.db && o.job) {
    const b = await checkBudget(o.db, o.job, { env });
    if (!b.ok) throw new BudgetError(o.job, b);
  }
  const errors = [];
  const paid = { anthropic: ['ANTHROPIC_API_KEY', anthropic], openai: ['OPENAI_API_KEY', openai] };
  for (const p of providerOrder(o.job, env)) {
    if (!paid[p]) continue;
    const [key, fn] = paid[p];
    if (!env[key]) continue;
    try { return await fn(env, system, prompt, o); } catch (e) { errors.push(e); }
  }
  if (!errors.length) throw Object.assign(new Error('no LLM key configured (ANTHROPIC_API_KEY / OPENAI_API_KEY)'), { retryable: false });
  // Retry later only if at least one provider failed for a transient reason (429/5xx/network).
  throw Object.assign(new Error(errors.map((e) => e.message).join(' | ')), { retryable: errors.some((e) => e.retryable !== false) });
}

export function extractJson(text) {
  try {
    const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1] : text;
    const start = raw.search(/[[{]/);
    const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    if (start < 0 || end < start) throw new Error('LLM did not return JSON');
    return JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    // A bad LLM reply is retried at most once (2 attempts in total).
    throw Object.assign(e instanceof Error ? e : new Error(String(e)), { maxAttempts: 2 });
  }
}

export async function completeJson(system, prompt, opts) {
  return extractJson(await complete(system + '\nReply with JSON only.', prompt, opts));
}

// ---------- Message Batches API (50% off) for research + optimize ----------
// A job submits one request, stores the batch id in ai_batches and returns { pending }. The hourly ai_batches job (or the
// job's own next run) polls it; when it has ended the result is stored and the job runs again to consume it.
// Not ended after 24h (or errored) -> a normal call is made instead.
const DAY = 24 * 3_600_000;

async function settle(db, env, row, f) {
  const res = await f(`${ANTHROPIC}/messages/batches/${row.batch_id}`, { headers: aHeaders(env), signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw httpError('anthropic batch', res.status, await res.text());
  const b = await res.json();
  if (b.processing_status !== 'ended') return row;
  const rr = await f(b.results_url, { headers: aHeaders(env), signal: AbortSignal.timeout(120_000) });
  if (!rr.ok) throw httpError('anthropic batch results', rr.status, await rr.text());
  const line = String(await rr.text()).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).find((l) => l.custom_id === `r${row.id}`);
  const r = line && line.result;
  if (r && r.type === 'succeeded') {
    await recordUsage(db, { job: row.job, provider: 'anthropic', model: row.model, batch: true, ...anthropicUsage(r.message.usage) }, { env });
    await db.query("UPDATE ai_batches SET status = 'ended', result_text = $2, updated_at = now() WHERE id = $1", [row.id, textOf(r.message)]);
    return { ...row, status: 'ended', result_text: textOf(r.message) };
  }
  const err = r ? r.type + (r.error ? `: ${JSON.stringify(r.error).slice(0, 300)}` : '') : 'no result line';
  await db.query("UPDATE ai_batches SET status = 'failed', error = $2, updated_at = now() WHERE id = $1", [row.id, err]);
  return { ...row, status: 'failed', error: err };
}

/** Returns { text } or { pending, batchId }. */
export async function batchComplete({ db, env = process.env, job, key = '', system, prompt, json = true, fetchImpl, now = () => Date.now() }) {
  const f = fetchImpl || globalThis.fetch;
  const sys = json ? system + '\nReply with JSON only.' : system;
  const { model, maxTokens } = modelFor(job, env);
  const normal = () => complete(sys, prompt, { env, db, job, model, maxTokens, fetchImpl: f, noCodex: true });
  // Codex first (when allowed): no Batch API for that call.
  const pendingRow = db ? (await db.query("SELECT 1 FROM ai_batches WHERE job = $1 AND key = $2 AND status IN ('submitted','ended','failed') LIMIT 1", [job, key])).rows[0] : null;
  if (!pendingRow) {
    const text = await tryCodex(sys, prompt, { db, env, job, now: new Date(now()) });
    if (text != null) return { text };
  }
  if (!env.ANTHROPIC_API_KEY || !db) return { text: await normal() };
  let row = (await db.query("SELECT * FROM ai_batches WHERE job = $1 AND key = $2 AND status IN ('submitted','ended','failed') ORDER BY id DESC LIMIT 1", [job, key])).rows[0];
  if (!row) {
    const b = await checkBudget(db, job, { env });
    if (!b.ok) throw new BudgetError(job, b);
    const params = anthropicParams(sys, prompt, { model, maxTokens });
    const ins = await db.query('INSERT INTO ai_batches (job, key, model, params) VALUES ($1,$2,$3,$4) RETURNING id', [job, key, model, JSON.stringify(params)]);
    const id = ins.rows[0].id;
    const res = await f(`${ANTHROPIC}/messages/batches`, { method: 'POST', headers: aHeaders(env), body: JSON.stringify({ requests: [{ custom_id: `r${id}`, params }] }), signal: AbortSignal.timeout(60_000) });
    if (!res.ok) { await db.query('DELETE FROM ai_batches WHERE id = $1', [id]); throw httpError('anthropic batch', res.status, await res.text()); }
    const batch = await res.json();
    await db.query('UPDATE ai_batches SET batch_id = $2, updated_at = now() WHERE id = $1', [id, batch.id]);
    return { pending: true, batchId: batch.id };
  }
  if (row.status === 'submitted') row = await settle(db, env, row, f);
  if (row.status === 'ended') {
    await db.query("UPDATE ai_batches SET status = 'consumed', updated_at = now() WHERE id = $1", [row.id]);
    return { text: row.result_text };
  }
  if (row.status === 'failed' || now() - new Date(row.created_at).getTime() > DAY) {
    if (row.status === 'submitted') { try { await f(`${ANTHROPIC}/messages/batches/${row.batch_id}/cancel`, { method: 'POST', headers: aHeaders(env) }); } catch {} }
    await db.query("UPDATE ai_batches SET status = 'fallback', updated_at = now() WHERE id = $1", [row.id]);
    return { text: await normal() };
  }
  return { pending: true, batchId: row.batch_id };
}

/** Hourly: polls submitted batches; returns the jobs whose results are ready (ended, failed or >24h old). */
export async function pollBatches({ db, env = process.env, fetchImpl, now = () => Date.now() }) {
  if (!env.ANTHROPIC_API_KEY) return [];
  const f = fetchImpl || globalThis.fetch;
  const rows = (await db.query("SELECT * FROM ai_batches WHERE status = 'submitted' AND batch_id IS NOT NULL ORDER BY id")).rows;
  const ready = new Set();
  for (let row of rows) {
    row = await settle(db, env, row, f);
    if (row.status !== 'submitted' || now() - new Date(row.created_at).getTime() > DAY) ready.add(row.job);
  }
  return [...ready];
}

export const BRAND_RULES = `Context: Back2SleepNow.com is the blog of 3:17, a pre-launch brand founded by Marian Grout. Audience: women in perimenopause, menopause or post-menopause who wake in the middle of the night and can't get back to sleep. Upcoming product: "Middle of the night sleep shot" (tagline "Quickly return to sleep").
Hard rules:
- NEVER make efficacy, treatment or cure claims about the product or any supplement. Do not say the product helps, works, treats or improves anything. Product mentions are limited to inviting readers to join the founding waitlist.
- Never invent statistics, studies, doses, ingredients, prices, ship dates, testimonials or signup counts.
- Cite only real peer-reviewed papers or authoritative bodies (NIH/NCBI/PubMed, The Menopause Society (NAMS, menopause.org), ACOG, AASM, CDC, NHS, NICE, Cochrane, major journals). Prefer DOI or PubMed URLs you are certain exist. If unsure a URL exists, leave the source out.
- Health information is general education, not medical advice; encourage talking to a clinician for persistent symptoms.`;
