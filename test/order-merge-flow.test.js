import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const migration = "../migrations/0027_order_merge.sql";
const routerTs = read("../src/router.ts");
const mergeTs = read("../src/routes/admin/order-merge.ts");
const adminRequirementsTs = read("../src/routes/admin/requirements.ts");
const publicRequirementsTs = read("../src/routes/public/requirements.ts");
const adminOrdersJs = read("../public/assets/app-admin-orders.js");
const orderHistoryJs = read("../public/assets/app-order-history.js");

test("migration 建立合併欄位與 origin_form_id", () => {
  assert.ok(existsSync(new URL(migration, import.meta.url)), "Expected migrations/0027_order_merge.sql");
  const sql = read(migration);
  assert.ok(sql.includes("ADD COLUMN merged_into_id"), "Expected merged_into_id on requirement_forms");
  assert.ok(sql.includes("ADD COLUMN merged_at"), "Expected merged_at on requirement_forms");
  // 沒有它，被併訂單就變成永久空殼，買家查不到內容也拆不回來
  assert.ok(
    sql.includes("ALTER TABLE requirement_items ADD COLUMN origin_form_id"),
    "Expected origin_form_id on requirement_items"
  );
  assert.ok(
    sql.includes("idx_requirement_forms_store_phone"),
    "Expected an index for the same-phone candidate lookup"
  );
});

test("router 註冊合併端點且全部需要店主身分", () => {
  for (const route of [
    '/api/admin/merge-candidates',
    '/api/admin/requirements/merge',
    '/api/admin/requirements/unmerge',
  ]) {
    const idx = routerTs.indexOf(`subPath === "${route}"`);
    assert.notEqual(idx, -1, `Expected route ${route}`);
    assert.ok(routerTs.slice(idx, idx + 220).includes("if (!isOwner)"), `Expected ${route} to be owner-gated`);
  }
});

test("合併端點重查資料庫，不採信前端送來的狀態", () => {
  assert.ok(mergeTs.includes("const primary = await loadForm(ctx, primaryId)"), "Expected the primary to be re-read");
  assert.ok(
    mergeTs.includes("WHERE rf.id IN (${placeholders}) AND rf.store_id = ?"),
    "Expected the merge targets to be re-read and store-scoped"
  );
  assert.ok(
    mergeTs.includes("others.length !== mergeIds.length"),
    "Expected a check that every requested id actually belongs to this store"
  );
  assert.ok(mergeTs.includes("validateMerge(primary, others)"), "Expected server-side merge validation");
});

test("合併寫入包在單一 transaction", () => {
  assert.ok(mergeTs.includes("await ctx.db.batch(["), "Expected the merge writes to run as one batch");
  assert.ok(
    mergeTs.includes("origin_form_id = COALESCE(origin_form_id, requirement_form_id)"),
    "Expected the item move to remember where each item came from"
  );
  // 品項換了，之前針對舊品項算的調整金額必須失效
  assert.ok(
    mergeTs.includes("adjusted_items_total_twd = NULL"),
    "Expected the primary's stale amount adjustment to be cleared"
  );
});

test("拆回依 origin_form_id 還原並回到 pending", () => {
  assert.ok(mergeTs.includes("handleOrderUnmerge"), "Expected an unmerge handler");
  assert.ok(
    mergeTs.includes("SET requirement_form_id = origin_form_id"),
    "Expected items to move back by origin_form_id"
  );
  assert.ok(mergeTs.includes("SET status = 'pending'"), "Expected the unmerged order to return to pending");
  assert.ok(
    mergeTs.includes("這張訂單沒有被合併，不需要拆回"),
    "Expected unmerge to refuse orders that were never merged"
  );
});

test("店家不能用狀態下拉手動把訂單設成 merged", () => {
  const idx = adminRequirementsTs.indexOf("const VALID_STATUSES =");
  const line = adminRequirementsTs.slice(idx, adminRequirementsTs.indexOf("\n", idx));
  assert.ok(!line.includes('"merged"'), "merged must not be a manually settable status");
  assert.ok(
    adminOrdersJs.includes('form.status === "merged" ? \'<span class="order-adjusted-badge">已合併</span>\''),
    "Expected the admin card to hide the status select on merged orders"
  );
});

test("被併訂單的品項靠 origin_form_id 還原", () => {
  for (const [name, src] of [["admin", adminRequirementsTs], ["public", publicRequirementsTs]]) {
    assert.ok(
      src.includes("OR ri.origin_form_id IN (${placeholders})") || src.includes("OR ri.origin_form_id = ?"),
      `Expected the ${name} item query to also fetch items by origin_form_id`
    );
    assert.ok(src.includes("originItemMap") || src.includes("origin_form_id = ?"), `Expected ${name} to map origin items`);
  }
});

test("後台有已合併分頁，且全部分頁不重複列出被併走的單", () => {
  assert.ok(adminOrdersJs.includes('{ value: "merged", label: "已合併"'), "Expected a 已合併 filter tab");
  assert.ok(
    adminOrdersJs.includes('{ value: "all", label: "全部", match: (form) => form.status !== "merged" }'),
    "Expected 全部 to exclude merged shells so items are not listed twice"
  );
  assert.ok(adminOrdersJs.includes("js-open-merge"), "Expected a merge entry point");
  assert.ok(adminOrdersJs.includes("js-unmerge"), "Expected an unmerge button");
});

test("買家歷史頁顯示併入提示而不是重複的金額", () => {
  assert.ok(orderHistoryJs.includes("已併入訂單 #"), "Expected the merged notice");
  assert.ok(orderHistoryJs.includes("款項以該訂單為準"), "Expected the total to be replaced by a pointer to the primary");
  assert.ok(publicRequirementsTs.includes("mergedIntoOrderCode"), "Expected the API to expose the primary order code");
});
