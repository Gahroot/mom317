// Weekly: ask answer engines target questions; record whether back2sleepnow.com is cited or mentioned.
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

async function perplexity(env, q) {
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.PERPLEXITY_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.PERPLEXITY_MODEL || 'sonar', messages: [{ role: 'user', content: q }] }),
    signal: AbortSignal.timeout(90_000)
  });
  if (!res.ok) throw new Error(`perplexity ${res.status}`);
  const j = await res.json();
  return { text: j.choices?.[0]?.message?.content || '', citations: j.citations || (j.search_results || []).map((s) => s.url) };
}

async function openai(env, q) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.OPENAI_SEARCH_MODEL || 'gpt-4.1', tools: [{ type: 'web_search' }], input: q }),
    signal: AbortSignal.timeout(120_000)
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const j = await res.json();
  let text = '';
  const citations = [];
  for (const o of j.output || []) for (const c of o.content || []) {
    if (c.text) text += c.text;
    for (const a of c.annotations || []) if (a.url) citations.push(a.url);
  }
  return { text, citations };
}

export async function run({ db, env = process.env, log }) {
  const providers = [];
  if (env.PERPLEXITY_API_KEY) providers.push(['perplexity', perplexity]);
  if (env.OPENAI_API_KEY) providers.push(['openai', openai]);
  if (!providers.length) return { skipped: 'not configured: PERPLEXITY_API_KEY / OPENAI_API_KEY' };
  // Growing list: base questions + titles of published posts.
  const posts = (await db.query("SELECT title FROM posts WHERE status IN ('approved','published') AND title LIKE '%?'")).rows.map((r) => r.title);
  const questions = [...new Set([...BASE_QUESTIONS, ...posts])].slice(0, 30);
  const summary = {};
  for (const [name, fn] of providers) {
    let hits = 0, errors = 0;
    for (const q of questions) {
      try {
        const r = await fn(env, q);
        const d = detect(r.text, r.citations);
        if (d.cited || d.mentioned) hits++;
        await db.query('INSERT INTO ai_visibility (day, provider, question, cited, mentioned, citations) VALUES (CURRENT_DATE,$1,$2,$3,$4,$5)', [name, q, d.cited, d.mentioned, JSON.stringify(r.citations.slice(0, 20))]);
      } catch (e) { errors++; log.error(`[ai_visibility] ${name}`, e.message); }
    }
    if (errors === questions.length) throw new Error(`${name}: all queries failed`);
    summary[name] = { questions: questions.length, hits, errors };
  }
  return summary;
}
