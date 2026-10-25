// LLM access: Anthropic first, OpenAI fallback. Plain fetch, no SDKs.
export function llmConfigured(env = process.env) {
  return Boolean(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY);
}

async function anthropic(env, system, prompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.LLM_MODEL || 'claude-sonnet-4-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(240_000)
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  return j.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
}

async function openai(env, system, prompt, maxTokens) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-4.1', max_completion_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(240_000)
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).choices[0].message.content;
}

export async function complete(system, prompt, { maxTokens = 8000, env = process.env } = {}) {
  const errors = [];
  if (env.ANTHROPIC_API_KEY) { try { return await anthropic(env, system, prompt, maxTokens); } catch (e) { errors.push(e.message); } }
  if (env.OPENAI_API_KEY) { try { return await openai(env, system, prompt, maxTokens); } catch (e) { errors.push(e.message); } }
  throw new Error(errors.length ? errors.join(' | ') : 'no LLM key configured (ANTHROPIC_API_KEY / OPENAI_API_KEY)');
}

export function extractJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.search(/[[{]/);
  const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
  if (start < 0 || end < start) throw new Error('LLM did not return JSON');
  return JSON.parse(raw.slice(start, end + 1));
}

export async function completeJson(system, prompt, opts) {
  return extractJson(await complete(system + '\nReply with JSON only.', prompt, opts));
}

export const BRAND_RULES = `Context: Back2SleepNow.com is the blog of 3:17, a pre-launch brand founded by Marian Grout. Audience: women in perimenopause, menopause or post-menopause who wake in the middle of the night and can't get back to sleep. Upcoming product: "Middle of the night sleep shot" (tagline "Quickly return to sleep").
Hard rules:
- NEVER make efficacy, treatment or cure claims about the product or any supplement. Do not say the product helps, works, treats or improves anything. Product mentions are limited to inviting readers to join the founding waitlist.
- Never invent statistics, studies, doses, ingredients, prices, ship dates, testimonials or signup counts.
- Cite only real peer-reviewed papers or authoritative bodies (NIH/NCBI/PubMed, The Menopause Society (NAMS, menopause.org), ACOG, AASM, CDC, NHS, NICE, Cochrane, major journals). Prefer DOI or PubMed URLs you are certain exist. If unsure a URL exists, leave the source out.
- Health information is general education, not medical advice; encourage talking to a clinician for persistent symptoms.`;
