import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";
// Use Wrangler's pinned bundler in both npm and pnpm installations.
const { buildSync } = createRequire(import.meta.resolve("wrangler/package.json"))("esbuild");

// Exercise the real Worker/router and SQL against an isolated in-memory DB.
const buildDir = mkdtempSync(join(tmpdir(), "vovosnap-review-"));
const outfile = join(buildDir, "worker.mjs");
buildSync({ entryPoints: [new URL("../src/index.ts", import.meta.url).pathname], bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent" });
const worker = (await import(pathToFileURL(outfile).href)).default;
after(() => rmSync(buildDir, { recursive: true, force: true }));

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE stores (id INTEGER PRIMARY KEY, slug TEXT, subdomain TEXT, name TEXT, description TEXT, plan TEXT, plan_expires_at TEXT, is_active INTEGER, updated_at TEXT, destination_country TEXT, template TEXT);
    CREATE TABLE app_settings (store_id INTEGER, key TEXT, value TEXT);
    CREATE TABLE products (id INTEGER PRIMARY KEY, store_id INTEGER, source_product_code TEXT, title_zh_tw TEXT, title_ja TEXT, brand TEXT, category TEXT, price_jpy_tax_in REAL, color_count INTEGER, image_url TEXT, source_payload_json TEXT, is_active INTEGER, created_at TEXT, updated_at TEXT);
    INSERT INTO stores VALUES (1,'shop',NULL,'日常小店','有完整描述的小店','free',NULL,1,'2026-10-16','tw','default');
    INSERT INTO stores VALUES (2,'premium','premium','品牌店','有完整描述的品牌店','proplus',NULL,1,'2026-10-16','tw','default');
    INSERT INTO stores VALUES (3,'expired','expired','到期店','到期後仍保留免費額度','proplus','2020-01-01',1,'2026-10-16','tw','default');
    INSERT INTO app_settings VALUES (0,'plan_limits','{"free":3}');
    INSERT INTO app_settings VALUES (1,'pricing_mode','manual');
    INSERT INTO app_settings VALUES (2,'pricing_mode','manual');
    INSERT INTO app_settings VALUES (3,'pricing_mode','manual');
  `);
  const payload = JSON.stringify({ description: "粉色裙身搭配花朵刺繡與腰間蝴蝶結，尺寸為八十至一百一十公分，請於購買前確認衣長與胸圍。" });
  const insert = sqlite.prepare("INSERT INTO products VALUES (?, ?, ?, ?, '', '童裝', ?, ?, 0, '/api/images/dress.webp', ?, 1, ?, '2026-10-16')");
  insert.run(1, 1, "old", "舊款洋裝", "童裝", 680, payload, "2026-01-01");
  insert.run(2, 1, "good", "刺繡洋裝 <限定>", "童裝", 680, payload, "2026-10-10");
  insert.run(3, 1, "medicine", "口內炎軟膏", "醫藥品", 300, payload, "2026-10-11");
  insert.run(4, 1, "missing-price", "缺價洋裝", "童裝", null, payload, "2026-10-12");
  insert.run(5, 2, "premium-good", "品牌洋裝", "童裝", 880, payload, "2026-10-12");
  insert.run(6, 3, "expired-good", "到期店洋裝", "童裝", 880, payload, "2026-10-12");
  const db = { prepare(sql) {
    let params = [];
    const statement = {
      bind(...values) { params = values; return statement; },
      async first() { return sqlite.prepare(sql).get(...params) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...params) }; },
    };
    return statement;
  } };
  const env = { DB: db, MAIN_DOMAIN: "vovosnap.com", ASSETS: { async fetch(request) {
    const path = new URL(request.url).pathname;
    return new Response(readFileSync(new URL(`../public${path}`, import.meta.url)), { headers: { "content-type": "text/html" } });
  } } };
  return { sqlite, env, fetch: (path, options) => worker.fetch(new Request(path.startsWith("http") ? path : `https://vovosnap.com${path}`, options), env) };
}

test("platform sitemap has no tenant URLs; tenant sitemaps respect host, plan expiry and visibility", async () => {
  const f = fixture();
  try {
    const platform = await (await f.fetch("/sitemap.xml")).text();
    assert.match(platform, /\/blog\//);
    assert.doesNotMatch(platform, /\/s\/shop|product\?code|premium\.vovosnap/);
    const tenants = await (await f.fetch("/sitemap-stores.xml")).text();
    assert.match(tenants, /\/s\/shop\/product\?code=good/);
    assert.match(tenants, /\/s\/expired\/product\?code=expired-good/);
    assert.doesNotMatch(tenants, /code=old|code=medicine|code=missing-price|premium\.vovosnap/);
    assert.doesNotMatch(tenants, /<loc>https:\/\/vovosnap.com\/s\/shop\/<\/loc>/);
    const premium = await (await f.fetch("https://premium.vovosnap.com/sitemap.xml")).text();
    assert.match(premium, /https:\/\/premium.vovosnap.com\/product\?code=premium-good/);
    assert.doesNotMatch(premium, /vovosnap.com\/s\/|\/blog\//);
  } finally { f.sqlite.close(); }
});

test("product HTML has escaped product titles, real image metadata, no empty facts and matching prices", async () => {
  const f = fixture();
  try {
    const response = await f.fetch("/s/shop/product?code=good");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-robots-tag"), "index, follow");
    const html = await response.text();
    assert.match(html, /<title>刺繡洋裝 &lt;限定&gt;｜日常小店<\/title>/);
    assert.match(html, /property="og:image" content="https:\/\/vovosnap.com\/s\/shop\/api\/images\/dress.webp"/);
    assert.doesNotMatch(html, /顏色數：0|色數：0|品牌：童裝/);
    assert.match(html, /"price":"680","priceCurrency":"TWD"/);
    const alias = await (await f.fetch("/s/premium/product?code=premium-good")).text();
    assert.match(alias, /rel="canonical" href="https:\/\/premium.vovosnap.com\/product\?code=premium-good"/);
  } finally { f.sqlite.close(); }
});

test("sensitive and incomplete products remain visible but noindex; missing and over-limit products return 404", async () => {
  const f = fixture();
  try {
    for (const code of ["medicine", "missing-price"]) {
      const response = await f.fetch(`/s/shop/product?code=${code}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("x-robots-tag"), "noindex, follow");
      assert.match(await response.text(), /name="robots" content="noindex, follow"/);
    }
    for (const code of ["old", "does-not-exist", ""]) {
      const response = await f.fetch(`/s/shop/product?code=${code}`);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("x-robots-tag"), "noindex, follow");
    }
    const store = await f.fetch("/s/shop/");
    assert.equal(store.headers.get("x-robots-tag"), "noindex, follow");
    const html = await store.text();
    assert.match(html, /property="og:image" content="https:\/\/vovosnap.com\/s\/shop\/api\/images\/dress.webp"/);
    const premium = await f.fetch("https://premium.vovosnap.com/");
    assert.equal(premium.headers.get("x-robots-tag"), "index, follow");
  } finally { f.sqlite.close(); }
});

test("HTTP redirects and asynchronous route failures also receive security headers", async () => {
  const f = fixture();
  try {
    const redirect = await f.fetch("http://www.vovosnap.com/s/shop/?x=1");
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get("location"), "https://vovosnap.com/s/shop/?x=1");
    assert.equal(redirect.headers.get("x-content-type-options"), "nosniff");
    const response = await f.fetch("/healthz");
    assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
    const forwarded = await f.fetch("/healthz", { headers: { "x-forwarded-host": "attacker.example" } });
    assert.equal(forwarded.status, 200);
    f.env.ASSETS.fetch = async () => { throw Error("simulated asset failure"); };
    const originalError = console.error;
    console.error = () => {};
    try {
      const failed = await f.fetch("/s/shop/product?code=good");
      assert.equal(failed.status, 500);
      assert.equal(failed.headers.get("x-content-type-options"), "nosniff");
    } finally { console.error = originalError; }
  } finally { f.sqlite.close(); }
});
