import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const articles = [
  {
    slug: "japan-cosmetics-photo-listing-software",
    image: "og-japan-cosmetics-photo-listing.webp",
  },
  {
    slug: "ai-vs-barcode-product-listing",
    image: "og-ai-barcode-manual-listing.webp",
  },
  {
    slug: "solo-seller-fast-product-listing",
    image: "og-solo-seller-fast-listing.webp",
  },
  {
    slug: "secondhand-fast-listing-alternatives",
    image: "og-secondhand-fast-listing-alternatives.webp",
  },
  {
    slug: "photo-listing-software-pricing",
    image: "og-photo-listing-software-pricing.webp",
  },
  {
    slug: "free-or-pay-per-listing-software",
    image: "og-free-usage-based-listing.webp",
  },
  {
    slug: "edit-ai-recognition-before-publish",
    image: "og-ai-listing-review-edit.webp",
  },
  {
    slug: "taobao-auto-listing-duplicate-risk",
    image: "og-taobao-auto-listing-risk.webp",
  },
  {
    slug: "japan-drugstore-batch-recognition",
    image: "og-japan-drugstore-batch-recognition.webp",
  },
  {
    slug: "secondhand-bag-photo-recognition",
    image: "og-secondhand-bag-no-barcode.webp",
  },
  {
    slug: "daigou-exchange-rate-auto-pricing",
    image: "og-daigou-exchange-rate-pricing.webp",
  },
];

const registry = readFileSync(new URL("../public/assets/blog-data.js", import.meta.url), "utf8");
const worker = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

for (const article of articles) {
  test(`${article.slug} is published with complete discovery metadata`, () => {
    const htmlUrl = new URL(`../public/blog/${article.slug}.html`, import.meta.url);
    const imageUrl = new URL(`../public/assets/images/blog/${article.image}`, import.meta.url);
    assert.ok(existsSync(htmlUrl), "article HTML must exist");
    assert.ok(existsSync(imageUrl), "OG image must exist");

    const html = readFileSync(htmlUrl, "utf8");
    const canonical = `https://vovosnap.com/blog/${article.slug}.html`;
    const ogImage = `https://vovosnap.com/assets/images/blog/${article.image}`;
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`));
    assert.ok(html.includes(`<meta property="og:image" content="${ogImage}">`));
    assert.ok(html.includes('"@type": "Article"'));
    assert.ok(html.includes('"@type": "FAQPage"'));
    for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => JSON.parse(match[1]), "JSON-LD must be valid JSON");
    }
    assert.ok(registry.includes(`/blog/${article.slug}.html`), "blog registry must include article");
    assert.ok(worker.includes(`/blog/${article.slug}.html`), "sitemap must include article");
  });
}

test("new articles preserve the approved broad-market positioning", () => {
  const deprecatedAudience = ["創", "作者"].join("");
  for (const article of articles) {
    const html = readFileSync(
      new URL(`../public/blog/${article.slug}.html`, import.meta.url),
      "utf8"
    );
    assert.ok(!html.includes(deprecatedAudience), `${article.slug} contains deprecated positioning`);
    assert.ok(!html.includes("完全自動"), `${article.slug} makes an unapproved automation claim`);
    assert.ok(!html.includes("保證成交"), `${article.slug} makes a prohibited outcome claim`);
  }
});
