import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const migration = "../migrations/0026_remittance_report.sql";
const routerTs = read("../src/router.ts");
const remittanceTs = read("../src/routes/public/remittance.ts");
const adminRequirementsTs = read("../src/routes/admin/requirements.ts");
const publicRequirementsTs = read("../src/routes/public/requirements.ts");
const storeInfoTs = read("../src/routes/admin/store-info.ts");
const successHtml = read("../public/success.html");
const orderHistoryJs = read("../public/assets/app-order-history.js");
const remittanceFormJs = read("../public/assets/remittance-form.js");
const adminOrdersJs = read("../public/assets/app-admin-orders.js");
const adminHtml = read("../public/admin.html");

test("migration 建立匯款回報欄位與待核帳索引", () => {
  assert.ok(existsSync(new URL(migration, import.meta.url)), "Expected migrations/0026_remittance_report.sql");
  const sql = read(migration);
  for (const column of [
    "remittance_status",
    "remittance_last5",
    "remittance_amount",
    "remittance_paid_date",
    "remittance_reported_at",
    "remittance_verified_at",
  ]) {
    assert.ok(sql.includes(`ADD COLUMN ${column}`), `Expected migration to add ${column}`);
  }
  assert.ok(
    sql.includes("CHECK (remittance_status IN ('reported', 'verified', 'rejected')"),
    "Expected the status lifecycle to be constrained at the schema level"
  );
  assert.ok(
    sql.includes("idx_requirement_forms_remittance"),
    "Expected an index backing the admin 待核帳 tab"
  );
});

test("router 註冊買家匯款端點與後台設定端點", () => {
  assert.ok(routerTs.includes('subPath === "/api/remittance-info"'), "Expected public remittance info route");
  assert.ok(routerTs.includes('subPath === "/api/remittance-report"'), "Expected public remittance report route");
  assert.ok(
    routerTs.includes('subPath === "/api/admin/remittance-settings"'),
    "Expected admin remittance settings route"
  );
});

test("後台匯款設定端點需要店主身分", () => {
  const idx = routerTs.indexOf('subPath === "/api/admin/remittance-settings"');
  const block = routerTs.slice(idx, idx + 260);
  assert.ok(block.includes("if (!isOwner)"), "Expected the admin settings route to be gated on isOwner");
});

test("匯款回報用訂單編號加電話雙欄位比對", () => {
  assert.ok(
    remittanceTs.includes("WHERE store_id = ? AND order_code = ? AND member_phone = ?"),
    "Expected the report lookup to match order_code AND member_phone within the store"
  );
  // 查無資料時不能分辨「訂單不存在」與「電話不符」，否則會變成訂單編號探測器
  assert.ok(
    remittanceTs.includes("訂單編號或電話不正確"),
    "Expected a single ambiguous error for a failed lookup"
  );
});

test("店家未開啟匯款時不外流收款帳戶、也不收回報", () => {
  assert.ok(
    remittanceTs.includes("if (!settings.enabled) {\n    return json({ ok: true, enabled: false, instruction: \"\", accounts: [] });"),
    "Expected remittance-info to withhold accounts when disabled"
  );
  assert.ok(
    remittanceTs.includes("本商店尚未開放匯款回報"),
    "Expected remittance-report to reject when the store has not enabled it"
  );
});

test("後台核銷同時把訂單標記為已付款", () => {
  assert.ok(
    adminRequirementsTs.includes('Object.prototype.hasOwnProperty.call(body, "remittanceStatus")'),
    "Expected a PATCH branch for remittanceStatus"
  );
  const idx = adminRequirementsTs.indexOf("remittance_status = 'verified'");
  assert.notEqual(idx, -1, "Expected a verified update");
  const block = adminRequirementsTs.slice(idx, idx + 260);
  assert.ok(block.includes("status = 'paid'"), "Expected verification to also flip the order status to paid");
  assert.ok(
    adminRequirementsTs.includes("此訂單沒有匯款回報可核銷"),
    "Expected verification to refuse orders with no report"
  );
});

test("匯款相關寫入都限定在自己的 store", () => {
  const updates = adminRequirementsTs.match(/UPDATE requirement_forms[\s\S]*?WHERE id = \? AND store_id = \?/g) || [];
  assert.ok(updates.length >= 2, "Expected the remittance updates to be scoped by store_id");
  assert.ok(
    remittanceTs.includes("WHERE id = ? AND store_id = ?"),
    "Expected the buyer-facing update to be scoped by store_id"
  );
});

test("訂單 API 帶出匯款狀態", () => {
  assert.ok(adminRequirementsTs.includes("remittanceLast5:"), "Expected admin list to expose the reported last 5");
  assert.ok(publicRequirementsTs.includes("remittanceStatus: form.remittance_status"), "Expected buyer APIs to expose status");
  const occurrences = publicRequirementsTs.match(/remittanceStatus: form\.remittance_status/g) || [];
  assert.equal(occurrences.length, 2, "Expected both the detail and history endpoints to expose it");
});

test("歷史訂單 API 不回傳頁面沒用到的個資", () => {
  // 這支端點只憑一支電話就能查（本輪決定不加 OTP），回傳面壓到頁面真正讀得到的欄位
  const idx = publicRequirementsTs.indexOf("orders: forms.map((form) => {");
  assert.notEqual(idx, -1, "Expected the history response mapping");
  const block = publicRequirementsTs.slice(idx, publicRequirementsTs.indexOf("items: orderItems.map", idx));
  for (const field of ["recipientAddress:", "recipientCity:", "lineId:", "memberPhone:"]) {
    assert.ok(!block.includes(field), `History response must not expose ${field}`);
  }
  assert.ok(block.includes("memberName:"), "Expected the name, which the page does render");
});

test("買家兩個頁面共用同一個回報元件", () => {
  assert.ok(successHtml.includes('from "./assets/remittance-form.js"'), "Expected success.html to mount the component");
  assert.ok(orderHistoryJs.includes('from "./remittance-form.js"'), "Expected order history to mount the component");
  assert.ok(
    remittanceFormJs.includes('UNREPORTABLE_STATUSES = new Set(["shipped", "completed", "cancelled", "merged"])'),
    "Expected the component to mirror the backend's unreportable statuses"
  );
});

test("後台訂單有待核帳篩選與核銷操作", () => {
  assert.ok(
    adminOrdersJs.includes('{ value: "remittance", label: "待核帳"'),
    "Expected a 待核帳 filter tab"
  );
  assert.ok(adminOrdersJs.includes("js-remit-verify"), "Expected a verify button");
  assert.ok(adminOrdersJs.includes("js-remit-reject"), "Expected a reject button");
  assert.ok(
    adminOrdersJs.includes("form.remittanceLast5"),
    "Expected the last 5 digits to be searchable for reconciliation"
  );
});

test("匯款收款設定不綁方案", () => {
  assert.ok(adminHtml.includes('id="remittance-panel-content"'), "Expected a settings container");
  const idx = adminHtml.indexOf("function initPaymentTab(store) {");
  assert.notEqual(idx, -1, "Expected initPaymentTab");
  const block = adminHtml.slice(idx, idx + 200);
  const remitIdx = block.indexOf("initRemittanceTab()");
  const planIdx = block.indexOf("effective_plan");
  assert.notEqual(remitIdx, -1, "Expected the remittance tab to be initialised");
  // 離線匯款不經過平台金流，免費方案也要能用 — 必須在方案判斷之前渲染
  assert.ok(remitIdx < planIdx, "Expected remittance settings to render before the plan gate");
  assert.ok(
    storeInfoTs.includes("handleRemittanceSettings"),
    "Expected the settings handler to live with the other app_settings handlers"
  );
});
