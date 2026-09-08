import test from "node:test";
import assert from "node:assert/strict";
import {
  canBeMergePrimary,
  canBeMerged,
  validateMerge,
  buildMergeNote,
  isMergedForm,
} from "../src/shared/order-merge-logic.js";

const form = (overrides = {}) => ({
  id: 1,
  store_id: 7,
  order_code: "09081234",
  member_phone: "0912345678",
  status: "pending",
  notes: "",
  merged_into_id: null,
  remittance_status: null,
  paid_payment_orders: 0,
  ...overrides,
});

test("canBeMergePrimary 擋掉不能當主單的訂單", () => {
  assert.equal(canBeMergePrimary(form()).ok, true);
  assert.equal(canBeMergePrimary(form({ status: "paid" })).ok, true);
  assert.equal(canBeMergePrimary(form({ status: "preparing" })).ok, true);

  assert.equal(canBeMergePrimary(form({ status: "shipped" })).ok, false);
  assert.equal(canBeMergePrimary(form({ status: "cancelled" })).ok, false);
  // 鏈式合併：已經被併走的單不能再當別人的主單
  assert.equal(canBeMergePrimary(form({ merged_into_id: 99 })).ok, false);
  assert.equal(canBeMergePrimary(null).ok, false);
});

test("canBeMerged 擋掉不該被併走的訂單", () => {
  assert.equal(canBeMerged(form()).ok, true);

  assert.equal(canBeMerged(form({ status: "shipped" })).ok, false);
  assert.equal(canBeMerged(form({ status: "completed" })).ok, false);
  assert.equal(canBeMerged(form({ status: "cancelled" })).ok, false);
  assert.equal(canBeMerged(form({ status: "merged" })).ok, false);
  assert.equal(canBeMerged(form({ merged_into_id: 5 })).ok, false);
});

test("canBeMerged 擋掉已經在收款流程中的訂單", () => {
  // 併走會讓銀行明細對不回任何一張訂單
  assert.equal(canBeMerged(form({ remittance_status: "reported" })).ok, false);
  assert.equal(canBeMerged(form({ remittance_status: "verified" })).ok, false);
  // 駁回的沒有有效回報，可以併
  assert.equal(canBeMerged(form({ remittance_status: "rejected" })).ok, true);
  // 已完成線上付款的單同理
  assert.equal(canBeMerged(form({ paid_payment_orders: 1 })).ok, false);
  assert.equal(canBeMerged(form({ paid_payment_orders: 0 })).ok, true);
});

test("canBeMerged 的錯誤訊息帶得出是哪張單", () => {
  const result = canBeMerged(form({ id: 42, order_code: "09090001", status: "shipped" }));
  assert.equal(result.ok, false);
  assert.match(result.error, /09090001/);
});

test("validateMerge 要求同店同電話", () => {
  const primary = form({ id: 1 });
  assert.equal(validateMerge(primary, [form({ id: 2 })]).ok, true);

  assert.equal(validateMerge(primary, [form({ id: 2, store_id: 8 })]).ok, false);
  assert.equal(validateMerge(primary, [form({ id: 2, member_phone: "0987654321" })]).ok, false);
});

test("validateMerge 擋掉自我合併、重複與空清單", () => {
  const primary = form({ id: 1 });
  assert.equal(validateMerge(primary, []).ok, false);
  assert.equal(validateMerge(primary, [form({ id: 1 })]).ok, false);
  assert.equal(validateMerge(primary, [form({ id: 2 }), form({ id: 2 })]).ok, false);
});

test("validateMerge 主單不合格時直接失敗", () => {
  const result = validateMerge(form({ id: 1, status: "shipped" }), [form({ id: 2 })]);
  assert.equal(result.ok, false);
});

test("buildMergeNote 把併入的單號寫在備註最前面", () => {
  const note = buildMergeNote("客人要求分開包裝", [
    form({ id: 2, order_code: "09075678" }),
    form({ id: 3, order_code: "09063344" }),
  ]);
  assert.equal(note, "[已合併] #09075678, #09063344\n客人要求分開包裝");

  assert.equal(buildMergeNote("", [form({ id: 2, order_code: "09075678" })]), "[已合併] #09075678");
  assert.equal(buildMergeNote("原備註", []), "原備註");
});

test("isMergedForm 認得兩種來源的合併標記", () => {
  assert.equal(isMergedForm({ status: "merged" }), true);
  assert.equal(isMergedForm({ merged_into_id: 3 }), true);
  assert.equal(isMergedForm({ status: "pending", merged_into_id: null }), false);
});
