import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySources } from '../src/sources.js';
import { fetchSourceText } from '../src/jobs/gate.js';
import { doiOf, pmidOf } from '../src/scholar.js';

const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), body: null });
const text = (status, t) => ({ ok: status < 400, status, text: async () => t, body: null });
const REAL = '10.1097/GME.0000000000002200';
const fetchImpl = async (url) => {
  if (url.startsWith('https://api.crossref.org/works/')) {
    const doi = decodeURIComponent(url.split('/works/')[1].split('?')[0]);
    if (doi === REAL) return json(200, { message: { title: ['The 2023 nonhormone therapy position statement of The North American Menopause Society'], issued: { 'date-parts': [[2023, 6]] }, 'container-title': ['Menopause'] } });
    return json(404, {});
  }
  if (url.includes('esearch.fcgi')) return json(200, { esearchresult: { idlist: url.includes(encodeURIComponent(REAL)) ? ['37252752'] : [] } });
  if (url.includes('esummary.fcgi')) return json(200, { result: { 37252752: { title: 'The 2023 nonhormone therapy position statement' } } });
  if (url.includes('efetch.fcgi')) return text(200, '1. Menopause. 2023. The 2023 nonhormone therapy position statement. OBJECTIVE: To update the evidence-based position statement on nonhormone therapy for vasomotor symptoms.');
  return text(403, 'Forbidden'); // publisher site blocks bots
};

test('paper URLs are parsed', () => {
  assert.equal(doiOf(`https://doi.org/${REAL}`), REAL);
  assert.equal(doiOf('https://www.nhs.uk/x'), null);
  assert.equal(pmidOf('https://pubmed.ncbi.nlm.nih.gov/37252752/'), '37252752');
});

test('DOIs are verified via Crossref (publisher 403 ignored), titles corrected; wrong-paper and fake DOIs dropped', async () => {
  const { verified, dropped } = await verifySources([
    { id: 1, title: 'Nonhormonal management of menopause-associated vasomotor symptoms: 2023 position statement of The North American Menopause Society', publisher: 'x', year: 2022, url: `https://doi.org/${REAL}` },
    { id: 2, title: 'Magnesium supplementation and sleep in older adults', url: `https://doi.org/${REAL}` },
    { id: 3, title: 'Invented', url: 'https://doi.org/10.9999/not.real' },
    { id: 4, title: 'PubMed record', url: 'https://pubmed.ncbi.nlm.nih.gov/37252752/' }
  ], { fetchImpl });
  assert.deepEqual(verified.map((s) => s.id), [1, 4]);
  assert.equal(verified[0].title, 'The 2023 nonhormone therapy position statement of The North American Menopause Society');
  assert.equal(verified[0].year, 2023);
  assert.equal(verified[0].publisher, 'Menopause');
  assert.match(dropped.find((d) => d.source.id === 2).reason, /^doi_points_to_different_paper/);
  assert.equal(dropped.find((d) => d.source.id === 3).reason, 'doi_not_found');
});

test('fact-check source text for a DOI comes from the PubMed abstract', async () => {
  const t = await fetchSourceText(`https://doi.org/${REAL}`, fetchImpl);
  assert.match(t, /OBJECTIVE: To update/);
});
