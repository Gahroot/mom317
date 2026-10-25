// GitHub REST (fetch) + git CLI helpers. The token is only ever passed via env/URL to git, never logged.
import { execFile } from 'node:child_process';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const repoName = (env = process.env) => env.GITHUB_REPO || 'Gahroot/mom317';
export const githubConfigured = (env = process.env) => Boolean(env.GITHUB_TOKEN);

export async function gh(method, route, body, env = process.env) {
  const res = await fetch(`https://api.github.com${route}`, {
    method,
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'back2sleep-engine', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60_000)
  });
  if (res.status === 204) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub ${method} ${route} -> ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const scrub = (s, env) => String(s).split(env.GITHUB_TOKEN || '\u0000').join('***');

export async function git(cwd, args, env = process.env) {
  try {
    const { stdout } = await run('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, maxBuffer: 20 * 1024 * 1024 });
    return stdout.trim();
  } catch (e) {
    throw new Error(`git ${args[0]} failed: ${scrub(e.stderr || e.message, env).slice(0, 500)}`);
  }
}

/** Shallow-clones the repo into a temp dir; calls fn(dir); always cleans up. */
export async function withCheckout(fn, { branch, env = process.env } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'b2s-'));
  try {
    const url = `https://x-access-token:${env.GITHUB_TOKEN}@github.com/${repoName(env)}.git`;
    const args = ['clone', '--depth', '20', ...(branch ? ['--branch', branch] : []), url, dir];
    await git(tmpdir(), args, env);
    await git(dir, ['config', 'user.name', env.GIT_AUTHOR_NAME || 'back2sleep-engine']);
    await git(dir, ['config', 'user.email', env.GIT_AUTHOR_EMAIL || 'engine@back2sleepnow.com']);
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Runs `node tools/build-blog.mjs` in the checkout if the script exists. Returns a note. */
export async function buildBlog(dir) {
  try { await access(path.join(dir, 'tools/build-blog.mjs')); } catch { return 'tools/build-blog.mjs not present; build skipped'; }
  try {
    await run(process.execPath, ['tools/build-blog.mjs'], { cwd: dir, maxBuffer: 20 * 1024 * 1024 });
  } catch (e) {
    return `build-blog.mjs failed: ${String(e.stderr || e.message).slice(0, 800)}`;
  }
  return 'built with tools/build-blog.mjs';
}

export async function commitAndPush(dir, branch, message) {
  await git(dir, ['add', '-A']);
  const status = await git(dir, ['status', '--porcelain']);
  if (!status) return false;
  await git(dir, ['commit', '-m', message]);
  await git(dir, ['push', 'origin', `HEAD:refs/heads/${branch}`]);
  return true;
}

/** Opens or updates (comments on) a GitHub issue with the given label + exact title. */
export async function upsertIssue({ title, body, label }, env = process.env) {
  const repo = repoName(env);
  try { await gh('POST', `/repos/${repo}/labels`, { name: label, color: label === 'engine-alert' ? 'd73a4a' : '0e8a16' }, env); } catch {}
  const open = await gh('GET', `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=100`, null, env);
  const existing = open.find((i) => i.title === title && !i.pull_request);
  if (existing) {
    await gh('POST', `/repos/${repo}/issues/${existing.number}/comments`, { body }, env);
    return existing.html_url;
  }
  const created = await gh('POST', `/repos/${repo}/issues`, { title, body, labels: [label] }, env);
  return created.html_url;
}
