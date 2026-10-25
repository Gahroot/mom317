import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, chmod, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { codexDeps, codexAvailable, providerOrder, codexBlock, handleFailure, classifyError, getState, keepalive, KEEPALIVE_SCHEDULE } from '../src/codex.js';
import { complete } from '../src/llm.js';
import { monthSpend, checkBudget } from '../src/cost.js';
import { lastSlot } from '../src/scheduler.js';
import { memDb } from './helpers.js';

const NIGHT = new Date('2026-10-26T07:00:00Z'); // 3:00 NY
const DAYTIME = new Date('2026-10-26T16:00:00Z'); // 12:00 NY
const quiet = { log() {}, error() {} };

/** Fake spawn: writes `reply` to the -o file and exits with `code`. */
function fakeSpawn({ reply = 'hello', code = 0, stderr = '', calls = [] } = {}) {
  return (cmd, args) => {
    calls.push(args);
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = Object.assign(new EventEmitter(), { end: async () => {
      if (code === 0) await writeFile(args[args.indexOf('--output-last-message') + 1], reply);
      child.stdout.emit('data', JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 7 } }) + '\n');
      if (stderr) child.stderr.emit('data', stderr);
      child.emit('close', code);
    } });
    child.kill = () => {};
    return child;
  };
}

function anthropicFetch(calls) {
  return async (url) => { calls.push(url); return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'from-anthropic' }], usage: { input_tokens: 10, output_tokens: 5 } }) }; };
}

function setup(over = {}) {
  const alerts = [];
  Object.assign(codexDeps, { available: async () => true, notify: async (a) => alerts.push(a), ...over });
  return alerts;
}

test('codexAvailable needs binary on PATH and auth.json with auth_mode chatgpt', async () => {
  codexDeps.available = null;
  const dir = await mkdtemp(path.join(tmpdir(), 'cx-'));
  const bin = path.join(dir, 'bin'); const home = path.join(dir, 'home');
  await mkdir(bin); await mkdir(home);
  const env = { PATH: bin, CODEX_HOME: home };
  assert.equal(await codexAvailable(env), false, 'nothing');
  await writeFile(path.join(bin, 'codex'), '#!/bin/sh\n'); await chmod(path.join(bin, 'codex'), 0o755);
  assert.equal(await codexAvailable(env), false, 'no auth.json');
  await writeFile(path.join(home, 'auth.json'), JSON.stringify({ auth_mode: 'apikey', OPENAI_API_KEY: 'x' }));
  assert.equal(await codexAvailable(env), false, 'wrong auth_mode');
  await writeFile(path.join(home, 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: {}, last_refresh: '2026-10-20T00:00:00Z' }));
  assert.equal(await codexAvailable(env), true);
  assert.equal(await codexAvailable({ PATH: '', CODEX_HOME: home }), false, 'no binary');
});

test('provider order: codex first for writer jobs, never for fact-check', () => {
  assert.deepEqual(providerOrder('draft', {}), ['codex', 'anthropic', 'openai']);
  assert.deepEqual(providerOrder('research', { LLM_PROVIDER_ORDER: 'anthropic' }), ['anthropic', 'openai']);
  assert.deepEqual(providerOrder('gate', { LLM_PROVIDER_ORDER: 'codex,anthropic' }), ['anthropic', 'openai']);
  assert.deepEqual(providerOrder('gate', { LLM_FACTCHECK_PROVIDER: 'codex' }), ['anthropic', 'openai']);
  assert.ok(!providerOrder('ai_visibility', {}).includes('codex'));
});

test('codex success: ledger cost 0, budget untouched, args safe', async () => {
  const db = await memDb();
  const calls = [];
  setup({ spawn: fakeSpawn({ reply: 'from-codex', calls }) });
  const env = { ANTHROPIC_API_KEY: 'k', AI_MONTHLY_BUDGET_USD: '0' }; // budget 0: any paid call would be refused
  const text = await complete('SYS', 'PROMPT', { env, db, job: 'draft', now: NIGHT, fetchImpl: async () => { throw new Error('no fetch'); } });
  assert.equal(text, 'from-codex');
  const a = calls[0];
  for (const f of ['exec', '--skip-git-repo-check', '--json', '-']) assert.ok(a.includes(f), f);
  assert.equal(a[a.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(!a.includes('-m'), 'model omitted by default');
  const row = (await db.query('SELECT provider, usd, input_tokens, output_tokens FROM ai_usage')).rows[0];
  assert.deepEqual(row, { provider: 'codex', usd: 0, input_tokens: 80, output_tokens: 7 });
  assert.equal(await monthSpend(db), 0);
});

test('codex failure falls back to anthropic; auth alert deduped for 7 days', async () => {
  const db = await memDb();
  const alerts = setup({ spawn: fakeSpawn({ code: 1, stderr: 'Error: 401 Unauthorized, please log in again' }) });
  const fetchCalls = [];
  const env = { ANTHROPIC_API_KEY: 'k' };
  assert.equal(await complete('S', 'P', { env, db, job: 'research', now: NIGHT, fetchImpl: anthropicFetch(fetchCalls) }), 'from-anthropic');
  assert.equal(fetchCalls.length, 1);
  assert.equal(await complete('S', 'P', { env, db, job: 'research', now: NIGHT, fetchImpl: anthropicFetch(fetchCalls) }), 'from-anthropic');
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].title, 'Codex login needs renewing');
  assert.match(alerts[0].body, /codex login --device-auth/);
  assert.equal(JSON.parse(await getState(db, 'last_error')).kind, 'auth');
  const later = new Date(NIGHT.getTime() + 8 * 86_400_000);
  assert.equal((await handleFailure(db, { kind: 'auth', message: 'x' }, { now: later })).alerted, true);
});

test('usage limit: 24h back-off, no alert, anthropic used', async () => {
  const db = await memDb();
  const calls = [];
  const alerts = setup({ spawn: fakeSpawn({ code: 1, stderr: "You've hit your usage limit. Try again later.", calls }) });
  assert.equal(classifyError('429 Too Many Requests'), 'usage');
  const env = { ANTHROPIC_API_KEY: 'k' };
  assert.equal(await complete('S', 'P', { env, db, job: 'draft', now: NIGHT, fetchImpl: anthropicFetch([]) }), 'from-anthropic');
  assert.equal(alerts.length, 0);
  assert.match(await codexBlock(db, 'draft', { env, now: new Date(NIGHT.getTime() + 3_600_000) }), /backing off/);
  await complete('S', 'P', { env, db, job: 'draft', now: new Date(NIGHT.getTime() + 3_600_000), fetchImpl: anthropicFetch([]) });
  assert.equal(calls.length, 1, 'codex not tried during back-off');
  assert.equal(await codexBlock(db, 'draft', { env, now: new Date(NIGHT.getTime() + 25 * 3_600_000) }), null);
});

test('daytime rule and weekly cap', async () => {
  const db = await memDb();
  setup({ spawn: fakeSpawn() });
  assert.match(await codexBlock(db, 'draft', { env: {}, now: DAYTIME }), /daytime/);
  assert.equal(await codexBlock(db, 'draft', { env: { CODEX_ANYTIME: 'true' }, now: DAYTIME }), null);
  const now = new Date();
  const night = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 7)); // 2-3am NY
  for (let i = 0; i < 2; i++) await db.query("INSERT INTO ai_usage (month, job, provider, usd) VALUES ('x','draft','codex',0)");
  await db.query("INSERT INTO ai_usage (month, job, provider, usd) VALUES ('x','codex_keepalive','codex',0)");
  assert.equal(await codexBlock(db, 'draft', { env: { CODEX_MAX_CALLS_PER_WEEK: '3' }, now: night }), null, 'keepalive not counted');
  await db.query("INSERT INTO ai_usage (month, job, provider, usd) VALUES ('x','research','codex',0)");
  assert.equal(await codexBlock(db, 'draft', { env: { CODEX_MAX_CALLS_PER_WEEK: '3' }, now: night }), 'weekly cap reached');
  assert.equal(await codexBlock(db, 'draft', { env: {}, now: night }), null);
});

test('fact-check never spawns codex by default', async () => {
  const db = await memDb();
  const calls = [];
  setup({ spawn: fakeSpawn({ calls }) });
  assert.equal(await complete('S', 'P', { env: { ANTHROPIC_API_KEY: 'k', CODEX_ANYTIME: 'true' }, db, job: 'gate', now: NIGHT, fetchImpl: anthropicFetch([]) }), 'from-anthropic');
  assert.equal(calls.length, 0);
  assert.ok((await checkBudget(db, 'gate')).ok);
});

test('keepalive: weekly Sat 6:00 NY, skipped when codex unavailable', async () => {
  assert.deepEqual(KEEPALIVE_SCHEDULE, { hour: 6, days: [6] });
  assert.equal(lastSlot(KEEPALIVE_SCHEDULE, new Date('2026-10-26T15:00:00Z')).toISOString(), '2026-10-24T10:00:00.000Z');
  const db = await memDb();
  setup({ available: async () => false });
  assert.deepEqual(await keepalive({ db, env: {}, log: quiet }), { skipped: 'codex not available' });
  const calls = [];
  setup({ spawn: fakeSpawn({ reply: 'OK', calls }) });
  assert.deepEqual(await keepalive({ db, env: {}, log: quiet }), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal((await db.query("SELECT usd FROM ai_usage WHERE job = 'codex_keepalive'")).rows[0].usd, 0);
});
