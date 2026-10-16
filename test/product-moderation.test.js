import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createRequire } from "node:module";

import {
  adminActionAllowed,
  keywordAssessment,
  normalizeAiResults,
  sellerActionAllowed,
  shouldSuggestSuspension,
  statusAfterSellerResponse,
  isOverdue,
  SELLER_RESPONSE_DAYS,
} from "../src/shared/moderation-logic.js";

const { buildSync } = createRequire(import.meta.resolve("wrangler/package.json"))("esbuild");
const buildDir = mkdtempSync(join(tmpdir(), "vovosnap-moderation-"));
for (const [entry, out] of [["../src/index.ts", "worker.mjs"], ["../src/services/product-moderation.ts", "moderation.mjs"]]) {
  buildSync({ entryPoints: [new URL(entry, import.meta.url).pathname], bundle: true, platform: "node", format: "esm", outfile: join(buildDir, out), logLevel: "silent" });
}
const worker = (await import(pathToFileURL(join(buildDir, "worker.mjs")).href)).default;
const moderation = await import(pathToFileURL(join(buildDir, "moderation.mjs")).href);
after(() => rmSync(buildDir, { recursive: true, force: true }));

const PASSWORD = "test-platform-password";

function fixture({ withAiKey = true } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE stores (id INTEGER PRIMARY KEY, slug TEXT, subdomain TEXT, name TEXT, owner_email TEXT, description TEXT, plan TEXT, plan_expires_at TEXT, is_active INTEGER, updated_at TEXT, destination_country TEXT, template TEXT);
    CREATE TABLE app_settings (store_id INTEGER, key TEXT, value TEXT, updated_at TEXT, PRIMARY KEY (store_id, key));
    CREATE TABLE products (id INTEGER PRIMARY KEY, store_id INTEGER, source_product_code TEXT, title_zh_tw TEXT, title_ja TEXT, brand TEXT, category TEXT, price_jpy_tax_in REAL, image_url TEXT, source_payload_json TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT, updated_at TEXT);
    CREATE TABLE email_notification_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER NOT NULL, event_type TEXT NOT NULL, dedupe_key TEXT NOT NULL, recipient_email TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', error TEXT, sent_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(event_type, dedupe_key));
    CREATE TABLE api_usage_logs (store_id INTEGER NOT NULL, api_type TEXT NOT NULL, month_key TEXT NOT NULL, call_count INTEGER NOT NULL DEFAULT 0, last_called_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (store_id, api_type, month_key));
  `);
  sqlite.exec(readFileSync(new URL("../migrations/0030_product_moderation.sql", import.meta.url), "utf8"));
  sqlite.exec(`
    INSERT INTO stores VALUES (1, 'shop', NULL, '日常小店', 'owner@example.com', '小店', 'free', NULL, 1, '2026-10-16', 'tw', 'default');
    INSERT INTO stores VALUES (2, 'closed', NULL, '停用店', 'closed@example.com', '', 'free', NULL, 0, '2026-10-16', 'tw', 'default');
    INSERT INTO app_settings VALUES (0, 'gemini_model', 'gemini-2.5-flash', '2026-10-16');
  `);
  if (withAiKey) sqlite.exec("INSERT INTO app_settings VALUES (0, 'gemini_api_key_starter', 'test-key', '2026-10-16')");
  const payload = (description) => JSON.stringify({ description, gallery: [] });
  const insert = sqlite.prepare("INSERT INTO products (id, store_id, source_product_code, title_zh_tw, title_ja, brand, category, price_jpy_tax_in, image_url, source_payload_json, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, '', ?, ?, 500, '/api/images/x.webp', ?, 1, '2026-10-01', '2026-10-01')");
  insert.run(1, 1, "lotion", "日本帶回肌研化妝水", "肌研", "保養", payload("出國在藥妝店買回來的化妝水，170ml。"));
  insert.run(2, 1, "notebook", "日本手帳", "LOFT", "文具", payload("A5 尺寸週記手帳。"));
  insert.run(3, 2, "pill", "感冒藥", "", "醫藥品", payload("停用店的商品不會被掃描。"));

  const db = {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() { return sqlite.prepare(sql).get(...params) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...params) }; },
        async run() { const info = sqlite.prepare(sql).run(...params); return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) } }; },
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map((s) => s.run())); },
  };
  const sent = [];
  const env = {
    DB: db,
    APP_URL: "https://vovosnap.com",
    MAIN_DOMAIN: "vovosnap.com",
    PLATFORM_ADMIN_PASSWORD: PASSWORD,
    EMAIL: { async send(message) { sent.push(message); } },
  };
  const row = (sql, ...params) => { const r = sqlite.prepare(sql).get(...params); return r ? { ...r } : r; };
  const rows = (sql, ...params) => sqlite.prepare(sql).all(...params);
  const fetchWorker = (path, options) => worker.fetch(new Request(`https://vovosnap.com${path}`, options), env);
  return { sqlite, env, sent, row, rows, fetchWorker };
}

// Fake Gemini: flags anything that looks like cosmetics, passes everything else.
function fakeGemini(calls = []) {
  return async (url, init) => {
    calls.push(url);
    const prompt = JSON.parse(init.body).contents[0].parts[0].text;
    const items = JSON.parse(prompt.slice(prompt.indexOf("[")));
    const out = items.map((item) => /化妝水/.test(item.title)
      ? { id: item.id, risk: "violation", rule: "cosmetics", reason: "標題寫明日本帶回的化妝水，可能為自用帶回轉售。" }
      : { id: item.id, risk: "none", rule: "other", reason: "一般商品" });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }), { status: 200 });
  };
}

async function adminToken(f) {
  const res = await f.fetchWorker("/api/platform-admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "lovemage@gmail.com", password: PASSWORD }),
  });
  const data = await res.json();
  assert.ok(data.ok, "platform admin login");
  return data.token;
}

test("pure rules: transitions, appeals, strikes, overdue and AI output validation", () => {
  assert.ok(adminActionAllowed("remove", "open"));
  assert.ok(!adminActionAllowed("remove", "dismissed"));
  assert.ok(adminActionAllowed("restore", "appealed"));
  assert.ok(sellerActionAllowed("respond", "removed"));
  assert.ok(!sellerActionAllowed("self_remove", "removed"));
  assert.equal(statusAfterSellerResponse("open"), "responded");
  assert.equal(statusAfterSellerResponse("removed"), "appealed");
  assert.ok(!shouldSuggestSuspension(2));
  assert.ok(shouldSuggestSuspension(3));
  assert.ok(isOverdue({ status: "open", seller_deadline_at: "2000-01-01T00:00:00Z" }));
  assert.ok(!isOverdue({ status: "responded", seller_deadline_at: "2000-01-01T00:00:00Z" }));
  assert.equal(keywordAssessment({ title_zh_tw: "日本眼藥水" }).rule, "drug");
  assert.equal(keywordAssessment({ title_zh_tw: "帆布托特包" }).risk, "none");

  const normalized = normalizeAiResults(
    [{ id: 1, risk: "high_risk", rule: "drug", reason: "藥品" }, { id: 99, risk: "violation", rule: "food" }, { id: 2, risk: "weird", rule: "nope", reason: "" }],
    [1, 2]
  );
  assert.deepEqual(normalized.get(1), { risk: "high_risk", rule: "drug", reason: "藥品" });
  assert.equal(normalized.has(99), false, "ids that were not sent are ignored");
  assert.deepEqual(normalized.get(2), { risk: "none", rule: "other", reason: "" });
});

test("weekly scan flags risky products, notifies the seller once and skips unchanged products", async () => {
  const f = fixture();
  try {
    const calls = [];
    const now = new Date("2026-10-19T18:00:00Z");
    const summary = await moderation.runModerationScan(f.env, { trigger: "cron", now, fetchImpl: fakeGemini(calls) });
    assert.equal(summary.scanned, 2, "inactive stores are not scanned");
    assert.equal(summary.flagged, 1);
    assert.equal(summary.notifiedStores, 1);
    assert.ok(summary.aiUsed);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /gemini-2\.5-flash:generateContent\?key=test-key/);

    const c = f.row("SELECT * FROM moderation_cases");
    assert.equal(c.product_id, 1);
    assert.equal(c.status, "open");
    assert.equal(c.rule_code, "cosmetics");
    assert.equal(c.seller_deadline_at, new Date(now.getTime() + SELLER_RESPONSE_DAYS * 86400_000).toISOString());
    assert.match(JSON.parse(c.snapshot_json).title, /化妝水/);
    assert.ok(c.notified_at);
    assert.equal(f.row("SELECT moderation_status FROM products WHERE id = 1").moderation_status, "flagged");
    assert.equal(f.row("SELECT is_active FROM products WHERE id = 1").is_active, 1, "a notice never takes the product down");

    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0].to, "owner@example.com");
    assert.match(f.sent[0].text, /日本帶回肌研化妝水/);
    assert.match(f.sent[0].text, /商品目前仍正常販售/);
    assert.ok(f.rows("SELECT action FROM moderation_actions").some((a) => a.action === "notified"));

    const again = await moderation.runModerationScan(f.env, { trigger: "cron", now, fetchImpl: fakeGemini(calls) });
    assert.equal(again.scanned, 0, "unchanged products are not re-sent to the AI");
    assert.equal(calls.length, 1);

    f.sqlite.exec("UPDATE products SET title_zh_tw = '日本手帳 2027' WHERE id = 2");
    const changed = await moderation.runModerationScan(f.env, { trigger: "cron", now, fetchImpl: fakeGemini(calls) });
    assert.equal(changed.scanned, 1, "edited products are scanned again");
    assert.equal(changed.flagged, 0);
  } finally { f.sqlite.close(); }
});

test("without an AI key, or when the AI fails, the scan falls back to keyword checks", async () => {
  const noKey = fixture({ withAiKey: false });
  try {
    const summary = await moderation.runModerationScan(noKey.env, { trigger: "manual", fetchImpl: () => { throw new Error("must not call"); } });
    assert.equal(summary.aiUsed, false);
    assert.equal(summary.flagged, 1);
    assert.equal(noKey.row("SELECT source FROM moderation_cases").source, "keyword_scan");
  } finally { noKey.sqlite.close(); }

  const failing = fixture();
  try {
    const summary = await moderation.runModerationScan(failing.env, {
      trigger: "manual",
      fetchImpl: async () => new Response("quota", { status: 429 }),
    });
    assert.equal(summary.flagged, 1);
    assert.match(summary.errors[0], /Gemini 429/);
  } finally { failing.sqlite.close(); }
});

test("manual-review cases written without a notice are emailed once by the next scan", async () => {
  const f = fixture();
  try {
    f.sqlite.exec(`
      UPDATE products SET is_active = 0, moderation_status = 'removed' WHERE id = 1;
      INSERT INTO moderation_cases (store_id, product_id, source, risk_level, rule_code, reason, status, snapshot_json)
        VALUES (1, 1, 'manual_review', 'violation', 'pesticide', '商品名稱標示防蚊。', 'removed', '{"title":"防蚊磚"}');
      UPDATE products SET moderation_status = 'flagged' WHERE id = 2;
      INSERT INTO moderation_cases (store_id, product_id, source, risk_level, rule_code, reason, status, seller_deadline_at, snapshot_json)
        VALUES (1, 2, 'manual_review', 'suspected', 'radio_device', '須通過 NCC 審驗。', 'open', '2026-10-23T00:00:00Z', '{"title":"無線滑鼠"}');
    `);
    const summary = await moderation.runModerationScan(f.env, { trigger: "manual", fetchImpl: fakeGemini() });
    assert.equal(summary.notifiedStores, 2, "one removal email and one notice email");
    assert.equal(f.sent.length, 2);
    const removal = f.sent.find((m) => /暫時下架/.test(m.subject));
    assert.match(removal.text, /防蚊磚（環境用藥、防蚊產品）/);
    assert.match(removal.text, /提出申訴/);
    assert.ok(f.sent.some((m) => /無線滑鼠/.test(m.text) && /仍正常販售/.test(m.text)));
    assert.equal(f.rows("SELECT * FROM moderation_cases WHERE notified_at IS NULL").length, 0);

    await moderation.runModerationScan(f.env, { trigger: "manual", fetchImpl: fakeGemini() });
    assert.equal(f.sent.length, 2, "notices are not sent twice");
  } finally { f.sqlite.close(); }
});

test("cron scan respects the platform switch", async () => {
  const f = fixture();
  try {
    f.sqlite.exec("INSERT INTO app_settings VALUES (0, 'moderation_scan_enabled', '0', '2026-10-16')");
    const summary = await moderation.runModerationScan(f.env, { trigger: "cron", fetchImpl: fakeGemini() });
    assert.equal(summary.scanned, 0);
    assert.equal(f.rows("SELECT * FROM moderation_cases").length, 0);
  } finally { f.sqlite.close(); }
});

test("seller explains, admin removes, seller cannot relist or sell it, appeal restores and the same content is not re-flagged", async () => {
  const f = fixture();
  try {
    await moderation.runModerationScan(f.env, { trigger: "cron", fetchImpl: fakeGemini() });
    const caseId = f.row("SELECT id FROM moderation_cases").id;

    const short = await moderation.sellerRespond(f.env.DB, 1, caseId, "ok");
    assert.equal(short.ok, false, "a meaningful explanation is required");
    assert.equal((await moderation.sellerRespond(f.env.DB, 2, caseId, "不是我的案件")).ok, false, "stores cannot answer other stores' cases");
    const responded = await moderation.sellerRespond(f.env.DB, 1, caseId, "這是台灣代理商的正貨，有進貨發票。");
    assert.equal(responded.status, "responded");

    const token = await adminToken(f);
    const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    assert.equal((await f.fetchWorker("/api/platform-admin/moderation/cases")).status, 401, "endpoints require platform admin auth");

    const list = await (await f.fetchWorker("/api/platform-admin/moderation/cases?filter=review", { headers: auth })).json();
    assert.equal(list.cases.length, 1);
    assert.equal(list.cases[0].store_name, "日常小店");

    const removed = await (await f.fetchWorker(`/api/platform-admin/moderation/cases/${caseId}/action`, {
      method: "POST", headers: auth, body: JSON.stringify({ action: "remove", note: "標題寫明日本帶回。" }),
    })).json();
    assert.equal(removed.ok, true);
    assert.equal(removed.emailed, true);
    assert.deepEqual(f.row("SELECT is_active, moderation_status FROM products WHERE id = 1"), { is_active: 0, moderation_status: "removed" });
    assert.match(f.sent.at(-1).subject, /已由平台暫時下架/);
    assert.match(f.sent.at(-1).text, /標題寫明日本帶回/);

    assert.equal(await moderation.isRemovedByPlatform(f.env.DB, 1, 1), true);
    assert.deepEqual(await moderation.findRemovedProductIds(f.env.DB, 1, [1, 2, 0, NaN]), [1]);
    const dismissAfterRemove = await (await f.fetchWorker(`/api/platform-admin/moderation/cases/${caseId}/action`, {
      method: "POST", headers: auth, body: JSON.stringify({ action: "dismiss" }),
    })).json();
    assert.equal(dismissAfterRemove.ok, false, "invalid transitions are rejected");

    const appeal = await moderation.sellerRespond(f.env.DB, 1, caseId, "補上進口報單與產品登錄字號。");
    assert.equal(appeal.status, "appealed");
    const restored = await (await f.fetchWorker(`/api/platform-admin/moderation/cases/${caseId}/action`, {
      method: "POST", headers: auth, body: JSON.stringify({ action: "restore" }),
    })).json();
    assert.equal(restored.status, "restored");
    assert.equal(f.row("SELECT moderation_status FROM products WHERE id = 1").moderation_status, "none");

    f.sqlite.exec("UPDATE products SET is_active = 1 WHERE id = 1");
    f.sqlite.exec("UPDATE products SET moderation_scanned_hash = NULL WHERE id = 1");
    const rescan = await moderation.runModerationScan(f.env, { trigger: "cron", fetchImpl: fakeGemini() });
    assert.equal(rescan.flagged, 0, "content the platform cleared is not flagged again");

    const detail = await (await f.fetchWorker(`/api/platform-admin/moderation/cases/${caseId}`, { headers: auth })).json();
    const actions = detail.case.actions.map((a) => a.action);
    for (const expected of ["flagged", "notified", "seller_response", "removed", "appeal", "restored"]) {
      assert.ok(actions.includes(expected), `audit log records ${expected}`);
    }
  } finally { f.sqlite.close(); }
});

test("seller self-removal closes the case and a relisted product is checked again", async () => {
  const f = fixture();
  try {
    await moderation.runModerationScan(f.env, { trigger: "cron", fetchImpl: fakeGemini() });
    const caseId = f.row("SELECT id FROM moderation_cases").id;
    const result = await moderation.sellerSelfRemove(f.env.DB, 1, caseId);
    assert.equal(result.status, "seller_removed");
    assert.deepEqual(f.row("SELECT is_active, moderation_status, moderation_scanned_hash FROM products WHERE id = 1"), { is_active: 0, moderation_status: "none", moderation_scanned_hash: null });

    const sellerView = await moderation.listSellerCases(f.env.DB, 1);
    assert.equal(sellerView[0].status, "seller_removed");
    assert.equal(sellerView[0].canRespond, false);

    f.sqlite.exec("UPDATE products SET is_active = 1 WHERE id = 1");
    const rescan = await moderation.runModerationScan(f.env, { trigger: "cron", fetchImpl: fakeGemini() });
    assert.equal(rescan.flagged, 1, "relisting the same content raises a new notice");
  } finally { f.sqlite.close(); }
});

test("checkout and relisting are guarded in the request handlers", () => {
  const requirements = readFileSync(new URL("../src/routes/public/requirements.ts", import.meta.url), "utf8");
  assert.ok(requirements.indexOf("findRemovedProductIds") < requirements.indexOf("INSERT INTO requirement_forms"), "removed products are rejected before an order is created");
  const products = readFileSync(new URL("../src/routes/admin/products.ts", import.meta.url), "utf8");
  assert.match(products, /isRemovedByPlatform\(ctx\.db, ctx\.storeId, id\)/);
  const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
  const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
  const cron = index.match(/MODERATION_SCAN_CRON = "([^"]+)"/)[1];
  assert.ok(wrangler.includes(`"${cron}"`), "the weekly cron in wrangler.toml matches the scheduled() dispatch");
});
