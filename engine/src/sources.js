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

export async function verifySources(sources, opts) {
  const results = await Promise.all((sources || []).map(async (s) => ({ source: s, ...(await verifyUrl(s.url, opts)) })));
  return { verified: results.filter((r) => r.ok).map((r) => r.source), dropped: results.filter((r) => !r.ok) };
}
