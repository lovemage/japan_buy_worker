import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const EXPECTED_DEFINITION =
  "我拍 VOVOSnap 是一個 AI 電商開店平台，讓任何想賣東西的人都能從一張照片快速建立商品頁、完成上架，並擁有自己的電商網站。";

const landingHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const aboutHtml = readFileSync(new URL("../public/about.html", import.meta.url), "utf8");
const llmsTxt = readFileSync(new URL("../public/llms.txt", import.meta.url), "utf8");
const productContext = readFileSync(new URL("../PRODUCT.md", import.meta.url), "utf8");

function extractDefinition(html, surface) {
  const match = html.match(/<p[^>]*data-brand-definition[^>]*>([^<]+)<\/p>/);
  assert.ok(match, `${surface} must expose a data-brand-definition paragraph`);
  return match[1].trim();
}

function extractJsonLdDescriptions(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]))
    .filter((schema) => schema["@type"] === "Organization" || schema["@type"] === "SoftwareApplication")
    .map((schema) => schema.description);
}

test("brand definition is identical across homepage, about page, JSON-LD, and llms.txt", () => {
  const homepageDefinition = extractDefinition(landingHtml, "homepage hero");
  const aboutDefinition = extractDefinition(aboutHtml, "about page");
  const jsonLdDefinitions = extractJsonLdDescriptions(landingHtml);
  const llmsDefinition = llmsTxt.match(/^> (.+)$/m)?.[1]?.trim();

  assert.deepEqual(jsonLdDefinitions, [EXPECTED_DEFINITION, EXPECTED_DEFINITION]);
  assert.equal(homepageDefinition, EXPECTED_DEFINITION);
  assert.equal(aboutDefinition, EXPECTED_DEFINITION);
  assert.equal(llmsDefinition, EXPECTED_DEFINITION);
});

test("current brand sources do not use the deprecated audience label", () => {
  const deprecatedAudience = ["創", "作者"].join("");
  for (const [surface, source] of [
    ["homepage", landingHtml],
    ["about page", aboutHtml],
    ["llms.txt", llmsTxt],
    ["product context", productContext],
  ]) {
    assert.ok(!source.includes(deprecatedAudience), `${surface} contains the deprecated audience label`);
  }
});
