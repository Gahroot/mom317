// Every 2 weeks (Wednesdays of even ISO weeks): ask answer engines target questions; record whether back2sleepnow.com is cited or mentioned.
import { checkBudget, budgetSkip, recordUsage } from '../cost.js';
import { httpError } from '../llm.js';

export const OPENAI_QUESTIONS = 5;
export const maxQuestions = (env = process.env) => Math.max(1, Number(env.AI_VIS_MAX_QUESTIONS) || 15);

/** NY calendar date of `d` -> { isoWeek, dayOfMonth } */
export function nyCalendar(d = new Date()) {
  const [y, m, day] = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, day));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow); // Thursday of this ISO week
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return { isoWeek: Math.ceil(((t - yearStart) / 86_400_000 + 1) / 7), dayOfMonth: day };
}

/** Runs on even ISO weeks only. OpenAI's (pricier) web-search check: only the first run of the month (day <= 14, since
 * runs are two weeks apart; the first Wednesday itself can fall in an odd week). */
export function visibilityPlan(date, env = process.env) {
  const { isoWeek, dayOfMonth } = nyCalendar(date);
  return { run: isoWeek % 2 === 0, isoWeek, openai: dayOfMonth <= 14, max: maxQuestions(env) };
}

export const BASE_QUESTIONS = [
  'Why do I wake up at 3am during menopause?',
  'How can I get back to sleep after waking in the night during perimenopause?',
  'What helps menopause night waking?',
  'Why do women in menopause wake up in the middle of the night?',
  'Is waking up every night normal in perimenopause?',
  'What causes night sweats that wake you up in menopause?'
];

export function detect(text, citations = [], domain = 'back2sleepnow.com') {
  const d = domain.toLowerCase();
  const cited = citations.some((c) => String(c).toLowerCase().includes(d));
  const t = String(text).toLowerCase();
  return { cited, mentioned: cited || t.includes(d) || /back2sleep ?now|\b3:17 sleep\b/.test(t) };
}

async function perplexity(env, q, db) {
  const model = env.PERPLEXITY_MODEL || 'sonar';
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.PERPLEXITY_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: q }] }),
    signal: AbortSignal.timeout(90_000)
  });
  if (!res.ok) throw httpError('perplexity', res.status, await res.text());
  const j = await res.json();
  const u = j.usage || {};
  const exact = u.cost && Number(u.cost.total_cost);
  await recordUsage(db, { job: 'ai_visibility', provider: 'perplexity', model, inputTokens: u.prompt_tokens || 0, outputTokens: u.completion_tokens || 0,
    ...(Number.isFinite(exact) ? { usd: exact } : {}) }, { env });
  return { text: j.choices?.[0]?.message?.content || '', citations: j.citations || (j.search_results || []).map((s) => s.url) };
}

async function openai(env, q, db) {
  const model = env.OPENAI_SEARCH_MODEL || 'gpt-4.1';
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, tools: [{ type: 'web_search' }], input: q }),
    signal: AbortSignal.timeout(120_000)
  });
  if (!res.ok) throw httpError('openai', res.status, await res.text());
  const j = await res.json();
  const u = j.usage || {};
  const searches = (j.output || []).filter((o) => o.type === 'web_search_call').length || 1;
  await recordUsage(db, { job: 'ai_visibility', provider: 'openai', model, inputTokens: u.input_tokens || 0, outputTokens: u.output_tokens || 0, webSearches: searches }, { env });
  let text = '';
  const citations = [];
  for (const o of j.output || []) for (const c of o.content || []) {
    if (c.text) text += c.text;
    for (const a of c.annotations || []) if (a.url) citations.push(a.url);
  }
  return { text, citations };
}

export async function run({ db, env = process.env, log, slot, deps = {} }) {
  const plan = visibilityPlan(slot || new Date(), env);
  if (!plan.run) return { skipped: `odd ISO week ${plan.isoWeek} (runs every 2 weeks)` };
  const call = { perplexity, openai, ...deps };
  const providers = [];
  if (env.PERPLEXITY_API_KEY) providers.push(['perplexity', call.perplexity, plan.max]);
  if (env.OPENAI_API_KEY && plan.openai) providers.push(['openai', call.openai, Math.min(OPENAI_QUESTIONS, plan.max)]);
  if (!providers.length) return { skipped: env.OPENAI_API_KEY ? 'no provider due this run (OpenAI checks are monthly)' : 'not configured: PERPLEXITY_API_KEY / OPENAI_API_KEY' };
  const budget = await checkBudget(db, 'ai_visibility', { env });
  if (!budget.ok) return budgetSkip(budget);
  // Growing list: base questions + titles of published posts.
  const posts = (await db.query("SELECT title FROM posts WHERE status IN ('approved','published') AND title LIKE '%?'")).rows.map((r) => r.title);
  const all = [...new Set([...BASE_QUESTIONS, ...posts])];
  const summary = {};
  for (const [name, fn, limit] of providers) {
    if (!(await checkBudget(db, 'ai_visibility', { env })).ok) { summary[name] = { skipped: 'budget' }; continue; }
    const questions = all.slice(0, limit);
    let hits = 0, errors = 0, transient = false;
    for (const q of questions) {
      try {
        const r = await fn(env, q, db);
        const d = detect(r.text, r.citations);
        if (d.cited || d.mentioned) hits++;
        await db.query('INSERT INTO ai_visibility (day, provider, question, cited, mentioned, citations) VALUES (CURRENT_DATE,$1,$2,$3,$4,$5)', [name, q, d.cited, d.mentioned, JSON.stringify(r.citations.slice(0, 20))]);
      } catch (e) { errors++; if (e.retryable !== false) transient = true; log.error(`[ai_visibility] ${name}`, e.message); }
    }
    if (errors === questions.length) throw Object.assign(new Error(`${name}: all queries failed`), { retryable: transient });
    summary[name] = { questions: questions.length, hits, errors };
  }
  return summary;
}
