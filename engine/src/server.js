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

// Schedules are in America/New_York. days: 0=Sun..6=Sat.
export const JOBS = {
  monitor: { schedule: { hour: 6 }, run: monitor.run },
  research: { schedule: { hour: 7, days: [0] }, run: research.run },
  report: { schedule: { hour: 8, days: [1] }, run: report.run },
  draft: { schedule: { hour: 9, days: [1, 4] }, run: draft.run },
  ai_visibility: { schedule: { hour: 10, days: [3] }, run: aiVisibility.run },
  optimize: { schedule: { hour: 11, days: [5] }, run: optimize.run },
  // Hourly: automated approval gate for open engine PRs not yet gated (was `approve`).
  gate: { schedule: { hourly: true }, run: gate.run }
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
