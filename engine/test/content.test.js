import test from 'node:test';
import assert from 'node:assert/strict';
import { serializePost, parsePost, setApproval, slugify } from '../src/frontmatter.js';
import { verifyUrl, verifySources, isTrustedUrl } from '../src/sources.js';
import { buildPost, finalizePost, lintPost } from '../src/jobs/draft.js';
import { findApproval } from '../src/jobs/approve.js';
import { scoreOpportunity } from '../src/jobs/research.js';
import { findCandidates } from '../src/jobs/optimize.js';
import { detect } from '../src/jobs/aiVisibility.js';
import { prBody } from '../src/jobs/publish.js';

const raw = {
  title: 'Why do I wake at 3 a.m. in menopause?',
  description: 'x'.repeat(155),
  primary_keyword: 'Waking at 3am menopause',
  secondary_keywords: ['night waking perimenopause'],
  answer: 'Short answer.',
  faq: [{ q: 'Is it normal?', a: 'Yes: common.' }],
  sources: [{ id: 1, title: 'Sleep in menopause', publisher: 'NIH', year: 2023, url: 'https://pubmed.ncbi.nlm.nih.gov/1/' }, { id: 2, title: 'Fake', publisher: 'X', year: 2020, url: 'https://doi.org/10.0/missing' }],
  claims: [{ text: 'Hot flashes are associated with awakenings.', source: 1 }, { text: 'Other.', source: 2 }],
  body: '## Why does it happen?\n\nHot flashes[^1] and more[^2].'
};

test('frontmatter round-trip in contract format', () => {
  const post = buildPost(raw, { today: '2026-10-27', keyword: 'k' });
  assert.equal(post.slug, 'why-do-i-wake-at-3-a-m-in-menopause');
  const text = serializePost(post);
  assert.match(text, /^---\ntitle: Why do I wake at 3 a\.m\. in menopause\?\nslug: why-do-i-wake-at-3-a-m-in-menopause\n/);
  assert.match(text, /\nstatus: draft\napproved_by:\nprimary_keyword: waking at 3am menopause\nsecondary_keywords:\n  - night waking perimenopause\n/);
  assert.match(text, /\nfaq:\n  - q: Is it normal\?\n    a: Yes: common\.\n/);
  assert.match(text, /\nsources:\n  - id: 1\n    title: Sleep in menopause\n    publisher: NIH\n    year: 2023\n    url: https:\/\/pubmed/);
  const back = parsePost(text);
  assert.equal(back.title, post.title);
  assert.equal(back.sources[1].url, 'https://doi.org/10.0/missing');
  assert.equal(back.faq[0].a, 'Yes: common.');
  assert.match(back.body, /\[\^2\]/);
  const ap = parsePost(setApproval(text, 'Marian Grout', '2026-10-28'));
  assert.equal(ap.status, 'approved');
  assert.equal(ap.approved_by, 'Marian Grout');
  assert.equal(ap.updated, '2026-10-28');
  assert.equal(slugify("Can't sleep? Try this!"), 'cant-sleep-try-this');
});

const mockFetch = (map) => async (url, opts) => {
  const s = map[url];
  if (s === 'throw') throw new TypeError('fetch failed');
  if (opts.method === 'HEAD' && s === 405) return { status: 405 };
  return { status: s === 405 ? 200 : s ?? 404 };
};

test('source URL verification', async () => {
  assert.ok(!isTrustedUrl('https://randomblog.com/a'));
  assert.ok(!isTrustedUrl('http://pubmed.ncbi.nlm.nih.gov/1/'));
  const f = mockFetch({ 'https://pubmed.ncbi.nlm.nih.gov/1/': 200, 'https://www.acog.org/x': 405, 'https://menopause.org/y': 301, 'https://nih.gov/z': 'throw' });
  assert.equal((await verifyUrl('https://pubmed.ncbi.nlm.nih.gov/1/', { fetchImpl: f })).ok, true);
  assert.equal((await verifyUrl('https://www.acog.org/x', { fetchImpl: f })).ok, true, 'HEAD 405 falls back to GET');
  assert.equal((await verifyUrl('https://menopause.org/y', { fetchImpl: f })).ok, true);
  assert.equal((await verifyUrl('https://nih.gov/z', { fetchImpl: f })).reason, 'network_error');
  assert.equal((await verifyUrl('https://randomblog.com', { fetchImpl: f })).reason, 'untrusted_or_invalid_host');
  const { verified, dropped } = await verifySources(raw.sources, { fetchImpl: f });
  assert.equal(verified.length, 1);
  assert.equal(dropped[0].reason, 'http_404');

  const fin = await finalizePost(buildPost(raw, { today: '2026-10-27', keyword: 'k' }), { fetchImpl: f });
  assert.equal(fin.post.sources.length, 1);
  assert.doesNotMatch(fin.post.body, /\[\^2\]/, 'dropped citation removed');
  assert.ok(fin.issues.some((i) => i.startsWith('unsourced claim')));
  const body = prBody({ post: fin.post, dropped: fin.dropped, buildNote: 'ok' });
  assert.match(body, /- \[ \] Hot flashes/);
  assert.match(body, /UNSOURCED/);
  assert.match(body, /comment `\/approve`/);
  assert.match(body, /Dropped/);
});

test('lint flags efficacy language', () => {
  const p = buildPost({ ...raw, body: '## Q?\n\nThis shot cures insomnia.' }, { today: 'd', keyword: 'k' });
  assert.ok(lintPost(p).some((i) => /efficacy/.test(i)));
});

test('approval comment must be from repo owner', () => {
  const cs = [{ user: { login: 'stranger' }, body: '/approve' }, { user: { login: 'Gahroot' }, body: 'looks good\n/approve' }];
  assert.equal(findApproval(cs, 'gahroot').user.login, 'Gahroot');
  assert.equal(findApproval(cs.slice(0, 1), 'gahroot'), null);
});

test('scoring, optimize candidates, AI detection', () => {
  const fit = scoreOpportunity({ audienceFit: 1, nightWakingFit: 1, intent: 'problem_aware', impressions: 10 });
  const vol = scoreOpportunity({ audienceFit: 0.2, nightWakingFit: 0.1, intent: 'informational', impressions: 100000 });
  assert.ok(fit > vol, 'intent fit beats volume');
  const c = findCandidates([
    { slug: 'a', impressions: 500, clicks: 2, position: 8, views: 0, signups: 0 },
    { slug: 'b', impressions: 10, clicks: 5, position: 2, views: 10, signups: 2 }
  ]);
  assert.deepEqual(c.map((x) => x.slug), ['a']);
  assert.deepEqual(detect('see Back2SleepNow', []), { cited: false, mentioned: true });
  assert.deepEqual(detect('x', ['https://back2sleepnow.com/blog/a']), { cited: true, mentioned: true });
});
