import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { renderBlogFragments } from "../scripts/build-blog-index.mjs";

const { articles } = renderBlogFragments();
const sitemapSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

// Article hrefs are extensionless (Workers Assets 307s `/x.html` to `/x`), but
// the files on disk still carry the .html suffix.
function readArticle(href) {
  return readFileSync(new URL(`../public${href}.html`, import.meta.url), "utf8");
}

test("every article shows a machine-readable date that matches its registry entry", () => {
  for (const article of articles) {
    const html = readArticle(article.href);
    const match = html.match(/<time datetime="([^"]+)">/);
    assert.ok(match, `${article.href} has no <time datetime> in the body`);
    assert.equal(
      match[1],
      article.date,
      `${article.href} shows ${match[1]} but blog-data.js says ${article.date}`
    );
  }
});

test("article structured data agrees with the visible date", () => {
  for (const article of articles) {
    const html = readArticle(article.href);
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) =>
      JSON.parse(match[1])
    );
    const posting = schemas.find((schema) => schema["@type"] === "Article" || schema["@type"] === "BlogPosting");
    assert.ok(posting, `${article.href} has no Article/BlogPosting JSON-LD`);
    assert.equal(posting.datePublished, article.date, `${article.href} datePublished drifted from blog-data.js`);
  }
});

test("the sitemap lists every published article with its real lastmod", () => {
  const block = sitemapSource.match(/const BLOG_ARTICLE_LASTMOD[\s\S]*?\n\];/);
  assert.ok(block, "src/index.ts no longer declares BLOG_ARTICLE_LASTMOD");
  const listed = new Map(
    [...block[0].matchAll(/\["(\/blog\/[^"]+)",\s*"(\d{4}-\d{2}-\d{2})"\]/g)].map((match) => [match[1], match[2]])
  );
  for (const path of listed.keys()) {
    assert.ok(!path.endsWith(".html"), `${path} would 307-redirect; the sitemap must list the extensionless URL`);
  }

  assert.equal(listed.size, articles.length, "the sitemap article list and blog-data.js differ in length");
  for (const article of articles) {
    assert.equal(
      listed.get(article.href),
      article.date,
      `${article.href} lastmod in src/index.ts does not match blog-data.js`
    );
  }
});
