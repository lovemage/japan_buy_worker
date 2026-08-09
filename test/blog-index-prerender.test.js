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

test("blog index carries the reference blocks AI crawlers extract", () => {
  for (const marker of [
    "data-brand-definition",
    'id="how-to-start"',
    'id="plans-at-a-glance"',
    'id="manual-vs-photo-listing"',
    'id="faq"',
    '<time datetime="2026-08-09">',
  ]) {
    assert.ok(html.includes(marker), `blog index is missing ${marker}`);
  }

  const h2Count = (html.match(/<h2[^>]*>/g) || []).length;
  assert.ok(h2Count >= 6 && h2Count <= 10, `expected 6-10 section H2s on the blog index, found ${h2Count}`);
});

test("blog index exposes Blog, BreadcrumbList and FAQPage structured data", () => {
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) =>
    JSON.parse(match[1])
  );
  const types = schemas.map((schema) => schema["@type"]);
  assert.deepEqual(types.sort(), ["Blog", "BreadcrumbList", "FAQPage"]);

  const blog = schemas.find((schema) => schema["@type"] === "Blog");
  const { articles } = renderBlogFragments();
  assert.equal(blog.blogPost.length, articles.length);

  const faq = schemas.find((schema) => schema["@type"] === "FAQPage");
  assert.ok(faq.mainEntity.length >= 5, "expected at least 5 FAQ entries");
  for (const entry of faq.mainEntity) {
    assert.ok(html.includes(entry.name), `FAQ question "${entry.name}" is not visible in the page body`);
    assert.ok(
      html.includes(entry.acceptedAnswer.text),
      `FAQ answer for "${entry.name}" is not visible in the page body`
    );
  }
});
