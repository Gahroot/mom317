import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, cpSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseFrontmatter, renderMarkdown, validatePost, run } from "./build-blog.mjs";

const FIX = join(dirname(fileURLToPath(import.meta.url)), "fixtures/posts");
const quiet = () => {};

test("parses frontmatter scalars, lists and list maps", () => {
  const { data, body } = parseFrontmatter(readFileSync(join(FIX, "sample-night-waking.md"), "utf8"));
  assert.equal(data.slug, "sample-night-waking");
  assert.deepEqual(data.secondary_keywords, ["waking at 3am"]);
  assert.equal(data.faq[0].a, "Yes, it is a test fixture.");
  assert.equal(data.sources[0].url, "https://example.org/source");
  assert.match(body, /^Intro/);
});

test("renders markdown blocks and citations", () => {
  const { blocks, headings, cites } = renderMarkdown("Hi **b** *i* [x](https://a.b)[^2]\n\n## Q one?\n\n- a\n- b\n\n> q");
  const html = blocks.map((b) => b.html).join("");
  assert.match(html, /<strong>b<\/strong> <em>i<\/em> <a href="https:\/\/a.b" rel="noopener">x<\/a><sup><a href="#source-2"/);
  assert.match(html, /<h2 id="q-one">Q one\?<\/h2><ul><li>a<\/li><li>b<\/li><\/ul><blockquote>/);
  assert.deepEqual(headings.map((h) => h.id), ["q-one"]);
  assert.deepEqual(cites, ["2"]);
  assert.match(renderMarkdown("<script>").blocks[0].html, /&lt;script&gt;/);
});

test("validation catches missing approval, unmatched citation, missing url", () => {
  const post = parseFrontmatter(readFileSync(join(FIX, "sample-night-waking.md"), "utf8"));
  assert.deepEqual(validatePost(post), []);
  post.data.approved_by = "";
  post.data.sources[0].url = "";
  post.body += "\nMore.[^9]";
  const errs = validatePost(post).join("\n");
  assert.match(errs, /approved_by/);
  assert.match(errs, /source 1 missing url/);
  assert.match(errs, /\[\^9\]/);
});

test("build writes pages, check passes, then detects stale output", () => {
  const tmp = mkdtempSync(join(tmpdir(), "blog-"));
  const postsDir = join(tmp, "posts"), siteDir = join(tmp, "site");
  cpSync(FIX, postsDir, { recursive: true });
  assert.equal(run({ postsDir, siteDir, log: quiet }), 0);
  const page = readFileSync(join(siteDir, "blog/sample-night-waking/index.html"), "utf8");
  for (const s of ['"@type":"BlogPosting"', '"@type":"FAQPage"', '"@type":"BreadcrumbList"', "By <a href=\"/about\" rel=\"author\">Marian Grout</a>, founder of 3:17",
    "Short answer", 'data-source="blog:sample-night-waking:inline"', 'data-source="blog:sample-night-waking:end"', 'name="company"', 'id="source-1"', "not medical advice"])
    assert.ok(page.includes(s), "missing " + s);
  assert.ok(page.indexOf(":inline") < page.indexOf('<h2 id="what-helps">'));
  assert.match(readFileSync(join(siteDir, "sitemap.xml"), "utf8"), /blog\/sample-night-waking<\/loc>/);
  assert.doesNotMatch(readFileSync(join(siteDir, "sitemap.xml"), "utf8"), /thanks|privacy/);
  assert.equal(run({ postsDir, siteDir, check: true, log: quiet }), 0);
  writeFileSync(join(siteDir, "feed.xml"), "old");
  assert.equal(run({ postsDir, siteDir, check: true, log: quiet }), 1);
});

test("drafts are not rendered and invalid posts fail", () => {
  const tmp = mkdtempSync(join(tmpdir(), "blog-"));
  const postsDir = join(tmp, "posts"), siteDir = join(tmp, "site");
  mkdirSync(postsDir);
  const src = readFileSync(join(FIX, "sample-night-waking.md"), "utf8");
  writeFileSync(join(postsDir, "sample-night-waking.md"), src.replace("status: approved", "status: draft"));
  assert.equal(run({ postsDir, siteDir, log: quiet }), 0);
  assert.doesNotMatch(readFileSync(join(siteDir, "sitemap.xml"), "utf8"), /sample-night-waking/);
  writeFileSync(join(postsDir, "sample-night-waking.md"), src.replace("approved_by: Test Reviewer", "approved_by:"));
  assert.equal(run({ postsDir, siteDir, check: true, log: quiet }), 1);
});
