// Scholarly metadata via official, bot-friendly APIs. Publisher sites (LWW, JAMA, Cochrane, Wiley...)
// often answer automated requests with 403, so DOIs are verified via Crossref and abstracts come from PubMed (NCBI E-utilities).
const MAILTO = 'hello@back2sleepnow.com';
const UA = `Back2SleepNow-SourceCheck/1.0 (https://back2sleepnow.com; mailto:${MAILTO})`;
const NCBI = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

export function doiOf(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)doi\.org$/i.test(u.hostname)) return null;
    const doi = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    return /^10\.\d{4,9}\/\S+$/.test(doi) ? doi : null;
  } catch { return null; }
}

export function pmidOf(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)pubmed\.ncbi\.nlm\.nih\.gov$/i.test(u.hostname) && !/ncbi\.nlm\.nih\.gov$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/(?:pubmed\/)?(\d{5,9})\/?$/);
    return m ? m[1] : null;
  } catch { return null; }
}

// NCBI allows 3 requests/second without an API key: serialise calls with a small gap.
let ncbiChain = Promise.resolve();
function ncbi(fetchImpl, url) {
  const p = ncbiChain.then(() => fetchImpl(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) }));
  ncbiChain = p.then(() => new Promise((r) => setTimeout(r, 350)), () => new Promise((r) => setTimeout(r, 350)));
  return p;
}
const ncbiParams = `tool=back2sleep-engine&email=${encodeURIComponent(MAILTO)}`;

/** { found: true, title, year, publisher } | { found: false } (DOI does not exist) | null (lookup failed). */
export async function crossrefWork(doi, { fetchImpl = globalThis.fetch } = {}) {
  try {
    const res = await fetchImpl(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=${encodeURIComponent(MAILTO)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20_000) });
    if (res.status === 404) return { found: false };
    if (!res.ok) return null;
    const m = (await res.json()).message || {};
    const year = ((m.issued || m.published || {})['date-parts'] || [[null]])[0][0];
    return {
      found: true,
      title: (m.title || [])[0] || null,
      year: year || null,
      publisher: (m['container-title'] || [])[0] || m.publisher || null,
      abstract: m.abstract ? String(m.abstract).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null
    };
  } catch { return null; }
}

export async function pmidForDoi(doi, { fetchImpl = globalThis.fetch } = {}) {
  try {
    const res = await ncbi(fetchImpl, `${NCBI}/esearch.fcgi?db=pubmed&retmode=json&${ncbiParams}&term=${encodeURIComponent(`${doi}[doi]`)}`);
    if (!res.ok) return null;
    const ids = ((await res.json()).esearchresult || {}).idlist || [];
    return ids[0] || null;
  } catch { return null; }
}

/** Does this PMID exist? true / false / null (lookup failed). */
export async function pubmedExists(pmid, { fetchImpl = globalThis.fetch } = {}) {
  try {
    const res = await ncbi(fetchImpl, `${NCBI}/esummary.fcgi?db=pubmed&retmode=json&${ncbiParams}&id=${pmid}`);
    if (!res.ok) return null;
    const r = ((await res.json()).result || {})[pmid];
    return Boolean(r && !r.error && r.title);
  } catch { return null; }
}

export async function pubmedAbstract(pmid, { fetchImpl = globalThis.fetch } = {}) {
  try {
    const res = await ncbi(fetchImpl, `${NCBI}/efetch.fcgi?db=pubmed&rettype=abstract&retmode=text&${ncbiParams}&id=${pmid}`);
    if (!res.ok) return null;
    const t = String(await res.text()).replace(/\s+/g, ' ').trim();
    return t.length >= 40 ? t.slice(0, 6000) : null;
  } catch { return null; }
}

/** Title + abstract for a DOI or PubMed URL, or null when the URL isn't scholarly / nothing was found. */
export async function scholarlyText(url, { fetchImpl = globalThis.fetch } = {}) {
  const doi = doiOf(url);
  let pmid = pmidOf(url);
  if (doi && !pmid) pmid = await pmidForDoi(doi, { fetchImpl });
  if (pmid) { const t = await pubmedAbstract(pmid, { fetchImpl }); if (t) return t; }
  if (doi) {
    const w = await crossrefWork(doi, { fetchImpl });
    if (w && w.found && (w.title || w.abstract)) return [w.title, w.abstract].filter(Boolean).join('\n').slice(0, 6000);
  }
  return null;
}
