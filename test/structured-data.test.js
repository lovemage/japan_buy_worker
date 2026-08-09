import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

const EXPECTED_DEFINITION =
  "我拍 VOVOSnap 是一個 AI 電商開店平台，讓任何想賣東西的人都能從一張照片快速建立商品頁、完成上架，並擁有自己的電商網站。";

const publicDir = new URL("../public/", import.meta.url);

/** Pages that are open to crawlers and therefore need structured data. */
const INDEXABLE_PAGES = [
  "index.html",
  "about.html",
  "terms.html",
  "privacy.html",
  "blog/index.html",
  ...globSync("blog/*.html", { cwd: publicDir }).filter((path) => path !== "blog/index.html"),
  ...globSync("guide/*/index.html", { cwd: publicDir }),
];

function read(page) {
  return readFileSync(new URL(page, publicDir), "utf8");
}

function jsonLdOf(html, page) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => {
    try {
      return JSON.parse(match[1]);
    } catch (error) {
      assert.fail(`${page} has invalid JSON-LD: ${error.message}`);
    }
  });
}

test("every crawlable page ships parseable structured data", () => {
  assert.ok(INDEXABLE_PAGES.length >= 20, `expected to scan the whole public site, got ${INDEXABLE_PAGES.length}`);
  for (const page of INDEXABLE_PAGES) {
    const schemas = jsonLdOf(read(page), page);
    assert.ok(schemas.length > 0, `${page} has no JSON-LD`);
    for (const schema of schemas) {
      assert.equal(schema["@context"], "https://schema.org", `${page} has JSON-LD without a schema.org context`);
      assert.ok(schema["@type"], `${page} has JSON-LD without an @type`);
    }
  }
});

test("every crawlable page declares a canonical URL", () => {
  for (const page of INDEXABLE_PAGES) {
    assert.match(read(page), /<link rel="canonical" href="https:\/\/vovosnap\.com\//, `${page} has no canonical`);
  }
});

test("the brand definition is byte-identical wherever it is published", () => {
  for (const page of ["index.html", "about.html", "blog/index.html"]) {
    const match = read(page).match(/<p[^>]*data-brand-definition[^>]*>([^<]+)<\/p>/);
    assert.ok(match, `${page} must expose a data-brand-definition paragraph`);
    assert.equal(match[1].trim(), EXPECTED_DEFINITION, `${page} definition drifted`);
  }

  for (const page of ["index.html", "about.html"]) {
    const descriptions = jsonLdOf(read(page), page)
      .filter((schema) => schema["@type"] === "Organization" || schema["@type"] === "SoftwareApplication")
      .map((schema) => schema.description);
    assert.ok(descriptions.length > 0, `${page} has no Organization/SoftwareApplication schema`);
    for (const description of descriptions) {
      assert.equal(description, EXPECTED_DEFINITION, `${page} JSON-LD description drifted`);
    }
  }
});

test("deprecated positioning claims are gone from crawlable pages", () => {
  // Retired wording from content/facts.md 禁用表達. The FAQ phrasing
  // 「…是代購專用平台嗎？不是。」 is allowed — only the affirmative claim is banned.
  const banned = ["10,000+", ["專為", "代購打造"].join(""), ["創", "作者"].join("")];
  for (const page of INDEXABLE_PAGES) {
    const html = read(page);
    for (const phrase of banned) {
      assert.ok(!html.includes(phrase), `${page} still contains the retired claim "${phrase}"`);
    }
  }
});
