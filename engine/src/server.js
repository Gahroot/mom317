import http from 'node:http';
import { createPool, migrate } from './db.js';
import { createHandler } from './api.js';
import { createScheduler } from './scheduler.js';
import * as research from './jobs/research.js';
import * as draft from './jobs/draft.js';
import * as gate from './jobs/gate.js';
import * as monitor from './jobs/monitor.js';
import * as aiVisibility from './jobs/aiVisibility.js';
import * as optimize from './jobs/optimize.js';
import * as report from './jobs/report.js';
import * as audit from './jobs/audit.js';
import { pollBatches } from './llm.js';
import { keepalive, KEEPALIVE_SCHEDULE } from './codex.js';

// Schedules are in America/New_York. days: 0=Sun..6=Sat.
export const JOBS = {
  monitor: { schedule: { hour: 6 }, run: monitor.run },
  // research/draft/optimize run early morning so their Codex calls land in the off-hours window (before 8:00 NY).
  research: { schedule: { hour: 3, days: [0] }, run: research.run },
  report: { schedule: { hour: 8, days: [1] }, run: report.run },
  draft: { schedule: { hour: 4, days: [1, 4] }, run: draft.run },
  ai_visibility: { schedule: { hour: 10, days: [3] }, run: aiVisibility.run },
  optimize: { schedule: { hour: 5, days: [5] }, run: optimize.run },
  // Weekly tiny Codex call so it refreshes auth.json in quiet weeks.
  codex_keepalive: { schedule: KEEPALIVE_SCHEDULE, run: keepalive },
  // Sat 4:00 NY: re-check up to 2 published posts not audited in 30 days; failing ones get a self-revising refresh PR.
  audit: { schedule: { hour: 4, days: [6] }, run: audit.run },
  // Hourly: automated approval gate for open engine PRs not yet gated (was `approve`).
  gate: { schedule: { hourly: true }, run: gate.run },
  // Hourly: poll Anthropic Message Batches (research/optimize); re-run the job whose result is ready.
  ai_batches: { schedule: { hourly: true }, run: async (ctx) => {
    const ready = await pollBatches(ctx);
    const out = {};
    for (const job of ready) out[job] = JOBS[job] ? await JOBS[job].run(ctx) : 'unknown job';
    return ready.length ? out : { skipped: 'no batch results ready' };
  } }
};

const db = createPool();
await migrate(db);
const scheduler = createScheduler({ db, jobs: JOBS, onFailure: (job, msg) => report.alert(job, msg) });
const server = http.createServer(createHandler({ db, scheduler }));
const port = Number(process.env.PORT) || 8080;
server.listen(port, () => console.log(`engine listening on ${port}`));
if (process.env.SCHEDULER !== 'off') await scheduler.start();

const shutdown = () => { scheduler.stop(); server.close(() => db.end().then(() => process.exit(0))); setTimeout(() => process.exit(0), 8000).unref(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
