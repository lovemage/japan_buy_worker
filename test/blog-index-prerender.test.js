import test from "node:test";
import assert from "node:assert/strict";

import {
  buildBlogIndexHtml,
  readBlogIndexHtml,
  renderBlogFragments,
} from "../scripts/build-blog-index.mjs";

const html = readBlogIndexHtml();

test("committed blog index matches scripts/build-blog-index.mjs output", () => {
  assert.equal(
    html,
    buildBlogIndexHtml(html),
    "public/blog/index.html is stale — run `node scripts/build-blog-index.mjs`"
  );
});

test("every article is reachable from the static blog index HTML", () => {
  const { articles } = renderBlogFragments();
  assert.ok(articles.length >= 16, "expected the article registry to stay populated");
  for (const article of articles) {
    assert.ok(html.includes(`href="${article.href}"`), `${article.href} is missing from the static index`);
    assert.ok(html.includes(article.title), `"${article.title}" is missing from the static index`);
  }
});

test("blog index stays an article list, not a product page", () => {
  // Product explainers belong on / and /about. This page is the article index.
  for (const marker of ["data-brand-definition", "geo-section", "FAQPage", "方案、額度與費用"]) {
    assert.ok(!html.includes(marker), `blog index should not carry ${marker}`);
  }
  const body = html.slice(html.indexOf("<body"));
  assert.equal((body.match(/<h1[^>]*>/g) || []).length, 1, "the index should have exactly one H1");
  assert.equal((body.match(/<h2[^>]*>/g) || []).length, 0, "article cards use H3; no section H2s belong here");
});

test("blog index exposes Blog and BreadcrumbList structured data", () => {
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) =>
    JSON.parse(match[1])
  );
  assert.deepEqual(schemas.map((schema) => schema["@type"]).sort(), ["Blog", "BreadcrumbList"]);

  const blog = schemas.find((schema) => schema["@type"] === "Blog");
  const { articles } = renderBlogFragments();
  assert.equal(blog.blogPost.length, articles.length);
  for (const post of blog.blogPost) {
    assert.ok(!post.url.endsWith(".html"), `${post.url} would 307-redirect; use the extensionless URL`);
  }
});
