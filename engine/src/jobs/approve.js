// Hourly: open blog/* PRs with an `/approve` comment from the repo owner get status approved, rebuilt, pushed. Never merges.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gh, repoName, githubConfigured, withCheckout, buildBlog, commitAndPush } from '../github.js';
import { setApproval } from '../frontmatter.js';

export function findApproval(comments, owner) {
  return comments.find((c) => c.user && c.user.login.toLowerCase() === owner.toLowerCase() && /^\s*\/approve\b/m.test(c.body || '')) || null;
}

export async function run({ db, env = process.env, log }) {
  if (!githubConfigured(env)) return { skipped: 'not configured: GITHUB_TOKEN' };
  const repo = repoName(env);
  const owner = repo.split('/')[0];
  const prs = (await gh('GET', `/repos/${repo}/pulls?state=open&per_page=100`, null, env)).filter((p) => p.head.ref.startsWith('blog/') && p.head.repo && p.head.repo.full_name === repo);
  const approved = [];
  for (const pr of prs) {
    const comments = await gh('GET', `/repos/${repo}/issues/${pr.number}/comments?per_page=100`, null, env);
    const c = findApproval(comments, owner);
    if (!c) continue;
    if (comments.some((x) => /^Approved by engine/.test(x.body || '') && new Date(x.created_at) > new Date(c.created_at))) continue;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const approver = env.APPROVER_NAME || c.user.login;
    const res = await withCheckout(async (dir) => {
      const files = await gh('GET', `/repos/${repo}/pulls/${pr.number}/files?per_page=100`, null, env);
      const posts = files.map((f) => f.filename).filter((f) => /^content\/posts\/[a-z0-9-]+\.md$/.test(f));
      for (const rel of posts) {
        const p = path.join(dir, rel);
        await writeFile(p, setApproval(await readFile(p, 'utf8'), approver, today));
      }
      const buildNote = await buildBlog(dir);
      const pushed = await commitAndPush(dir, pr.head.ref, `Approve post (${approver})`);
      return { posts, buildNote, pushed };
    }, { branch: pr.head.ref, env });
    await gh('POST', `/repos/${repo}/issues/${pr.number}/comments`, { body: `Approved by engine on behalf of @${c.user.login}: set \`status: approved\`, \`approved_by: ${approver}\`, \`updated: ${today}\` in ${res.posts.join(', ')}.\nBuild: ${res.buildNote}\n\nReady to merge — merging deploys to production.` }, env);
    for (const rel of res.posts) await db.query("UPDATE posts SET status = 'approved', updated_at = now() WHERE slug = $1", [path.basename(rel, '.md')]);
    approved.push(pr.number);
    log.log(`[approve] PR #${pr.number}`);
  }
  // Mark merged posts as published.
  const tracked = (await db.query("SELECT slug, pr_number FROM posts WHERE status <> 'published' AND pr_number IS NOT NULL")).rows;
  for (const t of tracked) {
    const pr = await gh('GET', `/repos/${repo}/pulls/${t.pr_number}`, null, env);
    if (pr.merged_at) await db.query("UPDATE posts SET status = 'published', updated_at = now() WHERE slug = $1", [t.slug]);
  }
  return { checked: prs.length, approved };
}
