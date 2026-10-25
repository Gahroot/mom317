import { gscConfigured, searchAnalytics, inspectUrl, bingQueryStats } from '../gsc.js';

const isoDay = (d) => d.toISOString().slice(0, 10);

export async function run({ db, env = process.env, log }) {
  const notes = {};
  const site = (env.SITE_URL || 'https://back2sleepnow.com').replace(/\/$/, '');

  if (gscConfigured(env)) {
    const end = new Date(Date.now() - 2 * 86400e3), start = new Date(Date.now() - 9 * 86400e3);
    const rows = await searchAnalytics({ startDate: isoDay(start), endDate: isoDay(end) }, env);
    for (const r of rows) {
      const [day, page, query] = r.keys;
      await db.query(
        `INSERT INTO metrics_daily (day, provider, page, query, clicks, impressions, ctr, position) VALUES ($1,'gsc',$2,$3,$4,$5,$6,$7)
         ON CONFLICT (day, provider, page, query) DO UPDATE SET clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions, ctr = EXCLUDED.ctr, position = EXCLUDED.position`,
        [day, page, query, r.clicks, r.impressions, r.ctr, r.position]
      );
    }
    notes.gsc = `${rows.length} rows`;
    const posts = (await db.query("SELECT slug FROM posts WHERE status = 'published'")).rows;
    for (const p of posts) {
      try {
        const s = await inspectUrl(`${site}/blog/${p.slug}`, env);
        await db.query('UPDATE posts SET index_status = $2 WHERE slug = $1', [p.slug, s]);
      } catch (e) { log.error('[monitor] inspect', p.slug, e.message); }
    }
    notes.inspected = posts.length;
  } else notes.gsc = 'not configured (GSC_SERVICE_ACCOUNT_JSON)';

  if (env.BING_API_KEY) {
    const rows = await bingQueryStats(env);
    for (const r of rows) {
      await db.query(
        `INSERT INTO metrics_daily (day, provider, page, query, clicks, impressions, position) VALUES ($1,'bing','',$2,$3,$4,$5)
         ON CONFLICT (day, provider, page, query) DO UPDATE SET clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions, position = EXCLUDED.position`,
        [r.day, r.query, r.clicks, r.impressions, r.position]
      );
    }
    notes.bing = `${rows.length} rows`;
  } else notes.bing = 'not configured (BING_API_KEY)';

  try {
    const res = await fetch(`${site}/sitemap.xml`, { signal: AbortSignal.timeout(20_000) });
    const text = res.ok ? await res.text() : '';
    const urls = (text.match(/<loc>/g) || []).length;
    const ok = res.ok && urls > 0;
    await db.query('INSERT INTO checks (day, name, ok, detail) VALUES (CURRENT_DATE, $1, $2, $3)', ['sitemap', ok, `${res.status}, ${urls} urls`]);
    notes.sitemap = `${res.status}, ${urls} urls`;
  } catch (e) {
    await db.query('INSERT INTO checks (day, name, ok, detail) VALUES (CURRENT_DATE, $1, false, $2)', ['sitemap', e.message]);
    notes.sitemap = `error: ${e.message}`;
  }

  const { rows } = await db.query("SELECT COALESCE(source,'unknown') AS source, COUNT(*)::int AS n FROM signups WHERE created_at > now() - interval '1 day' GROUP BY 1");
  notes.signups24h = Object.fromEntries(rows.map((r) => [r.source, r.n]));
  return notes;
}
