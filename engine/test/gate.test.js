import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { memDb } from './helpers.js';
import { run, processPr, factCheck, claimsLint, AUTO_APPROVER } from '../src/jobs/gate.js';
import { serializePost } from '../src/frontmatter.js';

const SRC1 = 'https://pubmed.ncbi.nlm.nih.gov/111/';
const SRC2 = 'https://www.menopause.org/abc';
const basePost = {
  title: 'Why do I wake at 3 a.m. in menopause?', slug: 'wake-3am', description: 'd', date: '2026-10-27', updated: '2026-10-27',
  status: 'draft', approved_by: '', primary_keyword: 'k', secondary_keywords: [], answer: 'Hot flashes can wake you.', faq: [],
  sources: [{ id: 1, title: 'Hot flashes and sleep', publisher: 'Menopause', year: 2020, url: SRC1 }, { id: 2, title: 'NAMS statement', publisher: 'NAMS', year: 2022, url: SRC2 }],
  claims: [{ text: 'Hot flashes are associated with night awakenings.', source: 1 }, { text: 'Night waking is common in perimenopause.', source: 2 }],
  body: '## Why?\n\nHot flashes[^1] are common[^2].\n\n3:17 is building a middle-of-the-night sleep shot; join the founding list.'
};
const HTML = '<html><head><title>Hot flashes and sleep</title><meta name="description" content="Vasomotor symptoms were associated with awakenings in midlife women."></head><body>abstract text here</body></html>';

const okFetch = (overrides = {}) => async (url, opts) => {
  const s = overrides[url] ?? 203; // PubMed answers bots with 203
  if (s === 'throw') throw new TypeError('fetch failed');
  return { status: s, text: async () => HTML, body: null, opts };
};
const allSupported = async (sys, prompt, opts) => {
  assert.match(sys, /skeptical/);
  assert.equal(opts.temperature, 0);
  const items = JSON.parse(prompt.match(/excerpts\):\n([\s\S]*?)\n\nListed/)[1]);
  return JSON.stringify({ verdicts: items.map((i) => ({ index: i.index, verdict: 'supported', reason: 'matches abstract' })), unlisted_medical_statements: [] });
};

function harness({ post = basePost, comments = [], checkRuns = [{ name: 'check', status: 'completed', conclusion: 'success' }], fetch = okFetch(), complete = allSupported, checkOk = true, head = 'sha0' } = {}) {
  const calls = [];
  const issues = [];
  const pr = { number: 7, title: 'Blog draft: x', html_url: 'https://github.com/Gahroot/mom317/pull/7', head: { ref: 'blog/wake-3am', sha: head, repo: { full_name: 'Gahroot/mom317' } } };
  let pushedText = null;
  const deps = {
    gh: async (method, route, body) => {
      calls.push({ method, route, body });
      if (method === 'GET' && route.includes('/pulls?state=open')) return [pr];
      if (method === 'GET' && /\/issues\/7\/comments/.test(route)) return comments;
      if (method === 'GET' && route.endsWith('/pulls/7/files?per_page=100')) return [{ filename: 'content/posts/wake-3am.md' }];
      if (method === 'GET' && route.includes('/check-runs')) return { check_runs: checkRuns };
      if (method === 'GET' && /\/pulls\/7$/.test(route)) return pr;
      if (method === 'GET' && route.includes('/issues?state=open')) return [];
      return {};
    },
    withCheckout: async (fn) => {
      const dir = await mkdtemp(path.join(tmpdir(), 'gate-test-'));
      try {
        await mkdir(path.join(dir, 'content/posts'), { recursive: true });
        await writeFile(path.join(dir, 'content/posts/wake-3am.md'), serializePost(post));
        return await fn(dir);
      } finally { await rm(dir, { recursive: true, force: true }); }
    },
    buildBlog: async () => 'built',
    checkBlog: async () => ({ ok: checkOk, detail: checkOk ? 'ok' : 'citation [^3] has no source' }),
    commitAndPush: async (dir) => { pushedText = await readFile(path.join(dir, 'content/posts/wake-3am.md'), 'utf8'); return true; },
    headSha: async () => 'sha1',
    upsertIssue: async (i) => { issues.push(i); return 'url'; },
    fetch, complete, sleep: async () => {}, now: (() => { let t = 0; return () => (t += 60_000); })()
  };
  return { deps, calls, issues, pr, pushed: () => pushedText };
}
const envBase = { GITHUB_TOKEN: 't', GITHUB_REPO: 'Gahroot/mom317', GATE_CI_TIMEOUT_MS: '600000' };
const env = envBase;
const log = { log() {}, error() {} };
const merged = (calls) => calls.some((c) => c.method === 'PUT' && c.route.endsWith('/pulls/7/merge'));
const labelled = (calls) => calls.some((c) => c.method === 'POST' && c.route.endsWith('/issues/7/labels') && c.body.labels.includes('needs-review'));

test('gate pass -> approve, push, wait for CI, squash-merge, delete branch', async () => {
  const db = await memDb();
  const h = harness();
  const out = await run({ db, env, log, deps: h.deps });
  assert.equal(out.results[0].outcome, 'merged');
  assert.match(h.pushed(), /\nstatus: approved\n/);
  assert.match(h.pushed(), new RegExp(`approved_by: ${AUTO_APPROVER.replace(/[()]/g, '\\$&')}`));
  const m = h.calls.find((c) => c.method === 'PUT');
  assert.equal(m.body.merge_method, 'squash');
  assert.equal(m.body.sha, 'sha1');
  assert.ok(h.calls.some((c) => c.method === 'DELETE' && c.route.endsWith('/git/refs/heads/blog/wake-3am')));
  assert.ok(h.calls.some((c) => c.method === 'POST' && c.route.endsWith('/issues/7/comments') && /\| Verdict \|/.test(c.body.body)));
  assert.ok(!labelled(h.calls));
  const rows = (await db.query('SELECT outcome, verdicts FROM gate_results ORDER BY id')).rows;
  assert.deepEqual(rows.map((r) => r.outcome), ['approved', 'merged']);
  assert.equal(rows[0].verdicts.length, 2);
  // idempotent: a second run does nothing to a merged PR
  const again = await run({ db, env, log, deps: harness().deps });
  assert.deepEqual(again.results, []);
});

test('CI still running -> no merge yet, next run merges', async () => {
  const db = await memDb();
  const h = harness({ checkRuns: [{ name: 'check', status: 'in_progress' }] });
  const out = await run({ db, env, log, deps: h.deps });
  assert.ok(out.results[0].pending);
  assert.ok(!merged(h.calls));
  const h2 = harness();
  const out2 = await run({ db, env, log, deps: h2.deps });
  assert.equal(out2.results[0].outcome, 'merged');
  assert.equal(h2.pushed(), null, 'no re-approval needed');
});

const failing = {
  'unresolvable source': { fetch: okFetch({ [SRC2]: 404 }) },
  'build --check': { checkOk: false },
  'claims lint': { post: { ...basePost, body: basePost.body + '\n\nThe 3:17 sleep shot helps you fall back asleep with 3 mg melatonin.' } },
  'fact-check overstated': { complete: async (s, p) => JSON.stringify({ verdicts: [{ index: 0, verdict: 'supported' }, { index: 1, verdict: 'overstated', reason: 'source says some' }], unlisted_medical_statements: [] }) },
  'unlisted medical statement': { complete: async (s, p) => JSON.stringify({ verdicts: [{ index: 0, verdict: 'supported' }, { index: 1, verdict: 'supported' }], unlisted_medical_statements: ['Magnesium improves sleep.'] }) },
  'CI red': { checkRuns: [{ name: 'check', status: 'completed', conclusion: 'failure' }] }
};
for (const [name, opts] of Object.entries(failing)) {
  test(`gate fail (${name}) -> no merge, needs-review label + issue for owner`, async () => {
    const db = await memDb();
    const h = harness(opts);
    const env = { ...envBase, GATE_MAX_REVISIONS: '0' }; // self-revision is covered by its own tests
    const out = await run({ db, env, log, deps: h.deps });
    assert.equal(out.results[0].outcome, 'held');
    assert.ok(!merged(h.calls));
    assert.ok(labelled(h.calls));
    assert.equal(h.issues[0].label, 'needs-review');
    assert.deepEqual(h.issues[0].assignees, ['Gahroot']);
    if (name !== 'CI red') assert.equal(h.pushed(), null, 'nothing pushed on fail');
    // idempotent: same head sha is not re-gated (after a CI-red hold the PR head is the engine's approval commit)
    const h2 = harness({ ...opts, head: name === 'CI red' ? 'sha1' : 'sha0' });
    assert.deepEqual((await run({ db, env, log, deps: h2.deps })).results, []);
  });
}

test("owner '/approve' overrides a held PR: approve + push + merge after green CI", async () => {
  const db = await memDb();
  await run({ db, env, log, deps: harness({ checkOk: false }).deps });
  const comments = [{ user: { login: 'stranger' }, body: '/approve', created_at: '2026-10-25T10:00:00Z' }, { user: { login: 'Gahroot' }, body: '/approve', created_at: '2026-10-25T11:00:00Z' }];
  const h = harness({ comments, checkOk: false });
  const out = await run({ db, env: { ...env, APPROVER_NAME: 'Marian Grout' }, log, deps: h.deps });
  assert.equal(out.results[0].outcome, 'merged');
  assert.equal(out.results[0].mode, 'override');
  assert.match(h.pushed(), /approved_by: Marian Grout/);
  assert.ok(merged(h.calls));
});

test('unfetchable source fails its claim', async () => {
  const r = await factCheck(basePost, { fetchImpl: okFetch({ [SRC2]: 'throw' }), completeImpl: allSupported });
  assert.equal(r.ok, false);
  assert.equal(r.verdicts[0].verdict, 'supported');
  assert.equal(r.verdicts[1].verdict, 'unsupported');
  assert.equal(r.verdicts[1].reason, 'source unfetchable');
});

test('claims lint', () => {
  assert.deepEqual(claimsLint(basePost), []);
  assert.ok(claimsLint({ ...basePost, body: 'Our liquid dietary supplement.' }).some((i) => /liquid dietary/.test(i)));
  assert.ok(claimsLint({ ...basePost, body: 'Over 2,000 women have already joined.' }).some((i) => /count/.test(i)));
  assert.ok(claimsLint({ ...basePost, body: '3:17 prevents insomnia.' }).some((i) => /product efficacy/.test(i)));
});

test('AUTO_PUBLISH=false keeps the old flow: no gate, /approve approves but never merges', async () => {
  const db = await memDb();
  const off = { ...env, AUTO_PUBLISH: 'false' };
  const h0 = harness();
  assert.deepEqual((await run({ db, env: off, log, deps: h0.deps })).results, []);
  assert.equal(h0.pushed(), null);
  const h = harness({ comments: [{ user: { login: 'Gahroot' }, body: '/approve', created_at: '2026-10-25T11:00:00Z' }] });
  const out = await processPr(db, h.pr, { env: off, deps: h.deps, log });
  assert.equal(out.mode, 'manual');
  assert.match(h.pushed(), /approved_by: Gahroot/);
  assert.ok(!merged(h.calls));
  assert.ok(!h.calls.some((c) => c.route.includes('check-runs')));
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM gate_results')).rows[0].n, 0);
});


// ---------- self-revision ----------
const overstatedOnce = () => {
  let n = 0;
  return async (sys, prompt) => {
    const items = JSON.parse(prompt.match(/excerpts\):\n([\s\S]*?)\n\nListed/)[1]);
    n++;
    const verdict = (i) => (n === 1 && i.index === 1 ? 'overstated' : 'supported');
    return JSON.stringify({ verdicts: items.map((i) => ({ index: i.index, verdict: verdict(i), reason: 'r' })), unlisted_medical_statements: [] });
  };
};

test('self-revision: content failure -> writer revises from verdicts, gate re-runs and merges', async () => {
  const db = await memDb();
  const h = harness({ complete: overstatedOnce() });
  const seen = [];
  h.deps.revise = async ({ post, verdicts }) => { seen.push(verdicts.filter((v) => v.verdict !== 'supported').length); return { ...post, claims: [post.claims[0], { text: 'Night waking is reported in perimenopause.', source: 2 }] }; };
  h.deps.finalize = async (post) => ({ post, dropped: [], issues: [] });
  const pushes = [];
  const orig = h.deps.commitAndPush;
  h.deps.commitAndPush = async (dir, branch, msg) => { pushes.push({ branch, msg }); return orig(dir); };
  const out = await run({ db, env, log, deps: h.deps });
  assert.equal(out.results[0].outcome, 'merged');
  assert.deepEqual(seen, [1], 'revised once, with the one overstated verdict');
  assert.match(pushes[0].msg, /Auto-revise post from fact-check feedback \(round 1\/2\)/);
  assert.equal(pushes[0].branch, 'blog/wake-3am');
  const rows = (await db.query('SELECT outcome FROM gate_results ORDER BY id')).rows.map((r) => r.outcome);
  assert.deepEqual(rows, ['revised', 'approved', 'merged']);
  assert.ok(h.calls.some((c) => c.method === 'POST' && /Auto-revising \(round 1\/2\)/.test((c.body || {}).body || '')));
});

test('self-revision: still failing after 2 rounds -> held for the owner, says so', async () => {
  const db = await memDb();
  const always = async (s, p) => {
    const items = JSON.parse(p.match(/excerpts\):\n([\s\S]*?)\n\nListed/)[1]);
    return JSON.stringify({ verdicts: items.map((i) => ({ index: i.index, verdict: 'unsupported', reason: 'no' })), unlisted_medical_statements: [] });
  };
  const h = harness({ complete: always });
  let revisions = 0;
  let head = 0;
  h.deps.revise = async ({ post }) => { revisions++; return post; };
  h.deps.finalize = async (post) => ({ post, dropped: [], issues: [] });
  h.deps.headSha = async () => `rev${++head}`;
  const realGh = h.deps.gh;
  h.deps.gh = async (method, route, body) => (method === 'GET' && /\/pulls\/7$/.test(route) ? { ...h.pr, head: { ...h.pr.head, sha: `rev${head}` } } : realGh(method, route, body));
  const out = await run({ db, env, log, deps: h.deps });
  assert.equal(out.results[0].outcome, 'held');
  assert.equal(revisions, 2);
  assert.match(out.results[0].why, /Still failing after 2 automatic revision round\(s\)/);
  assert.ok(!merged(h.calls));
});

test('self-revision is not attempted for CI/build failures or fact-check infrastructure errors', async () => {
  for (const opts of [{ checkOk: false }, { complete: async () => { throw new Error('anthropic 500'); } }]) {
    const db = await memDb();
    const h = harness(opts);
    let revisions = 0;
    h.deps.revise = async ({ post }) => { revisions++; return post; };
    const out = await run({ db, env, log, deps: h.deps });
    assert.equal(out.results[0].outcome, 'held');
    assert.equal(revisions, 0);
  }
});
