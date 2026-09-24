import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const migrationPath = "../migrations/0028_order_notes.sql";
const adminRequirementsTs = read("../src/routes/admin/requirements.ts");
const publicRequirementsTs = read("../src/routes/public/requirements.ts");
const adminOrdersJs = read("../public/assets/app-admin-orders.js");
const orderHistoryJs = read("../public/assets/app-order-history.js");

test("migration 新增內部／外部備註與時間欄位", () => {
  assert.ok(existsSync(new URL(migrationPath, import.meta.url)), "Expected migrations/0028_order_notes.sql");
  const sql = read(migrationPath);
  for (const column of [
    "internal_note",
    "internal_note_updated_at",
    "external_note",
    "external_note_created_at",
    "external_note_updated_at",
  ]) {
    assert.ok(sql.includes(`ADD COLUMN ${column} `), `Expected migration to add ${column}`);
  }
});

test("後台 API 可儲存並回傳兩種備註", () => {
  assert.ok(adminRequirementsTs.includes('hasOwnProperty.call(body, "internalNote")'));
  assert.ok(adminRequirementsTs.includes('hasOwnProperty.call(body, "externalNote")'));
  assert.ok(adminRequirementsTs.includes("ORDER_NOTE_MAX_LENGTH"), "Expected note length limit");
  assert.match(adminRequirementsTs, /COALESCE\(external_note_created_at, datetime\('now'\)\)/, "Expected first-edit time to be kept");
  for (const key of ["internalNote", "externalNote", "externalNoteCreatedAt", "externalNoteUpdatedAt"]) {
    assert.ok(adminRequirementsTs.includes(`${key}: form.`), `Expected admin list to expose ${key}`);
  }
});

test("公開端點只回外部備註，不洩漏內部備註", () => {
  assert.ok(!publicRequirementsTs.includes("internal_note"), "Public API must never read internal_note");
  assert.ok(!publicRequirementsTs.includes("internalNote"), "Public API must never expose internalNote");
  assert.ok(publicRequirementsTs.includes("externalNote: form.external_note"));
  assert.ok(publicRequirementsTs.includes("externalNoteUpdatedAt"));
});

test("後台兩個備註欄預設收合", () => {
  assert.ok(adminOrdersJs.includes('orderNoteBlockHtml("internal", form)'));
  assert.ok(adminOrdersJs.includes('orderNoteBlockHtml("external", form)'));
  assert.match(adminOrdersJs, /<details class="order-note"(?![^>]*\sopen)/, "Expected collapsed <details> without open attribute");
  assert.ok(adminOrdersJs.includes("js-save-note"));
});

test("買家歷史訂單顯示外部備註與編輯／更新時間", () => {
  assert.ok(orderHistoryJs.includes("storeNoteHtml(order)"));
  assert.ok(orderHistoryJs.includes("externalNoteCreatedAt"));
  assert.ok(orderHistoryJs.includes("externalNoteUpdatedAt"));
  assert.ok(orderHistoryJs.includes("編輯時間"));
  assert.ok(orderHistoryJs.includes("更新時間"));
  assert.ok(!orderHistoryJs.includes("internalNote"));
});
