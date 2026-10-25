// HTTP API per CONTRACT section 3, plus admin endpoints.
import crypto from 'node:crypto';

const ALLOWED_ORIGINS = [
  /^https:\/\/back2sleepnow\.com$/,
  /^https:\/\/www\.back2sleepnow\.com$/,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost:8317$/,
  /^http:\/\/127\.0\.0\.1:8317$/
];
export const isAllowedOrigin = (o) => typeof o === 'string' && ALLOWED_ORIGINS.some((r) => r.test(o));

const EMAIL_RE = /^[^\s@<>()[\],;:"]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const REF_RE = /^[a-zA-Z0-9_-]{3,40}$/;
const EVENT_TYPES = new Set(['pageview', 'cta_view', 'cta_click']);
export const QUIZ = {
  wakeTime: new Set(['before-2am', '2-3am', '3-4am', 'after-4am']),
  stage: new Set(['perimenopause', 'menopause', 'postmenopause', 'not-sure']),
  next: new Set(['cool', 'calm', 'travel', 'restore'])
};
export const QUALIFIED_STAGES = ['perimenopause', 'menopause', 'postmenopause'];

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const short = (v, max = 120) => str(v, max).replace(/[^\w:./@+-]/g, '') || null;

export function validateSignup(body) {
  if (!body || typeof body !== 'object') return { error: 'invalid_body' };
  const email = str(body.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: 'invalid_email' };
  const ref = str(body.ref, 40);
  return {
    value: {
      email,
      ref: REF_RE.test(ref) ? ref : null,
      source: short(body.source) || 'unknown',
      page: str(body.page, 300).replace(/[?#].*$/, '') || null,
      landing_page: str(body.landing_page, 300).replace(/[?#].*$/, '') || null,
      utm_source: short(body.utm_source, 80),
      utm_medium: short(body.utm_medium, 80),
      utm_campaign: short(body.utm_campaign, 120)
    },
    honeypot: typeof body.company === 'string' && body.company.trim() !== ''
  };
}

export function validateQuiz(body) {
  if (!body || typeof body !== 'object') return { error: 'invalid_body' };
  const email = str(body.email, 254).toLowerCase();
  const pick = (k) => (QUIZ[k].has(body[k]) ? body[k] : null);
  const v = { email: EMAIL_RE.test(email) ? email : null, wakeTime: pick('wakeTime'), stage: pick('stage'), next: pick('next') };
  if (!v.wakeTime && !v.stage && !v.next) return { error: 'empty_quiz' };
  return { value: v };
}

export function validateEvent(body) {
  if (!body || typeof body !== 'object') return { error: 'invalid_body' };
  if (!EVENT_TYPES.has(body.type)) return { error: 'invalid_type' };
  const path = str(body.path, 300).replace(/[?#].*$/, '');
  if (!path.startsWith('/')) return { error: 'invalid_path' };
  let referrerHost = '';
  try { if (body.referrer) referrerHost = new URL(String(body.referrer)).hostname.slice(0, 120); } catch {}
  return { value: { type: body.type, path, source: short(body.source) || '', referrerHost } };
}

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newReferralCode(len = 8) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}

// In-memory fixed-window limiter. Keys are salted hashes, never raw IPs, and are never persisted.
export function createRateLimiter({ limit = 20, windowMs = 60_000, now = Date.now } = {}) {
  const salt = crypto.randomBytes(16);
  let windowStart = now();
  let hits = new Map();
  return (ip) => {
    const t = now();
    if (t - windowStart >= windowMs) { hits = new Map(); windowStart = t; }
    const key = crypto.createHmac('sha256', salt).update(String(ip)).digest('base64').slice(0, 16);
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    return n <= limit;
  };
}

export async function insertSignup(db, v) {
  for (let i = 0; i < 5; i++) {
    const existing = await db.query('SELECT referral_code FROM signups WHERE email = $1', [v.email]);
    if (existing.rows.length) return { referralCode: existing.rows[0].referral_code, duplicate: true };
    try {
      const code = newReferralCode();
      await db.query(
        `INSERT INTO signups (email, referral_code, ref, source, page, landing_page, utm_source, utm_medium, utm_campaign)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [v.email, code, v.ref, v.source, v.page, v.landing_page, v.utm_source, v.utm_medium, v.utm_campaign]
      );
      return { referralCode: code, duplicate: false };
    } catch (e) {
      if (e.code !== '23505' && !/unique|duplicate/i.test(e.message)) throw e;
      // race on email or code collision: loop re-reads / retries
    }
  }
  throw new Error('could not allocate referral code');
}

async function readJson(req, max = 8192) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > max) throw Object.assign(new Error('too_large'), { status: 413 });
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('invalid_json'), { status: 400 }); }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function createHandler({ db, scheduler = null, adminToken = process.env.ADMIN_TOKEN, limiter = createRateLimiter(), log = console }) {
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const origin = req.headers.origin;
    const headers = { 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (isAllowedOrigin(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      headers['Access-Control-Allow-Headers'] = 'Content-Type';
      headers['Access-Control-Max-Age'] = '600';
    }
    const send = (status, body) => {
      if (body === undefined) { res.writeHead(status, headers); return res.end(); }
      res.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'OPTIONS') return send(origin && !isAllowedOrigin(origin) ? 403 : 204);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      if (path === '/api/health' && req.method === 'GET') return send(200, { ok: true });

      if (path.startsWith('/api/admin/')) {
        const auth = String(req.headers.authorization || '');
        if (!adminToken || !auth.startsWith('Bearer ') || !safeEqual(auth.slice(7), adminToken)) return send(401, { error: 'unauthorized' });
        if (req.method !== 'GET') return send(405, { error: 'method_not_allowed' });
        if (path === '/api/admin/status') return send(200, scheduler ? await scheduler.status() : { scheduler: 'off' });
        const m = path.match(/^\/api\/admin\/run\/([a-z_]+)$/);
        if (m) {
          if (!scheduler || !scheduler.has(m[1])) return send(404, { error: 'unknown_job' });
          const started = scheduler.trigger(m[1]);
          return send(202, { job: m[1], started });
        }
        return send(404, { error: 'not_found' });
      }

      if (['/api/signup', '/api/quiz', '/api/event'].includes(path)) {
        if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' });
        if (origin && !isAllowedOrigin(origin)) return send(403, { error: 'origin_not_allowed' });
        const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
        if (!limiter(ip)) return send(429, { error: 'rate_limited' });
        const body = await readJson(req);

        if (path === '/api/signup') {
          const r = validateSignup(body);
          if (r.error) return send(400, { error: r.error });
          if (r.honeypot) return send(200, { referralCode: newReferralCode() });
          const { referralCode } = await insertSignup(db, r.value);
          return send(200, { referralCode });
        }
        if (path === '/api/quiz') {
          const r = validateQuiz(body);
          if (r.error) return send(400, { error: r.error });
          const v = r.value;
          await db.query('INSERT INTO quiz_answers (email, wake_time, stage, next) VALUES ($1,$2,$3,$4)', [v.email, v.wakeTime, v.stage, v.next]);
          return send(200, { ok: true });
        }
        const r = validateEvent(body);
        if (r.error) return send(400, { error: r.error });
        const v = r.value;
        await db.query(
          `INSERT INTO events (day, type, path, source, referrer_host, count) VALUES ($5::date, $1, $2, $3, $4, 1)
           ON CONFLICT (day, type, path, source, referrer_host) DO UPDATE SET count = events.count + 1`,
          [v.type, v.path, v.source, v.referrerHost, new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })]
        );
        return send(204);
      }
      return send(404, { error: 'not_found' });
    } catch (e) {
      if (e.status) return send(e.status, { error: e.message });
      log.error('request failed', req.method, url.pathname, e.message);
      return send(500, { error: 'server_error' });
    }
  };
}
