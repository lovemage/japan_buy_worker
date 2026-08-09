import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  escapeHtml,
  formatThousands,
  setElementHtmlById,
  setElementTextById,
} from "../src/shared/html-fill.js";

const productHtml = readFileSync(new URL("../public/product.html", import.meta.url), "utf8");
const storeHtml = readFileSync(new URL("../public/store.html", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("../src/router.ts", import.meta.url), "utf8");

test("setElementHtmlById fills empty and populated elements", () => {
  assert.equal(
    setElementHtmlById('<h2 id="detail-title" class="detail-title"></h2>', "detail-title", "商品 A"),
    '<h2 id="detail-title" class="detail-title">商品 A</h2>'
  );
  assert.equal(
    setElementHtmlById('<h1 id="store-header-name">商品列表</h1>', "store-header-name", "小店"),
    '<h1 id="store-header-name">小店</h1>'
  );
  assert.equal(
    setElementHtmlById('<p class="meta" id="detail-category"></p>', "detail-category", "分類：美妝"),
    '<p class="meta" id="detail-category">分類：美妝</p>'
  );
});

test("setElementHtmlById leaves earlier same-tag siblings alone", () => {
  const html = '<section id="list-error" class="notice hidden"></section><section id="product-grid"></section>';
  assert.equal(
    setElementHtmlById(html, "product-grid", "<article></article>"),
    '<section id="list-error" class="notice hidden"></section><section id="product-grid"><article></article></section>'
  );
});

test("setElementHtmlById is a no-op when the id is absent", () => {
  const html = '<p id="other"></p>';
  assert.equal(setElementHtmlById(html, "missing", "x"), html);
});

test("setElementTextById escapes markup and skips empty values", () => {
  assert.equal(
    setElementTextById('<p id="detail-description"></p>', "detail-description", '<img src=x onerror="1">'),
    '<p id="detail-description">&lt;img src=x onerror=&quot;1&quot;&gt;</p>'
  );
  assert.equal(setElementTextById('<p id="detail-brand"></p>', "detail-brand", ""), '<p id="detail-brand"></p>');
});

test("formatThousands matches the client's en-US grouping", () => {
  for (const value of [0, 7, 999, 1000, 12345, 1234567]) {
    assert.equal(formatThousands(value), value.toLocaleString("en-US"));
  }
  assert.equal(formatThousands(1234.6), "1,235");
});

test("escapeHtml neutralises quotes and angle brackets", () => {
  assert.equal(escapeHtml('a&b"<c>'), "a&amp;b&quot;&lt;c&gt;");
});

test("product.html keeps every element the router pre-renders into", () => {
  for (const id of [
    "store-header-name",
    "detail-title",
    "detail-brand",
    "detail-category",
    "detail-color-count",
    "detail-description",
    "detail-price",
    "detail-spec-list",
    "detail-main-image",
  ]) {
    assert.ok(productHtml.includes(`id="${id}"`), `public/product.html lost id="${id}"`);
  }
  assert.match(productHtml, /<img id="detail-main-image"[^>]*>/, "the main image tag must stay a single <img ...>");
});

test("store.html keeps every element the router pre-renders into", () => {
  assert.ok(storeHtml.includes('<h1 id="store-header-name">'), "store.html lost the store name heading");
  assert.ok(
    storeHtml.includes('<p id="store-desc" class="store-desc" style="display:none;">'),
    "the router unhides store-desc by matching this exact tag"
  );
  assert.ok(storeHtml.includes('id="product-grid"'), "store.html lost the product grid container");
});

test("router pre-renders storefront pages instead of serving an empty shell", () => {
  for (const call of [
    'setElementTextById(html, "detail-title", product.name)',
    'setElementTextById(html, "detail-description", product.description)',
    'setElementHtmlById(html, "product-grid", items)',
  ]) {
    assert.ok(routerSource.includes(call), `src/router.ts no longer runs ${call}`);
  }
  assert.ok(
    routerSource.includes("buildVisibleProductLimitClause"),
    "pre-rendered product copy must honour the plan visibility limit"
  );
});
