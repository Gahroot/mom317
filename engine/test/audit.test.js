import test from 'node:test';
import assert from 'node:assert/strict';
import { memDb } from './helpers.js';
import { run } from '../src/jobs/audit.js';
import { serializePost } from '../src/frontmatter.js';
import { DeferError } from '../src/mode.js';

const log = { log() {}, error() {} };
const env = { LLM_PROVIDER_ORDER: 'codex', GITHUB_TOKEN: 't', GITHUB_REPO: 'Gahroot/mom317' };
const mk = (slug) => ({ title: `${slug}?`, slug, description: 'd', date: '2026-10-25', updated: '2026-10-25', status: 'approved', approved_by: 'x',
  primary_keyword: slug, secondary_keywords: [], answer: 'a', faq: [], sources: [{ id: 1, title: 'S', publisher: 'P', year: 2020, url: 'https://pubmed.ncbi.nlm.nih.gov/1/' }],
  claims: [{ text: `claim ${slug}`, source: 1 }], body: '## Why?\n\nText[^1].' });

function ghFor(posts, openRefs = []) {
  const calls = [];
  const fn = async (method, route) => {
    calls.push(route);
    if (route.includes('/pulls?state=open')) return openRefs.map((ref, i) => ({ number: 90 + i, head: { ref } }));
    if (route.endsWith('content/posts?ref=main')) return posts.map((p) => ({ name: `${p.slug}.md` }));
    const slug = decodeURIComponent(route.split('/content/posts/')[1].split('.md')[0]);
    return { content: Buffer.from(serializePost(posts.find((p) => p.slug === slug))).toString('base64') };
  };
  return { fn, calls };
}

test('audit: passing post recorded ok; failing post gets a draft refresh PR that is gated; not re-audited within 30 days', async () => {
  const db = await memDb();
  const posts = [mk('good'), mk('weak')];
  const opened = [];
  const gated = [];
  const deps = {
    gh: ghFor(posts).fn,
    factCheck: async (post) => (post.slug === 'good'
      ? { ok: true, verdicts: [{ verdict: 'supported' }], unlisted: [] }
      : { ok: false, verdicts: [{ verdict: 'overstated' }], unlisted: ['x'] }),
    openPr: async ({ post, fileText, kind, reason }) => { opened.push({ post, fileText, kind, reason }); return { number: 12 }; },
    gate: async ({ number }) => { gated.push(number); return { outcome: 'merged' }; }
  };
  const out = await run({ db, env, log, deps });
  assert.equal(out.audited, 2);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].post.slug, 'weak');
  assert.equal(opened[0].kind, 'refresh');
  assert.match(opened[0].fileText, /\nstatus: draft\n/);
  assert.match(opened[0].reason, /1 of 1 claims not fully supported.*1 medical statement/);
  assert.deepEqual(gated, [12]);
  const rows = (await db.query('SELECT slug, ok, pr_number FROM post_audits ORDER BY slug')).rows;
  assert.deepEqual(rows.map((r) => [r.slug, r.ok, r.pr_number]), [['good', true, null], ['weak', false, 12]]);
  const again = await run({ db, env, log, deps });
  assert.match(again.skipped, /audited recently/);
});

test('audit: skips posts with an open PR, caps posts per run, and defers when Codex is unavailable', async () => {
  const db = await memDb();
  const posts = [mk('a'), mk('b'), mk('c'), mk('d')];
  let checked = 0;
  const deps = { gh: ghFor(posts, ['blog/a-refresh-2026-10-20']).fn, factCheck: async () => { checked++; return { ok: true, verdicts: [], unlisted: [] }; }, openPr: async () => ({}), gate: async () => ({}) };
  const out = await run({ db, env, log, deps });
  assert.equal(out.audited, 2, 'max 2 per run');
  assert.ok(!out.results.some((r) => r.slug === 'a'), 'post with open refresh PR skipped');
  const db2 = await memDb();
  await assert.rejects(run({ db: db2, env, log, deps: { ...deps, factCheck: async () => { throw new DeferError('codex unavailable: backing off'); } } }), (e) => e.defer === true);
});
