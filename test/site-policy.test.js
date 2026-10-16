import test from "node:test";
import assert from "node:assert/strict";
import { canonicalRedirect, withSecurityHeaders, publicCacheTtl, serveWithEdgeCache, isIndexableProduct, isSensitiveProduct } from "../src/shared/site-policy.js";
import { calcRetailTwd } from "../src/shared/retail-price.js";

const domain = "vovosnap.com";
const request = (path, options) => new Request(`https://${domain}${path}`, options);
const product = { title_zh_tw: "刺繡洋裝", description: "粉色裙身搭配花朵刺繡與腰間蝴蝶結，尺寸為八十至一百一十公分，請於購買前確認衣長與胸圍。", image_url: "/api/images/dress.webp", category: "童裝" };

test("redirects canonicalize scheme and www in one hop without losing payment POSTs", () => {
  const redirect = canonicalRedirect(new Request("http://www.vovosnap.com/s/shop/product?code=a%26b"), domain);
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("location"), "https://vovosnap.com/s/shop/product?code=a%26b");
  assert.equal(canonicalRedirect(new Request("http://vovosnap.com/api/billing/notify", { method: "POST", body: "payment" }), domain).status, 308);
  assert.equal(canonicalRedirect(new Request("http://localhost:8791/"), domain), null);
  assert.equal(canonicalRedirect(request("/"), domain), null);
});

test("security headers preserve cookies and payloads and do not restrict payment form destinations", async () => {
  const response = withSecurityHeaders(new Response("ok", { headers: { "set-cookie": "session=abc; Secure; HttpOnly" } }), request("/"));
  assert.equal(await response.text(), "ok");
  assert.equal(response.headers.get("set-cookie"), "session=abc; Secure; HttpOnly");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  assert.doesNotMatch(response.headers.get("content-security-policy"), /form-action|script-src/);
});

test("only anonymous public storefront requests are eligible for edge caching", () => {
  assert.equal(publicCacheTtl(request("/s/shop/"), domain), 60);
  assert.equal(publicCacheTtl(request("/s/shop/product?code=abc"), domain), 60);
  assert.equal(publicCacheTtl(new Request("https://shop.vovosnap.com/"), domain), 60);
  assert.equal(publicCacheTtl(request("/sitemap-stores.xml"), domain), 300);
  for (const path of ["/api/products", "/s/shop/admin", "/s/shop/request.html", "/pay", "/auth/me", "/s/shop/product?code=a&preview=1"]) {
    assert.equal(publicCacheTtl(request(path), domain), 0, path);
  }
  for (const headers of [{ cookie: "session=abc" }, { authorization: "Bearer abc" }, { "x-forwarded-host": "other.vovosnap.com" }, { "cache-control": "no-cache" }]) {
    assert.equal(publicCacheTtl(request("/s/shop/", { headers }), domain), 0);
  }
  assert.equal(publicCacheTtl(request("/s/shop/", { method: "POST" }), domain), 0);
});

test("edge cache reuses public responses, isolates tenants, and bypasses sessions", async () => {
  const entries = new Map();
  const pending = [];
  let renders = 0;
  const cache = { match: async r => entries.get(r.url)?.clone(), put: async (r, response) => { entries.set(r.url, response); } };
  const execution = { waitUntil: p => pending.push(p) };
  const render = async () => { renders++; return new Response("store", { headers: { "cache-control": "public, max-age=0, s-maxage=60" } }); };
  const serve = r => serveWithEdgeCache(r, domain, cache, execution, render);
  await serve(request("/s/first/"));
  await Promise.all(pending);
  assert.equal(await (await serve(request("/s/first/"))).text(), "store");
  assert.equal(renders, 1);
  await serve(request("/s/second/"));
  await serve(request("/s/first/", { headers: { cookie: "session=abc" } }));
  assert.equal(renders, 3);
  await serveWithEdgeCache(request("/s/private/"), domain, cache, execution, async () => new Response("private", { headers: { "cache-control": "private, no-store", "set-cookie": "a=b" } }));
  assert.equal(entries.has("https://vovosnap.com/s/private/"), false);
});

test("cache failures fall back to rendering", async () => {
  const response = await serveWithEdgeCache(request("/s/shop/"), domain, { match: async () => { throw Error("unavailable"); } }, { waitUntil() {} }, async () => new Response("fresh"));
  assert.equal(await response.text(), "fresh");
});

test("indexing requires descriptive Chinese product copy, an image and a finite positive price", () => {
  assert.equal(isIndexableProduct(product, 680), true);
  for (const price of [null, 0, -1, NaN, Infinity]) assert.equal(isIndexableProduct(product, price), false);
  for (const change of [{ title_zh_tw: "" }, { description: "短描述" }, { image_url: "" }, { category: "醫藥品" }, { title_ja: "第2類医薬品" }, { category: "保健食品" }, { title_zh_tw: "龍鳳桃花姻緣燈" }]) {
    assert.equal(isIndexableProduct({ ...product, ...change }, 680), false);
  }
  assert.equal(isSensitiveProduct({ ...product, category: "童裝" }), false);
});

test("retail prices follow the same manual, flat and percentage calculations used by the storefront", () => {
  assert.equal(calcRetailTwd(680, { pricingMode: "manual" }), 680);
  assert.equal(calcRetailTwd(1280, { pricingMode: "auto", markupMode: "percent", markupPercent: 15, jpyToTwd: 1 / 4.62 }), 319);
  assert.equal(calcRetailTwd(1280, { pricingMode: "auto", markupMode: "flat", markupJpy: 100, jpyToTwd: 0.22 }), 304);
});
