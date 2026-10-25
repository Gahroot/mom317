// Shared: write a post into a fresh checkout, build, push a blog/ branch and open a PR.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { withCheckout, buildBlog, commitAndPush, gh, git, repoName } from '../github.js';

export function prBody({ post, dropped = [], buildNote, kind = 'new', reason = '', notes = '', autoPublish = false }) {
  const claims = (post.claims || []).map((c) => {
    const src = (post.sources || []).find((s) => String(s.id) === String(c.source));
    return `- [ ] ${c.text} ${src ? `— [^${src.id}] [${src.title}](${src.url})` : '— **UNSOURCED: add a real source or delete this claim**'}`;
  });
  return [
    kind === 'refresh' ? `Refresh of **${post.title}** (${reason}).` : `New draft post: **${post.title}**`,
    '',
    `Primary keyword: \`${post.primary_keyword}\` · file: \`content/posts/${post.slug}.md\``,
    '',
    '## Claims approval checklist',
    'Tick each claim only after checking it against its source. No product efficacy claims are allowed.',
    ...claims,
    '',
    '## Sources',
    ...(post.sources || []).map((s) => `- [^${s.id}] ${s.title}, ${s.publisher} (${s.year}) — ${s.url} ✅ resolved`),
    ...(dropped.length ? ['', '### Dropped (could not be verified)', ...dropped.map((d) => `- ${d.source.title || ''} — ${d.source.url} (${d.reason})`)] : []),
    '',
    `Build: ${buildNote}${notes}`,
    '',
    ...(autoPublish ? [
      '## Automated approval gate',
      'The engine now runs the gate: every source resolves, `build-blog.mjs --check` passes, claims lint is clean, and an independent fact-check rates every claim `supported`.',
      'All pass: it sets `status: approved`, waits for CI to be green and squash-merges (production deploy). Any fail: no merge, the PR is labelled `needs-review` and an issue is opened.',
      'Manual override: comment `/approve` (repo owner only) and the engine approves and merges once CI is green.'
    ] : [
    '## To approve',
    '- Either edit the file: set `status: approved` and `approved_by: <your name>`, run `node tools/build-blog.mjs`, push to this branch,',
    '- or comment `/approve` on this PR (repo owner only) and the engine does it within the hour.',
    '',
    'Then merge. Merging to `main` deploys to production. The engine never merges by itself.'
    ])
  ].join('\n');
}

export async function openPostPr({ db, env, post, fileText, dropped, kind = 'new', reason = '', notes = '', log }) {
  const repo = repoName(env);
  const branch = `blog/${post.slug}${kind === 'refresh' ? '-refresh-' + new Date().toISOString().slice(0, 10) : ''}`;
  const result = await withCheckout(async (dir) => {
    await git(dir, ['checkout', '-B', branch]);
    await mkdir(path.join(dir, 'content/posts'), { recursive: true });
    await writeFile(path.join(dir, 'content/posts', `${post.slug}.md`), fileText);
    const buildNote = await buildBlog(dir);
    const pushed = await commitAndPush(dir, branch, `${kind === 'refresh' ? 'Refresh' : 'Draft'} post: ${post.title}`);
    return { buildNote, pushed };
  }, { env });
  if (!result.pushed) return { skipped: 'no changes' };
  const base = (await gh('GET', `/repos/${repo}`, null, env)).default_branch;
  const pr = await gh('POST', `/repos/${repo}/pulls`, {
    title: `${kind === 'refresh' ? 'Refresh' : 'Blog draft'}: ${post.title}`,
    head: branch, base, body: prBody({ post, dropped, buildNote: result.buildNote, kind, reason, notes, autoPublish: String(env.AUTO_PUBLISH ?? 'true').toLowerCase() !== 'false' }), draft: false
  }, env);
  try { await gh('POST', `/repos/${repo}/issues/${pr.number}/labels`, { labels: ['blog-post'] }, env); } catch {}
  await db.query(
    `INSERT INTO posts (slug, title, primary_keyword, status, pr_number, pr_url, branch, kind) VALUES ($1,$2,$3,'draft',$4,$5,$6,$7)
     ON CONFLICT (slug) DO UPDATE SET status = CASE WHEN posts.status = 'pending' THEN 'draft' ELSE posts.status END, pr_number = EXCLUDED.pr_number, pr_url = EXCLUDED.pr_url, branch = EXCLUDED.branch, kind = EXCLUDED.kind, updated_at = now()`,
    [post.slug, post.title, post.primary_keyword, pr.number, pr.html_url, branch, kind]
  );
  log.log(`[publish] opened ${pr.html_url}`);
  return { pr: pr.html_url, number: pr.number, branch, build: result.buildNote, dropped: dropped.length };
}

