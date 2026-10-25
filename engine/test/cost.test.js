import test from 'node:test';
import assert from 'node:assert/strict';
import { memDb } from './helpers.js';
import { estimateCost, recordUsage, monthSpend, checkBudget, maybeAlert, monthKey, budgetStatus, priceFor } from '../src/cost.js';
import { complete, modelFor, batchComplete, pollBatches } from '../src/llm.js';
import { withRetry, createScheduler } from '../src/scheduler.js';
import { factCheck } from '../src/jobs/gate.js';
import * as draft from '../src/jobs/draft.js';
import * as research from '../src/jobs/research.js';
import * as optimize from '../src/jobs/optimize.js';
import * as aiVis from '../src/jobs/aiVisibility.js';
import { aiSpendSection } from '../src/jobs/report.js';

const log = { log() {}, error() {} };
const A = { ANTHROPIC_API_KEY: 'k' };
const res = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
const msg = (text, usage = { input_tokens: 1000, output_tokens: 500 }) => ({ content: [{ type: 'text', text }], usage });
const spend = (db, usd, job = 'x') => recordUsage(db, { job, provider: 'test', model: 'm', usd }, { notify: async () => {} });

test('cost math: tokens, cache read/write, batch 50%, search fees, env override', () => {
  const s = estimateCost({ model: 'claude-sonnet-5-5', inputTokens: 1e6, outputTokens: 1e6 });
  assert.equal(s, 12);
  assert.equal(estimateCost({ model: 'claude-sonnet-5-5', cacheWriteTokens: 1e6, cacheReadTokens: 1e6 }), 2.6);
  assert.equal(estimateCost({ model: 'claude-haiku-5-5', inputTokens: 1e6, outputTokens: 1e6, batch: true }), 0.3);
  assert.equal(estimateCost({ model: 'gpt-4.1-2025-04-14', inputTokens: 1e6, webSearches: 2 }), 2.02);
  assert.equal(estimateCost({ model: 'sonar', inputTokens: 1e6, outputTokens: 0, requests: 1 }), 1.012);
  assert.equal(priceFor('mystery').input, 15, 'unknown models priced high');
  assert.equal(estimateCost({ model: 'sonar', requests: 1 }, { AI_PRICES_JSON: '{"sonar":{"request":0.005}}' }), 0.005);
});

test('ledger records Anthropic usage incl. cache tokens; month is America/New_York', async () => {
  const db = await memDb();
  const fetchImpl = async () => res(200, msg('hi', { input_tokens: 100, output_tokens: 200, cache_creation_input_tokens: 1000, cache_read_input_tokens: 0 }));
  assert.equal(await complete('sys', 'p', { env: A, db, job: 'draft', fetchImpl }), 'hi');
  const [row] = (await db.query('SELECT * FROM ai_usage')).rows;
  assert.equal(row.job, 'draft');
  assert.equal(row.model, 'claude-sonnet-5-5');
  assert.equal(row.cache_write_tokens, 1000);
  assert.ok(Math.abs(row.usd - (100 * 2 + 200 * 10 + 1000 * 2.5) / 1e6) < 1e-12);
  assert.equal(monthKey(new Date('2026-11-01T03:00:00Z')), '2026-10', '11pm NY on Oct 31 is still October');
});

test('cap: optional skipped at 100%, essential until 150%, 80% alert once a month', async () => {
  const db = await memDb();
  const env = { AI_MONTHLY_BUDGET_USD: '10' };
  const notes = [];
  const notify = async (i) => notes.push(i);
  await recordUsage(db, { job: 'draft', provider: 't', usd: 7.9 }, { env, notify });
  assert.equal(notes.length, 0);
  await recordUsage(db, { job: 'draft', provider: 't', usd: 0.2 }, { env, notify });
  await recordUsage(db, { job: 'draft', provider: 't', usd: 0.2 }, { env, notify });
  assert.equal(notes.length, 1, 'one alert per month');
  assert.match(notes[0].title, /80%/);
  assert.equal(await maybeAlert(db, { env, notify }), false);
  assert.equal((await checkBudget(db, 'research', { env })).ok, true);
  await spend(db, 2); // 10.3
  for (const j of ['research', 'optimize', 'ai_visibility']) assert.equal((await checkBudget(db, j, { env })).ok, false);
  assert.equal((await checkBudget(db, 'draft', { env })).ok, true);
  assert.equal((await research.run({ db, env: { ...env, ...A }, log })).skipped, 'budget');
  await spend(db, 5); // 15.3
  assert.equal((await checkBudget(db, 'draft', { env })).ok, false);
  assert.equal((await checkBudget(db, 'gate', { env })).ok, false);
  let called = 0;
  await assert.rejects(complete('s', 'p', { env: { ...env, ...A }, db, job: 'draft', fetchImpl: async () => { called++; return res(200, msg('x')); } }), (e) => e.budget && e.retryable === false);
  assert.equal(called, 0);
  // budget skip inside a scheduled run is recorded as skipped (no retry, no alert)
  let runs = 0;
  const alerts = [];
  const s = createScheduler({ db, jobs: { j: { run: async () => { runs++; await complete('s', 'p', { env: { ...env, ...A }, db, job: 'draft' }); } } }, retry: { sleep: async () => {} }, onFailure: async (j) => alerts.push(j), log });
  assert.equal((await s.runJob('j', new Date())).status, 'skipped');
  assert.equal(runs, 1);
  assert.deepEqual(alerts, []);
  const st = await budgetStatus(db, { env });
  assert.equal(st.budgetUsd, 10);
  assert.ok(st.spentUsd > 15);
  assert.match(aiSpendSection(st), /## AI spend[\s\S]*\$10\.00 budget[\s\S]*\| draft \| 3 \|/);
});

test('non-retryable errors are not retried; JSON parse at most 1 retry; 429/5xx retried', async () => {
  const sleep = async () => {};
  for (const status of [400, 401, 403, 404]) {
    let n = 0;
    await assert.rejects(withRetry(async () => { n++; await complete('s', 'p', { env: A, fetchImpl: async () => res(status, 'bad') }); }, { sleep }));
    assert.equal(n, 1, `HTTP ${status} not retried`);
  }
  let n = 0;
  await assert.rejects(withRetry(async () => { n++; const { extractJson } = await import('../src/llm.js'); extractJson('no json here'); }, { sleep }));
  assert.equal(n, 2, 'bad JSON retried once');
  for (const status of [429, 503]) {
    n = 0;
    await assert.rejects(withRetry(async () => { n++; await complete('s', 'p', { env: A, fetchImpl: async () => res(status, 'busy') }); }, { sleep }));
    assert.equal(n, 3);
  }
  n = 0;
  await assert.rejects(withRetry(async () => { n++; await complete('s', 'p', { env: A, fetchImpl: async () => { throw new TypeError('fetch failed'); } }); }, { sleep }));
  assert.equal(n, 3, 'network errors retried');
});

test('model tiering and max_tokens per job', async () => {
  assert.deepEqual(modelFor('research', {}), { model: 'claude-haiku-5-5', maxTokens: 3000 });
  assert.deepEqual(modelFor('optimize', { LLM_MODEL_FAST: 'fast-x' }), { model: 'fast-x', maxTokens: 2000 });
  assert.deepEqual(modelFor('gate', { LLM_MODEL: 'claude-sonnet-5-5' }), { model: 'claude-sonnet-5-5', maxTokens: 2500 });
  assert.deepEqual(modelFor('draft', {}), { model: 'claude-sonnet-5-5', maxTokens: 9000 });
  const bodies = [];
  const fetchImpl = async (u, o) => { bodies.push(JSON.parse(o.body)); return res(200, msg('ok')); };
  await complete('s', 'p', { env: A, job: 'research', fetchImpl });
  await complete('s', 'p', { env: A, job: 'draft', fetchImpl, cacheSystem: true });
  assert.equal(bodies[0].model, 'claude-haiku-5-5');
  assert.equal(bodies[0].max_tokens, 3000);
  assert.equal(bodies[1].model, 'claude-sonnet-5-5');
  assert.equal(bodies[1].max_tokens, 9000);
  assert.deepEqual(bodies[1].system[0].cache_control, { type: 'ephemeral' });
});

const RAW = {
  title: 'Why do I wake at 3 a.m. in menopause?', description: 'x'.repeat(155), primary_keyword: 'k', answer: 'a', faq: [],
  sources: [{ id: 1, title: 'T', publisher: 'P', year: 2020, url: 'https://pubmed.ncbi.nlm.nih.gov/1/' }, { id: 2, title: 'T2', publisher: 'P', year: 2021, url: 'https://pubmed.ncbi.nlm.nih.gov/2/' }],
  claims: [{ text: 'c', source: 1 }], body: '## Why?\n\nText[^1][^2].'
};

test('draft: retry reuses the stored draft (LLM called once); draft system prompt is cached', async () => {
  const db = await memDb();
  await db.query("INSERT INTO opportunities (keyword, title, score) VALUES ('k', 'T', 1)");
  let llm = 0, opens = 0;
  const deps = {
    complete: async (sys, prompt, opts) => { llm++; assert.equal(opts.cacheSystem, true); assert.equal(opts.job, 'draft'); assert.match(sys, /Editorial guidelines/); return RAW; },
    finalize: async (post) => ({ post, dropped: [], issues: [] }),
    openPr: async ({ post, db: d }) => {
      if (++opens === 1) throw new Error('github 502');
      await d.query("UPDATE posts SET status = 'draft', pr_number = 9 WHERE slug = $1", [post.slug]);
      return { number: 9 };
    },
    gate: async () => ({ outcome: 'merged' })
  };
  const env = { ...A, GITHUB_TOKEN: 't' };
  await assert.rejects(draft.run({ db, env, log, deps }), /502/);
  const stored = (await db.query('SELECT status, draft_md FROM posts')).rows[0];
  assert.equal(stored.status, 'pending');
  assert.match(stored.draft_md, /^---\ntitle: Why do I wake/);
  const r = await draft.run({ db, env, log, deps });
  assert.equal(r.number, 9);
  assert.equal(llm, 1, 'LLM called once across both attempts');
  assert.equal(opens, 2);
});

function batchFetch({ status = 'in_progress' } = {}) {
  const calls = [];
  const state = { status };
  const f = async (url, o = {}) => {
    calls.push({ url, method: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null });
    if (url.endsWith('/messages/batches') && o.method === 'POST') return res(200, { id: 'msgbatch_1', processing_status: 'in_progress' });
    if (url.endsWith('/messages/batches/msgbatch_1')) return res(200, { id: 'msgbatch_1', processing_status: state.status, results_url: 'https://api.anthropic.com/v1/messages/batches/msgbatch_1/results' });
    if (url.endsWith('/results')) {
      const id = calls.find((c) => c.body && c.body.requests).body.requests[0].custom_id;
      return res(200, JSON.stringify({ custom_id: id, result: { type: 'succeeded', message: msg('[{"keyword":"night waking","intent":"problem_aware","audienceFit":1,"nightWakingFit":1}]', { input_tokens: 1e6, output_tokens: 0 }) } }) + '\n');
    }
    if (url.endsWith('/cancel')) return res(200, {});
    if (url.endsWith('/v1/messages')) return res(200, msg('[{"keyword":"fallback kw"}]'));
    throw new Error('unexpected ' + url);
  };
  return { f, calls, state };
}

test('batch: submit -> pending, survives restart, hourly poll, resume at 50% cost', async () => {
  const db = await memDb();
  const b = batchFetch();
  const r1 = await research.run({ db, env: A, log, fetchImpl: b.f });
  assert.deepEqual(r1, { pending: 'batch', batchId: 'msgbatch_1' });
  const sub = b.calls.find((c) => c.body && c.body.requests).body.requests[0].params;
  assert.equal(sub.model, 'claude-haiku-5-5');
  assert.equal(sub.max_tokens, 3000);
  assert.deepEqual(await pollBatches({ db, env: A, fetchImpl: b.f }), [], 'still running');
  b.state.status = 'ended';
  assert.deepEqual(await pollBatches({ db, env: A, fetchImpl: b.f }), ['research']);
  // "restart": a fresh call only reads the DB row
  const r2 = await research.run({ db, env: A, log, fetchImpl: b.f });
  assert.equal(r2.stored, 1);
  const u = (await db.query('SELECT batch, usd FROM ai_usage')).rows[0];
  assert.equal(u.batch, true);
  assert.ok(Math.abs(u.usd - 0.05) < 1e-9, 'haiku 1M input at 50% = $0.05');
  assert.ok(!b.calls.some((c) => c.url.endsWith('/v1/messages')), 'no normal call');
});

test('batch: not ended within 24h -> cancel + normal call', async () => {
  const db = await memDb();
  const b = batchFetch();
  let t = Date.now();
  const args = { db, env: A, job: 'research', system: 's', prompt: 'p', fetchImpl: b.f, now: () => t };
  assert.equal((await batchComplete(args)).pending, true);
  assert.equal((await batchComplete(args)).pending, true);
  t += 25 * 3_600_000;
  const r = await batchComplete(args);
  assert.equal(r.text, '[{"keyword":"fallback kw"}]');
  assert.ok(b.calls.some((c) => c.url.endsWith('/cancel')));
  assert.equal((await db.query('SELECT status FROM ai_batches')).rows[0].status, 'fallback');
});

const SRC = 'https://pubmed.ncbi.nlm.nih.gov/111/';
const post = {
  title: 't', answer: 'a', body: 'b', sources: [{ id: 1, title: 'S', url: SRC }],
  claims: [{ text: 'Hot flashes are associated with night awakenings.', source: 1 }]
};
const page = { status: 200, text: async () => '<html><title>Hot flashes and sleep in midlife women</title><body>abstract text long enough</body></html>' };

test('fact-check: cache_control on system; claim cache hit skips the LLM; changed claims re-checked; source text cached', async () => {
  const db = await memDb();
  let llm = 0, fetches = 0;
  const fetchImpl = async () => { fetches++; return page; };
  const bodies = [];
  const env = A;
  const anth = async (u, o) => {
    llm++; const b = JSON.parse(o.body); bodies.push(b);
    const items = JSON.parse(b.messages[0].content.match(/excerpts\):\n([\s\S]*?)\n\nListed/)[1]);
    return res(200, msg(JSON.stringify({ verdicts: items.map((i) => ({ index: i.index, verdict: 'supported' })), unlisted_medical_statements: [] })));
  };
  const completeImpl = (s, p, o) => complete(s, p, { ...o, fetchImpl: anth });
  const r1 = await factCheck(post, { env, db, fetchImpl, completeImpl });
  assert.equal(r1.ok, true);
  assert.equal(llm, 1);
  assert.deepEqual(bodies[0].system[0].cache_control, { type: 'ephemeral' });
  assert.equal(bodies[0].max_tokens, 2500);
  assert.equal(bodies[0].model, 'claude-sonnet-5-5');
  const r2 = await factCheck(post, { env, db, fetchImpl, completeImpl });
  assert.equal(r2.ok, true);
  assert.equal(llm, 1, 'cache hit: no LLM call');
  assert.equal(fetches, 1);
  const changed = { ...post, claims: [...post.claims, { text: 'A new claim.', source: 1 }] };
  await factCheck(changed, { env, db, fetchImpl, completeImpl });
  assert.equal(llm, 2);
  const items = JSON.parse(bodies[1].messages[0].content.match(/excerpts\):\n([\s\S]*?)\n\nListed/)[1]);
  assert.deepEqual(items.map((i) => i.claim), ['A new claim.'], 'only the changed claim is checked');
  assert.equal(fetches, 1, 'source text served from 7-day cache');
});

test('AI visibility: even ISO weeks only, max 15 sonar questions, OpenAI 5 questions on the first run of the month', async () => {
  assert.equal(aiVis.visibilityPlan(new Date('2026-10-07T14:00:00Z')).run, false, 'week 41 is odd');
  assert.deepEqual(aiVis.visibilityPlan(new Date('2026-10-14T14:00:00Z'), {}), { run: true, isoWeek: 42, openai: true, max: 15 });
  assert.equal(aiVis.visibilityPlan(new Date('2026-10-28T14:00:00Z')).openai, false, 'second run of the month: sonar only');
  const db = await memDb();
  for (let i = 0; i < 12; i++) await db.query("INSERT INTO posts (slug, title, status) VALUES ($1,$2,'published')", [`p${i}`, `Question ${i}?`]);
  const asked = { perplexity: 0, openai: 0 };
  const deps = {
    perplexity: async () => { asked.perplexity++; return { text: '', citations: [] }; },
    openai: async () => { asked.openai++; return { text: '', citations: [] }; }
  };
  const env = { PERPLEXITY_API_KEY: 'p', OPENAI_API_KEY: 'o' };
  assert.match((await aiVis.run({ db, env, log, deps, slot: new Date('2026-10-07T14:00:00Z') })).skipped, /odd ISO week/);
  const r = await aiVis.run({ db, env, log, deps, slot: new Date('2026-10-14T14:00:00Z') });
  assert.equal(r.perplexity.questions, 15);
  assert.equal(r.openai.questions, 5);
  await aiVis.run({ db, env: { ...env, AI_VIS_MAX_QUESTIONS: '4' }, log, deps, slot: new Date('2026-10-28T14:00:00Z') });
  assert.deepEqual(asked, { perplexity: 19, openai: 5 });
  await spend(db, 11);
  assert.equal((await aiVis.run({ db, env, log, deps, slot: new Date('2026-10-28T14:00:00Z') })).skipped, 'budget');
});

test('optimize: no LLM call below 200 impressions in 28 days; stored suggestion reused on retry', async () => {
  const db = await memDb();
  await db.query("INSERT INTO posts (slug, title, status, updated_at) VALUES ('a', 'A?', 'published', now() - interval '30 days')");
  const addImpr = (n) => db.query("INSERT INTO metrics_daily (day, provider, page, query, clicks, impressions, position) VALUES (CURRENT_DATE - 1, 'gsc', 'https://back2sleepnow.com/blog/a/', 'q', 0, $1, 8)", [n]);
  await addImpr(150);
  let llm = 0;
  const fetchImpl = async () => { llm++; return res(200, { choices: [{ message: { content: '{"title":"New?","description":"d","answer":"x","faq":[]}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }); };
  const file = { content: Buffer.from('---\ntitle: A?\nslug: a\nstatus: approved\n---\nBody\n').toString('base64') };
  let opens = 0;
  const deps = { fetchImpl, gh: async () => file, openPr: async () => { if (++opens === 1) throw new Error('github 500'); return { number: 3 }; }, gate: async () => ({}) };
  const env = { OPENAI_API_KEY: 'o', GITHUB_TOKEN: 't' };
  assert.equal((await optimize.run({ db, env, log, deps })).skipped, 'not enough data');
  assert.equal(llm, 0);
  await db.query('DELETE FROM metrics_daily');
  await addImpr(250);
  await assert.rejects(optimize.run({ db, env, log, deps }), /github 500/);
  const r = await optimize.run({ db, env, log, deps });
  assert.equal(r.number, 3);
  assert.equal(llm, 1, 'suggestion reused, LLM called once');
  assert.equal((await db.query('SELECT used FROM optimize_suggestions')).rows[0].used, true);
});
