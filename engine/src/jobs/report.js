import { gh, repoName, githubConfigured, upsertIssue } from '../github.js';
import { QUALIFIED_STAGES } from '../api.js';

export async function buildReport(db, { since = 7 } = {}) {
  const q = (sql, p = []) => db.query(sql, p).then((r) => r.rows);
  const traffic = await q(`SELECT provider, COALESCE(SUM(clicks),0)::int AS clicks, COALESCE(SUM(impressions),0)::int AS impressions,
    COALESCE(SUM(position*impressions)/NULLIF(SUM(impressions),0),0) AS position FROM metrics_daily WHERE day > CURRENT_DATE - ${since} GROUP BY provider`);
  const topQueries = await q(`SELECT query, SUM(clicks)::int AS clicks, SUM(impressions)::int AS impressions, AVG(position) AS position
    FROM metrics_daily WHERE provider='gsc' AND query <> '' AND day > CURRENT_DATE - ${since} GROUP BY query ORDER BY 3 DESC LIMIT 10`);
  const views = await q(`SELECT type, SUM(count)::int AS n FROM events WHERE day > CURRENT_DATE - ${since} GROUP BY type`);
  const stages = QUALIFIED_STAGES.map((s) => `'${s}'`).join(',');
  const bySource = await q(`SELECT COALESCE(s.source,'unknown') AS source, COUNT(*)::int AS signups,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM quiz_answers qa WHERE qa.email = s.email AND qa.stage IN (${stages})))::int AS qualified
    FROM signups s WHERE s.created_at > now() - interval '${since} days' GROUP BY 1 ORDER BY 2 DESC`);
  const indexing = await q("SELECT slug, COALESCE(index_status,'unknown') AS index_status FROM posts WHERE status='published' ORDER BY slug");
  const ai = await q(`SELECT provider, COUNT(*)::int AS asked, COUNT(*) FILTER (WHERE cited)::int AS cited, COUNT(*) FILTER (WHERE mentioned)::int AS mentioned
    FROM ai_visibility WHERE day > CURRENT_DATE - ${since} GROUP BY provider`);
  const jobs = await q(`SELECT job, COUNT(*)::int AS runs, COUNT(*) FILTER (WHERE status='failed')::int AS failed, MAX(finished_at) AS last
    FROM job_runs WHERE started_at > now() - interval '${since} days' GROUP BY job ORDER BY job`);
  const awaiting = await q("SELECT slug, title, pr_url FROM posts WHERE status IN ('draft','approved') AND pr_url IS NOT NULL ORDER BY created_at");
  const next = await q("SELECT keyword, score FROM opportunities WHERE status='open' ORDER BY score DESC LIMIT 5");
  const sitemap = await q("SELECT ok, detail FROM checks WHERE name='sitemap' ORDER BY created_at DESC LIMIT 1");

  const tot = bySource.reduce((a, r) => ({ s: a.s + r.signups, q: a.q + r.qualified }), { s: 0, q: 0 });
  const table = (head, rows) => rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n') : '_No data yet._';
  const n1 = (x) => (x == null ? '–' : Number(x).toFixed(1));
  return [
    `## Signups (last ${since} days)`,
    `**${tot.s} signups, ${tot.q} qualified** (quiz stage = peri/menopause/post-menopause).`,
    table(['Source', 'Signups', 'Qualified'], bySource.map((r) => [r.source, r.signups, r.qualified])),
    '', '## Traffic',
    table(['Provider', 'Clicks', 'Impressions', 'Avg position'], traffic.map((r) => [r.provider, r.clicks, r.impressions, n1(r.position)])),
    '', `On-site events: ${views.map((v) => `${v.type} ${v.n}`).join(', ') || 'none'}`,
    '', '## Top queries (GSC)',
    table(['Query', 'Clicks', 'Impr.', 'Pos.'], topQueries.map((r) => [r.query, r.clicks, r.impressions, n1(r.position)])),
    '', '## Indexing',
    table(['Post', 'Status'], indexing.map((r) => [r.slug, r.index_status])),
    `Sitemap: ${sitemap[0] ? `${sitemap[0].ok ? 'ok' : 'PROBLEM'} (${sitemap[0].detail})` : 'not checked yet'}`,
    '', '## AI visibility',
    table(['Engine', 'Asked', 'Cited', 'Mentioned'], ai.map((r) => [r.provider, r.asked, r.cited, r.mentioned])),
    '', '## Job health',
    table(['Job', 'Runs', 'Failed', 'Last finished'], jobs.map((r) => [r.job, r.runs, r.failed, r.last ? new Date(r.last).toISOString().slice(0, 16) : '–'])),
    '', '## PRs awaiting approval',
    awaiting.length ? awaiting.map((r) => `- [ ] [${r.title}](${r.pr_url})`).join('\n') : '_None._',
    '', '## Next priorities',
    next.length ? next.map((r) => `- ${r.keyword} (score ${n1(r.score)})`).join('\n') : '_Run research to fill the queue._'
  ].join('\n');
}

export async function run({ db, env = process.env }) {
  const weekOf = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const body = await buildReport(db);
  let url = null;
  if (githubConfigured(env)) {
    const repo = repoName(env);
    try { await gh('POST', `/repos/${repo}/labels`, { name: 'weekly-report', color: '1d76db' }, env); } catch {}
    url = (await gh('POST', `/repos/${repo}/issues`, { title: `Weekly report — ${weekOf}`, body, labels: ['weekly-report'] }, env)).html_url;
  }
  await db.query('INSERT INTO reports (week_of, body, issue_url) VALUES ($1,$2,$3)', [weekOf, body, url]);
  return { issue: url || 'GITHUB_TOKEN not configured; saved in DB only' };
}

export async function alert(job, message, env = process.env) {
  if (!githubConfigured(env)) return;
  await upsertIssue({ title: `Engine job failing: ${job}`, label: 'engine-alert', body: `Job \`${job}\` failed after 3 attempts at ${new Date().toISOString()}.\n\n\`\`\`\n${message}\n\`\`\`\n\nRe-run: \`GET /api/admin/run/${job}\` with the admin token. Close this issue once fixed.` }, env);
}
