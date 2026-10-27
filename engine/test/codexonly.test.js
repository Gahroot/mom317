import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { codexDeps, providerOrder, codexBlock, codexArgs, weeklyCap, setState } from '../src/codex.js';
import { complete, batchComplete, llmConfigured } from '../src/llm.js';
import { checkBudget, budgetStatus, recordUsage } from '../src/cost.js';
import { createScheduler } from '../src/scheduler.js';
import { codexOnly } from '../src/mode.js';
import * as aiVis from '../src/jobs/aiVisibility.js';
import { memDb } from './helpers.js';

const ENV = { LLM_PROVIDER_ORDER: 'codex', CODEX_MODEL: 'gpt-6.1-sol', CODEX_REASONING_EFFORT: 'high', ANTHROPIC_API_KEY: 'k' };
const DAYTIME = new Date('2026-10-26T16:00:00Z'); // 12:00 NY
const quiet = { log() {}, error() {} };
const noFetch = async () => { throw new Error('paid API must not be called in codex-only mode'); };

function fakeSpawn({ reply = 'hello', code = 0, stderr = '', events = [], calls = [] } = {}) {
  return (cmd, args) => {
    calls.push(args);
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = Object.assign(new EventEmitter(), { end: async () => {
      if (code === 0) await writeFile(args[args.indexOf('--output-last-message') + 1], reply);
      for (const e of events) child.stdout.emit('data', JSON.stringify(e) + '\n');
      child.stdout.emit('data', JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 7 } }) + '\n');
      if (stderr) child.stderr.emit('data', stderr);
      child.emit('close', code);
    } });
    child.kill = () => {};
    return child;
  };
}
const setup = (over = {}) => Object.assign(codexDeps, { available: async () => true, notify: async () => {}, ...over });

test('codex-only mode: every job incl. fact-check routes to codex only; args carry model + reasoning effort', () => {
  assert.equal(codexOnly(ENV), true);
  assert.equal(codexOnly({ LLM_PROVIDER_ORDER: 'codex,anthropic' }), false);
  for (const job of ['research', 'draft', 'optimize', 'gate', 'ai_visibility']) assert.deepEqual(providerOrder(job, ENV), ['codex']);
  const a = codexArgs(ENV, '/tmp/o', '/tmp/c');
  assert.deepEqual(a.slice(a.indexOf('-m'), a.indexOf('-m') + 2), ['-m', 'gpt-6.1-sol']);
  assert.ok(a.includes('model_reasoning_effort="high"'));
  assert.ok(!a.includes('web_search="live"'));
  assert.ok(codexArgs(ENV, '/tmp/o', '/tmp/c', { search: true }).includes('web_search="live"'));
  assert.ok(!codexArgs({ CODEX_REASONING_EFFORT: 'high"; rm -rf' }, '/o', '/c').some((x) => /rm -rf/.test(x)), 'effort is validated');
  assert.equal(weeklyCap(ENV), 200);
  assert.equal(llmConfigured({ LLM_PROVIDER_ORDER: 'codex' }), true, 'no paid key needed');
});

test('codex-only: fact-check and drafting use codex (no paid fetch), allowed in daytime, budget is off', async () => {
  const db = await memDb();
  const calls = [];
  setup({ spawn: fakeSpawn({ reply: 'checked', calls }) });
  assert.equal(await complete('sys', 'p', { env: ENV, db, job: 'gate', temperature: 0, fetchImpl: noFetch, now: DAYTIME }), 'checked');
  assert.equal(await complete('sys', 'p', { env: ENV, db, job: 'draft', fetchImpl: noFetch, now: DAYTIME }), 'checked');
  assert.equal(calls.length, 2);
  await recordUsage(db, { job: 'x', provider: 'anthropic', model: 'claude-sonnet-5-5', usd: 50 }, { env: ENV, notify: async () => {} });
  assert.equal((await checkBudget(db, 'research', { env: ENV })).ok, true, 'spend over any cap does not block');
  const st = await budgetStatus(db, { env: ENV });
  assert.equal(st.budget, 'off');
  assert.equal(st.mode, 'codex-only');
});

test('codex-only: no Batch API, research goes straight to codex', async () => {
  const db = await memDb();
  setup({ spawn: fakeSpawn({ reply: '[]' }) });
  const r = await batchComplete({ db, env: ENV, job: 'research', system: 's', prompt: 'p', fetchImpl: noFetch });
  assert.deepEqual(r, { text: '[]' });
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM ai_batches')).rows[0].n, 0);
});

test('codex-only: blocked / usage limit / logged out -> defer (never paid fallback); transient errors -> retryable', async () => {
  const db = await memDb();
  setup({ spawn: fakeSpawn({ code: 1, stderr: 'You have hit your usage limit. Try again later.' }) });
  await assert.rejects(complete('s', 'p', { env: ENV, db, job: 'draft', fetchImpl: noFetch }), (e) => e.defer === true && /usage limit/.test(e.message));
  await assert.rejects(complete('s', 'p', { env: ENV, db, job: 'draft', fetchImpl: noFetch }), (e) => e.defer === true && /backing off/.test(e.message), 'back-off now blocks');
  const db2 = await memDb();
  setup({ spawn: fakeSpawn({ code: 1, stderr: '401 Unauthorized: refresh token expired' }) });
  await assert.rejects(complete('s', 'p', { env: ENV, db: db2, job: 'gate', fetchImpl: noFetch }), (e) => e.defer === true && /login/.test(e.message));
  const db3 = await memDb();
  setup({ spawn: fakeSpawn({ code: 1, stderr: 'stream disconnected' }) });
  await assert.rejects(complete('s', 'p', { env: ENV, db: db3, job: 'draft', fetchImpl: noFetch }), (e) => !e.defer && e.retryable === true);
  setup({ available: async () => false });
  await assert.rejects(complete('s', 'p', { env: ENV, db: db3, job: 'draft', fetchImpl: noFetch }), (e) => e.defer === true && /not available/.test(e.message));
  setup();
});

test('scheduler: a deferred slot is retried after an hour, without an alert; then completes', async () => {
  const db = await memDb();
  let t = new Date('2026-10-26T08:05:00Z'); // Mon 4:05 NY
  let n = 0;
  const alerts = [];
  const { DeferError } = await import('../src/mode.js');
  const jobs = { draft: { schedule: { hour: 4, days: [1] }, run: async () => { if (++n === 1) throw new DeferError('codex unavailable: backing off'); return { ok: true }; } } };
  const s = createScheduler({ db, jobs, now: () => t, retry: { sleep: async () => {} }, onFailure: async (j) => alerts.push(j), log: quiet });
  assert.deepEqual(await s.tick(), ['draft']);
  assert.equal((await db.query('SELECT status FROM job_runs ORDER BY id DESC LIMIT 1')).rows[0].status, 'deferred');
  t = new Date('2026-10-26T08:35:00Z');
  assert.deepEqual(await s.tick(), [], 'not before an hour has passed');
  t = new Date('2026-10-26T09:10:00Z'); // 65 minutes after the deferral
  assert.deepEqual(await s.tick(), ['draft']);
  assert.equal((await db.query('SELECT status FROM job_runs ORDER BY id DESC LIMIT 1')).rows[0].status, 'ok');
  assert.deepEqual(await s.tick(), [], 'done slot is not re-run');
  assert.deepEqual(alerts, []);
  assert.equal(n, 2);
});

test('AI visibility in codex-only mode: ChatGPT web search via codex, citation detected from search results', async () => {
  const db = await memDb();
  const calls = [];
  const events = [{ type: 'item.completed', item: { type: 'web_search', results: [{ url: 'https://back2sleepnow.com/blog/why-wake-3am-menopause' }, { url: 'https://www.nhs.uk/x' }] } }];
  setup({ spawn: fakeSpawn({ reply: 'Hot flashes are a common cause. Sources: https://www.sleepfoundation.org/a', events, calls }) });
  const slot = new Date('2026-10-28T14:00:00Z'); // Wed, ISO week 44 (even)
  const out = await aiVis.run({ db, env: { ...ENV, AI_VIS_MAX_QUESTIONS: '2' }, log: quiet, slot });
  assert.deepEqual(out['chatgpt-codex'], { questions: 2, hits: 2, errors: 0 });
  assert.ok(calls[0].includes('web_search="live"'));
  const rows = (await db.query('SELECT provider, cited, citations FROM ai_visibility')).rows;
  assert.equal(rows[0].provider, 'chatgpt-codex');
  assert.equal(rows[0].cited, true);
  assert.ok(rows[0].citations.includes('https://www.sleepfoundation.org/a'));
});
