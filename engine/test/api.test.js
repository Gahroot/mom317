import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHandler, createRateLimiter, validateSignup, validateEvent, isAllowedOrigin } from '../src/api.js';
import { memDb } from './helpers.js';

async function serve(opts) {
  const db = await memDb();
  const server = http.createServer(createHandler({ db, log: { error() {} }, ...opts }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { db, base, post, close: () => server.close() };
}

test('validation', () => {
  assert.equal(validateSignup({ email: 'nope' }).error, 'invalid_email');
  const v = validateSignup({ email: ' A@Example.COM ', ref: 'bad ref!', source: 'blog:x:end', landing_page: '/blog/x?utm=1', extra: 1 }).value;
  assert.equal(v.email, 'a@example.com');
  assert.equal(v.ref, null);
  assert.equal(v.landing_page, '/blog/x');
  assert.equal(validateEvent({ type: 'click', path: '/' }).error, 'invalid_type');
  assert.equal(validateEvent({ type: 'pageview', path: 'x' }).error, 'invalid_path');
  assert.ok(isAllowedOrigin('https://foo-bar.vercel.app'));
  assert.ok(!isAllowedOrigin('https://evil.com'));
});

test('signup, dedupe, honeypot, quiz, event, health, admin', async () => {
  const s = await serve({ adminToken: 'secret' });
  try {
    assert.deepEqual(await (await fetch(s.base + '/api/health')).json(), { ok: true });
    let r = await s.post('/api/signup', { email: 'bad' });
    assert.equal(r.status, 400);
    r = await s.post('/api/signup', { email: 'Jane@Example.com', ref: 'abc123', source: 'hero', landing_page: '/blog/a' }, { origin: 'https://back2sleepnow.com' });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://back2sleepnow.com');
    const a = await r.json();
    assert.match(a.referralCode, /^[a-z2-9]{8}$/);
    assert.equal(a.position, undefined);
    const b = await (await s.post('/api/signup', { email: 'jane@example.com' })).json();
    assert.equal(b.referralCode, a.referralCode, 'stable per email');
    r = await s.post('/api/signup', { email: 'bot@example.com', company: 'Acme' });
    assert.equal(r.status, 200);
    const rows = (await s.db.query('SELECT email, landing_page FROM signups')).rows;
    assert.deepEqual(rows, [{ email: 'jane@example.com', landing_page: '/blog/a' }]);
    assert.equal((await s.post('/api/signup', { email: 'x@y.co' }, { origin: 'https://evil.com' })).status, 403);

    assert.equal((await s.post('/api/quiz', { email: 'jane@example.com', wakeTime: '3-4am', stage: 'menopause', next: 'calm' })).status, 200);
    assert.equal((await s.post('/api/quiz', { stage: 'bogus' })).status, 400);

    assert.equal((await s.post('/api/event', { type: 'pageview', path: '/blog/a', referrer: 'https://google.com/x' })).status, 204);
    await s.post('/api/event', { type: 'pageview', path: '/blog/a', referrer: 'https://google.com/y' });
    assert.equal((await s.db.query('SELECT count FROM events')).rows[0].count, 2);

    assert.equal((await fetch(s.base + '/api/admin/status')).status, 401);
    assert.equal((await fetch(s.base + '/api/admin/status', { headers: { authorization: 'Bearer secret' } })).status, 200);
    assert.equal((await fetch(s.base + '/api/signup', { method: 'OPTIONS', headers: { origin: 'http://localhost:8317' } })).status, 204);
  } finally { s.close(); }
});

test('rate limiter', () => {
  let t = 0;
  const lim = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
  assert.ok(lim('1.1.1.1') && lim('1.1.1.1'));
  assert.ok(!lim('1.1.1.1'));
  assert.ok(lim('2.2.2.2'));
  t = 1000;
  assert.ok(lim('1.1.1.1'));
});
