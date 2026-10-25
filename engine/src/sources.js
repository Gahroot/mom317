import { doiOf, pmidOf, crossrefWork, pubmedExists } from './scholar.js';

// Source URL verification: only real, resolvable, reputable sources may be cited.
export const TRUSTED_HOSTS = [
  'doi.org', 'nih.gov', 'ncbi.nlm.nih.gov', 'pubmed.ncbi.nlm.nih.gov', 'medlineplus.gov', 'cdc.gov', 'fda.gov',
  'menopause.org', 'acog.org', 'who.int', 'nice.org.uk', 'nhs.uk', 'cochranelibrary.com', 'jamanetwork.com',
  'nejm.org', 'thelancet.com', 'bmj.com', 'academic.oup.com', 'journals.lww.com', 'sciencedirect.com',
  'link.springer.com', 'onlinelibrary.wiley.com', 'nature.com', 'aasm.org', 'sleepfoundation.org', 'endocrine.org',
  'imsociety.org', 'mayoclinic.org', 'hopkinsmedicine.org', 'clevelandclinic.org', 'womenshealth.gov', 'frontiersin.org', 'mdpi.com'
];

export function isTrustedUrl(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') return false;
    const h = url.hostname.toLowerCase();
    return TRUSTED_HOSTS.some((t) => h === t || h.endsWith('.' + t));
  } catch { return false; }
}

const UA = 'Mozilla/5.0 (compatible; Back2SleepNow-SourceCheck/1.0; +https://back2sleepnow.com)';

/** Returns { ok, status, reason }. ok = trusted host AND resolves with 2xx/3xx. */
export async function verifyUrl(url, { fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  if (!isTrustedUrl(url)) return { ok: false, status: 0, reason: 'untrusted_or_invalid_host' };
  // Papers: ask Crossref / PubMed (publisher sites often return 403 to bots, which says nothing about the paper).
  const doi = doiOf(url);
  if (doi) {
    const w = await crossrefWork(doi, { fetchImpl });
    if (w && w.found) return { ok: true, status: 200, via: 'crossref', meta: w };
    if (w && !w.found) return { ok: false, status: 404, reason: 'doi_not_found' };
  }
  const pmid = pmidOf(url);
  if (pmid) {
    const e = await pubmedExists(pmid, { fetchImpl });
    if (e === true) return { ok: true, status: 200, via: 'pubmed' };
    if (e === false) return { ok: false, status: 404, reason: 'pmid_not_found' };
  }
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetchImpl(url, { method, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.body && typeof res.body.cancel === 'function') res.body.cancel().catch(() => {});
      if (res.status >= 200 && res.status < 400) return { ok: true, status: res.status };
      if (method === 'GET') return { ok: false, status: res.status, reason: `http_${res.status}` };
    } catch (e) {
      if (method === 'GET') return { ok: false, status: 0, reason: e.name === 'TimeoutError' ? 'timeout' : 'network_error' };
    }
  }
  return { ok: false, status: 0, reason: 'unreachable' };
}

const TITLE_STOP = new Set(['the', 'a', 'an', 'of', 'in', 'and', 'or', 'for', 'to', 'on', 'with', 'at', 'by', 'from', 'among', 'during', 'its', 'is', 'are']);
const titleWords = (t) => new Set(String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !TITLE_STOP.has(w)));
export function titleSimilarity(a, b) {
  const x = titleWords(a), y = titleWords(b);
  if (!x.size || !y.size) return 1; // nothing to compare: don't punish
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}

/**
 * Verifies every source. For DOIs, the Crossref record must match the cited title (an existing DOI that points
 * to a different paper is a classic AI hallucination); matching sources get Crossref's exact title/year/journal.
 */
export async function verifySources(sources, opts) {
  const results = await Promise.all((sources || []).map(async (s) => {
    const r = await verifyUrl(s.url, opts);
    if (!r.ok || !r.meta) return { source: s, ...r };
    if (r.meta.title && titleSimilarity(s.title, r.meta.title) < 0.25) {
      return { source: s, ok: false, status: 200, reason: `doi_points_to_different_paper: "${String(r.meta.title).slice(0, 120)}"` };
    }
    const fixed = { ...s, title: r.meta.title || s.title, year: r.meta.year || s.year, publisher: r.meta.publisher || s.publisher };
    return { source: fixed, ...r };
  }));
  return { verified: results.filter((r) => r.ok).map((r) => r.source), dropped: results.filter((r) => !r.ok) };
}
