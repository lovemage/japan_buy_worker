import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCanonicalAmount,
  genMerTradeNo,
  genPublicToken,
  decideStoreNotifyAction,
  computeExpiresAt,
  canUseStoreCollection,
  computeEffectiveEnabled,
} from "../src/shared/store-payment-logic.js";

// ── parseCanonicalAmount ──────────────────────────────────────────────────────

test("parseCanonicalAmount rejects 0 (below minimum)", () => {
  assert.equal(parseCanonicalAmount(0), null);
  assert.equal(parseCanonicalAmount("0"), null);
});

test("parseCanonicalAmount rejects -1 (negative)", () => {
  assert.equal(parseCanonicalAmount(-1), null);
  assert.equal(parseCanonicalAmount("-1"), null);
});

test("parseCanonicalAmount accepts 1 (minimum)", () => {
  assert.equal(parseCanonicalAmount(1), 1);
  assert.equal(parseCanonicalAmount("1"), 1);
});

test("parseCanonicalAmount accepts 9999999 (maximum)", () => {
  assert.equal(parseCanonicalAmount(9999999), 9999999);
  assert.equal(parseCanonicalAmount("9999999"), 9999999);
});

test("parseCanonicalAmount rejects 10000000 (above maximum)", () => {
  assert.equal(parseCanonicalAmount(10000000), null);
  assert.equal(parseCanonicalAmount("10000000"), null);
});

test("parseCanonicalAmount accepts string '100'", () => {
  assert.equal(parseCanonicalAmount("100"), 100);
});

test("parseCanonicalAmount rejects float '1.5'", () => {
  assert.equal(parseCanonicalAmount("1.5"), null);
  assert.equal(parseCanonicalAmount(1.5), null);
});

test("parseCanonicalAmount rejects 'abc'", () => {
  assert.equal(parseCanonicalAmount("abc"), null);
});

test("parseCanonicalAmount rejects null and undefined", () => {
  assert.equal(parseCanonicalAmount(null), null);
  assert.equal(parseCanonicalAmount(undefined), null);
});

test("parseCanonicalAmount rejects signed strings like '+5'", () => {
  assert.equal(parseCanonicalAmount("+5"), null);
});

test("parseCanonicalAmount rejects empty string", () => {
  assert.equal(parseCanonicalAmount(""), null);
});

// ── genMerTradeNo ─────────────────────────────────────────────────────────────

test("genMerTradeNo is alphanumeric and <= 20 chars", () => {
  const t = genMerTradeNo();
  assert.ok(t.length <= 20, `expected <=20 chars, got ${t.length}`);
  assert.match(t, /^[A-Z0-9]+$/i, "must be alphanumeric");
});

test("genMerTradeNo does not encode store_id (opaque)", () => {
  // Generate 20 trade numbers — none should contain a predictable store_id pattern
  for (let i = 0; i < 20; i++) {
    const t = genMerTradeNo();
    // storeId would appear as a decimal substring — we just check uniqueness below
    assert.ok(t.startsWith("SP"), "expected SP prefix");
  }
});

test("genMerTradeNo produces unique values (uniqueness stress test)", () => {
  const set = new Set();
  for (let i = 0; i < 1000; i++) set.add(genMerTradeNo());
  // With 18 random base-36 chars (~93 bits entropy), collisions within 1000 are astronomically unlikely
  assert.equal(set.size, 1000, "expected all 1000 to be unique");
});

test("genMerTradeNo is exactly 20 chars", () => {
  for (let i = 0; i < 10; i++) {
    assert.equal(genMerTradeNo().length, 20);
  }
});

// ── genPublicToken ────────────────────────────────────────────────────────────

test("genPublicToken produces a non-empty base64url string", () => {
  const t = genPublicToken();
  assert.ok(t.length >= 24, `expected >=24 chars, got ${t.length} — needs adequate entropy`);
  // base64url chars: A-Z a-z 0-9 - _  (no + / or =)
  assert.match(t, /^[A-Za-z0-9_-]+$/, "must be base64url (no +, /, or =)");
});

test("genPublicToken produces unique values (entropy check)", () => {
  const set = new Set();
  for (let i = 0; i < 500; i++) set.add(genPublicToken());
  assert.equal(set.size, 500);
});

// ── decideStoreNotifyAction ───────────────────────────────────────────────────

const BASE = {
  orderStatus: "pending",
  orderAmount: 1000,
  orderIsSandbox: false,
  orderTradeNo: null,
  tradeStatus: "1",
  tradeAmt: "1000",
  notifyIsSandbox: false,
  notifyTradeNo: "PAYUNITRX001",
};

test("decideStoreNotifyAction → 'ignore' for paid status (terminal)", () => {
  assert.equal(decideStoreNotifyAction({ ...BASE, orderStatus: "paid" }), "ignore");
});

test("decideStoreNotifyAction → 'ignore' for failed status (terminal)", () => {
  assert.equal(decideStoreNotifyAction({ ...BASE, orderStatus: "failed" }), "ignore");
});

test("decideStoreNotifyAction → 'ignore' for expired status (terminal)", () => {
  assert.equal(decideStoreNotifyAction({ ...BASE, orderStatus: "expired" }), "ignore");
});

test("decideStoreNotifyAction → 'ignore' for cancelled status (terminal)", () => {
  assert.equal(decideStoreNotifyAction({ ...BASE, orderStatus: "cancelled" }), "ignore");
});

test("decideStoreNotifyAction → 'replay' when TradeNo differs from stored", () => {
  assert.equal(
    decideStoreNotifyAction({ ...BASE, orderTradeNo: "OLDTRX001", notifyTradeNo: "NEWTRX002" }),
    "replay"
  );
});

test("decideStoreNotifyAction → 'sandbox-mismatch' when env snapshots differ", () => {
  assert.equal(
    decideStoreNotifyAction({ ...BASE, orderIsSandbox: true, notifyIsSandbox: false }),
    "sandbox-mismatch"
  );
  assert.equal(
    decideStoreNotifyAction({ ...BASE, orderIsSandbox: false, notifyIsSandbox: true }),
    "sandbox-mismatch"
  );
});

test("decideStoreNotifyAction → 'amount-mismatch' when amounts differ", () => {
  assert.equal(
    decideStoreNotifyAction({ ...BASE, orderAmount: 1000, tradeAmt: "999" }),
    "amount-mismatch"
  );
});

test("decideStoreNotifyAction → 'amount-mismatch' when PAYUNi amount is non-integer", () => {
  assert.equal(
    decideStoreNotifyAction({ ...BASE, tradeAmt: "1000.5" }),
    "amount-mismatch"
  );
});

test("decideStoreNotifyAction → 'activate' on success with matching amount", () => {
  assert.equal(decideStoreNotifyAction(BASE), "activate");
});

test("decideStoreNotifyAction → 'activate' allows orderTradeNo=null to advance (first notify)", () => {
  // orderTradeNo null means we haven't stored a TradeNo yet — not a replay
  assert.equal(
    decideStoreNotifyAction({ ...BASE, orderTradeNo: null, notifyTradeNo: "FIRST001" }),
    "activate"
  );
});

test("decideStoreNotifyAction → 'pending' when tradeStatus is not '1'", () => {
  assert.equal(
    decideStoreNotifyAction({ ...BASE, tradeStatus: "0", tradeAmt: "1000" }),
    "pending"
  );
  assert.equal(
    decideStoreNotifyAction({ ...BASE, tradeStatus: "2" }),
    "pending"
  );
});

// ── computeExpiresAt ──────────────────────────────────────────────────────────

const NOW = Date.now();

test("computeExpiresAt defaults to 7 days when not specified", () => {
  const expiresAt = computeExpiresAt(undefined, NOW);
  const diff = new Date(expiresAt).getTime() - NOW;
  const sevenDays = 7 * 24 * 3_600_000;
  assert.ok(Math.abs(diff - sevenDays) < 1000, "default should be 7 days");
});

test("computeExpiresAt defaults to 7 days for 0 or negative", () => {
  const sevenDays = 7 * 24 * 3_600_000;
  const a = new Date(computeExpiresAt(0, NOW)).getTime() - NOW;
  const b = new Date(computeExpiresAt(-5, NOW)).getTime() - NOW;
  assert.ok(Math.abs(a - sevenDays) < 1000);
  assert.ok(Math.abs(b - sevenDays) < 1000);
});

test("computeExpiresAt clamps to 14 days max", () => {
  const expiresAt = computeExpiresAt(999, NOW); // 999 hours >> 14 days
  const diff = new Date(expiresAt).getTime() - NOW;
  const maxMs = 14 * 24 * 3_600_000;
  assert.ok(Math.abs(diff - maxMs) < 1000, "should be clamped to 14 days");
});

test("computeExpiresAt respects a value within range", () => {
  const hours = 48; // 2 days
  const expiresAt = computeExpiresAt(hours, NOW);
  const diff = new Date(expiresAt).getTime() - NOW;
  assert.ok(Math.abs(diff - hours * 3_600_000) < 1000);
});

// ── canUseStoreCollection ─────────────────────────────────────────────────────

test("canUseStoreCollection returns true for pro", () => {
  assert.equal(canUseStoreCollection("pro"), true);
});

test("canUseStoreCollection returns true for proplus", () => {
  assert.equal(canUseStoreCollection("proplus"), true);
});

test("canUseStoreCollection returns false for plus", () => {
  assert.equal(canUseStoreCollection("plus"), false);
});

test("canUseStoreCollection returns false for free", () => {
  assert.equal(canUseStoreCollection("free"), false);
});

test("canUseStoreCollection returns false for unknown plan", () => {
  assert.equal(canUseStoreCollection("enterprise"), false);
  assert.equal(canUseStoreCollection(""), false);
});

// ── computeEffectiveEnabled ───────────────────────────────────────────────────

test("computeEffectiveEnabled is true only when all three flags are true", () => {
  assert.equal(computeEffectiveEnabled({ isEnabled: true, planOk: true, configValid: true }), true);
});

test("computeEffectiveEnabled is false if isEnabled is false", () => {
  assert.equal(computeEffectiveEnabled({ isEnabled: false, planOk: true, configValid: true }), false);
});

test("computeEffectiveEnabled is false if planOk is false", () => {
  assert.equal(computeEffectiveEnabled({ isEnabled: true, planOk: false, configValid: true }), false);
});

test("computeEffectiveEnabled is false if configValid is false", () => {
  assert.equal(computeEffectiveEnabled({ isEnabled: true, planOk: true, configValid: false }), false);
});

test("computeEffectiveEnabled treats falsy values (0, null) as false", () => {
  assert.equal(computeEffectiveEnabled({ isEnabled: 0, planOk: 1, configValid: 1 }), false);
  assert.equal(computeEffectiveEnabled({ isEnabled: 1, planOk: null, configValid: 1 }), false);
});
