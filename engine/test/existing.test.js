import test from 'node:test';
import assert from 'node:assert/strict';
import { memDb } from './helpers.js';
import { similarity, duplicateOf, existingArticles } from '../src/existing.js';
import * as draft from '../src/jobs/draft.js';
import { complete } from '../src/llm.js';

const log = { log() {}, error() {} };
const LIVE = [
  { slug: 'why-wake-3am-menopause', title: 'Why do I wake at 3 a.m. in menopause?', primary_keyword: 'waking at 3am menopause',
    secondary_keywords: ['perimenopause waking up at 3am', 'why do i wake up at 3am every night'] },
  { slug: 'cant-get-back-to-sleep-menopause', title: "Awake at 3 a.m. and can't get back to sleep? What to do in menopause",
    primary_keyword: 'cant get back to sleep menopause', secondary_keywords: [] }
];

test('duplicate detection: the real PR #2 topic is caught; complementary topics are not', () => {
  const dup = duplicateOf({ keyword: 'why do i wake up at 3am every night perimenopause', title: 'Why Do I Keep Waking Up at 3am During Perimenopause?' }, LIVE);
  assert.ok(dup, 'near-duplicate caught');
  assert.equal(dup.slug, 'why-wake-3am-menopause');
  for (const kw of ['night sweats menopause sleep', 'cbt-i for menopause insomnia', 'sleep apnea after menopause', 'magnesium and sleep menopause evidence', 'hormone therapy and sleep']) {
    assert.equal(duplicateOf({ keyword: kw }, LIVE), null, `${kw} is not a duplicate`);
  }
  assert.ok(similarity('waking at 3 a.m. menopause', 'perimenopause wake up 3am') >= 0.6);
});

test('existingArticles reads content/posts on main and merges DB rows; GitHub failure falls back to DB', async () => {
  const db = await memDb();
  await db.query("INSERT INTO posts (slug, title, primary_keyword, status) VALUES ('pending-one','P','pending kw','pending')");
  const md = Buffer.from('---\ntitle: Why do I wake at 3 a.m. in menopause?\nslug: why-wake-3am-menopause\nprimary_keyword: waking at 3am menopause\nsecondary_keywords:\n  - night waking menopause\n---\nBody').toString('base64');
  const ghImpl = async (m, route) => (route.endsWith('content/posts?ref=main') ? [{ name: 'why-wake-3am-menopause.md' }, { name: 'README.txt' }] : { content: md });
  const list = await existingArticles({ db, env: { GITHUB_TOKEN: 't' }, ghImpl });
  assert.deepEqual(list.map((a) => a.slug).sort(), ['pending-one', 'why-wake-3am-menopause']);
  assert.deepEqual(list.find((a) => a.slug === 'why-wake-3am-menopause').secondary_keywords, ['night waking menopause']);
  const down = await existingArticles({ db, env: { GITHUB_TOKEN: 't' }, ghImpl: async () => { throw new Error('502'); } });
  assert.deepEqual(down.map((a) => a.slug), ['pending-one']);
});

const RAW = {
  title: 'Night sweats and sleep in menopause?', slug: 'night-sweats-sleep-menopause', description: 'd'.repeat(150),
  answer: Array(45).fill('w').join(' '), faq: [], sources: [{ id: 1, title: 'S1', url: 'https://a' }, { id: 2, title: 'S2', url: 'https://b' }, { id: 3, title: 'S3', url: 'https://c' }],
  claims: [{ text: 'c1', source: 1 }, { text: 'c3', source: 3 }], body: '## Why?\n\nOne[^1] two[^2] three[^3].'
};

test('draft skips a duplicate opportunity (marked duplicate) and drafts the next one', async () => {
  const db = await memDb();
  await db.query("INSERT INTO opportunities (keyword, title, score) VALUES ('why do i wake up at 3am every night perimenopause', 'Why do I keep waking at 3am?', 9), ('night sweats sleep menopause', 'Night sweats?', 5)");
  const prompts = [];
  const deps = {
    existing: async () => LIVE,
    complete: async (sys, prompt) => { prompts.push(prompt); return RAW; },
    finalize: async (post) => ({ post, dropped: [], issues: [] }),
    openPr: async () => ({ number: 3 }),
    gate: async () => ({ outcome: 'merged' })
  };
  const r = await draft.run({ db, env: { ANTHROPIC_API_KEY: 'k', GITHUB_TOKEN: 't' }, log, deps });
  assert.equal(r.number, 3);
  assert.match(prompts[0], /night sweats sleep menopause/);
  const st = Object.fromEntries((await db.query('SELECT keyword, status, post_slug FROM opportunities')).rows.map((o) => [o.keyword, o]));
  assert.equal(st['why do i wake up at 3am every night perimenopause'].status, 'duplicate');
  assert.equal(st['why do i wake up at 3am every night perimenopause'].post_slug, 'why-wake-3am-menopause');
  assert.equal(st['night sweats sleep menopause'].status, 'drafted');
});

test('orphaned claims after dropped sources trigger exactly one repair pass, whose result is used', async () => {
  const db = await memDb();
  await db.query("INSERT INTO opportunities (keyword, title, score) VALUES ('night sweats sleep menopause', 'Night sweats?', 5)");
  let calls = 0, finals = 0, opened = null;
  const repaired = { ...RAW, sources: RAW.sources.slice(0, 2), claims: [{ text: 'c1', source: 1 }], body: '## Why?\n\nOne[^1] two[^2].' };
  const deps = {
    existing: async () => [],
    complete: async (sys, prompt) => { calls++; if (calls === 2) assert.match(prompt, /https:\/\/c/); return calls === 1 ? RAW : repaired; },
    finalize: async (post) => {
      finals++;
      if (finals === 1) {
        return { post: { ...post, sources: post.sources.slice(0, 2), claims: [{ text: 'c1', source: 1 }, { text: 'c3', source: '', unsourced: true }] },
          dropped: [{ source: { id: 3, url: 'https://c' }, reason: '404' }], issues: ['unsourced claim: c3'] };
      }
      return { post, dropped: [], issues: [] };
    },
    openPr: async ({ post }) => { opened = post; return { number: 4 }; },
    gate: async () => ({ outcome: 'merged' })
  };
  const r = await draft.run({ db, env: { ANTHROPIC_API_KEY: 'k', GITHUB_TOKEN: 't' }, log, deps });
  assert.equal(calls, 2, 'one draft call + one repair call');
  assert.deepEqual(r.issues, []);
  assert.deepEqual(opened.claims, [{ text: 'c1', source: 1 }]);
  assert.equal(opened.slug, 'night-sweats-sleep-menopause');
});

test('a model that rejects temperature is retried once without it', async () => {
  const bodies = [];
  const fetchImpl = async (u, o) => {
    const b = JSON.parse(o.body); bodies.push(b);
    if ('temperature' in b) return { ok: false, status: 400, text: async () => '{"error":{"message":"`temperature` is deprecated for this model."}}' };
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: {} }) };
  };
  assert.equal(await complete('s', 'p', { env: { ANTHROPIC_API_KEY: 'k' }, job: 'gate', temperature: 0, fetchImpl }), 'ok');
  assert.equal(bodies.length, 2);
  assert.equal('temperature' in bodies[1], false);
});
