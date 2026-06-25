import test from "node:test";
import assert from "node:assert/strict";

import {
  PAYABLE_PLANS,
  PLAN_LABELS,
  makeMerTradeNo,
  decideNotifyAction,
  getPayuniTradeStatus,
  computeActivation,
} from "../src/shared/billing-logic.js";

test("PAYABLE_PLANS excludes free", () => {
  assert.deepEqual(PAYABLE_PLANS, ["plus", "pro", "proplus"]);
  assert.equal(PLAN_LABELS.proplus, "Pro+");
});

test("makeMerTradeNo is alphanumeric, <=20 chars, unique-ish", () => {
  const a = makeMerTradeNo(999999, 1760000000000);
  const b = makeMerTradeNo(999999, 1760000000000);
  assert.match(a, /^VS[0-9a-z]+$/i);
  assert.ok(a.length <= 20, `length ${a.length} > 20`);
  assert.notEqual(a, b, "random suffix must differ");
});

test("decideNotifyAction: paid order is idempotent", () => {
  assert.equal(
    decideNotifyAction({ orderStatus: "paid", orderAmount: 490, tradeStatus: "1", tradeAmt: "490" }),
    "already-paid"
  );
});

test("decideNotifyAction: amount mismatch is flagged", () => {
  assert.equal(
    decideNotifyAction({ orderStatus: "pending", orderAmount: 490, tradeStatus: "1", tradeAmt: "1" }),
    "amount-mismatch"
  );
});

test("decideNotifyAction: TradeStatus 1 with matching amount activates", () => {
  assert.equal(
    decideNotifyAction({ orderStatus: "pending", orderAmount: 490, tradeStatus: "1", tradeAmt: "490" }),
    "activate"
  );
});

test("decideNotifyAction: non-paid status stays pending (ATM 取號)", () => {
  assert.equal(
    decideNotifyAction({ orderStatus: "pending", orderAmount: 490, tradeStatus: "0", tradeAmt: "490" }),
    "pending"
  );
});

test("getPayuniTradeStatus centralizes PAYUNi success status field handling", () => {
  assert.equal(getPayuniTradeStatus({ TradeStatus: "1" }), "1");
  assert.equal(getPayuniTradeStatus({ Status: "1" }), "1");
  assert.equal(getPayuniTradeStatus({ status: "1" }), "1");
  assert.equal(getPayuniTradeStatus({}), "");
});

test("computeActivation: same plan with future expiry extends from expiry", () => {
  const now = new Date("2026-06-11T00:00:00.000Z");
  const r = computeActivation({
    currentPlan: "pro",
    currentExpiresAt: "2026-07-01T00:00:00.000Z",
    orderPlan: "pro",
    days: 30,
    now,
  });
  assert.equal(r.plan, "pro");
  assert.equal(r.expiresAt, "2026-07-31T00:00:00.000Z");
});

test("computeActivation: same plan but expired extends from now", () => {
  const now = new Date("2026-06-11T00:00:00.000Z");
  const r = computeActivation({
    currentPlan: "pro",
    currentExpiresAt: "2026-05-01T00:00:00.000Z",
    orderPlan: "pro",
    days: 30,
    now,
  });
  assert.equal(r.expiresAt, "2026-07-11T00:00:00.000Z");
});

test("computeActivation: cross-plan starts fresh from now", () => {
  const now = new Date("2026-06-11T00:00:00.000Z");
  const r = computeActivation({
    currentPlan: "plus",
    currentExpiresAt: "2026-12-01T00:00:00.000Z",
    orderPlan: "proplus",
    days: 420,
    now,
  });
  assert.equal(r.plan, "proplus");
  assert.equal(r.expiresAt, new Date(now.getTime() + 420 * 86400000).toISOString());
});
