import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const billing = readFileSync(new URL("../src/routes/billing.ts", import.meta.url), "utf8");
const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");

test("billing routes are mounted on the main domain", () => {
  for (const p of [
    "/api/billing/checkout",
    "/api/billing/notify",
    "/api/billing/return",
    "/api/billing/order-status",
    "/api/billing/orders",
  ]) {
    assert.ok(index.includes(`"${p}"`), `index.ts must route ${p}`);
  }
});

test("checkout derives amount from plan offers, never from request body", () => {
  assert.ok(billing.includes("getPlanOfferByMonths(plan, months, DEFAULT_PLAN_OFFERS)"));
  assert.ok(!/body\.(amount|tradeAmt|price)/.test(billing), "amount must not come from client");
});

test("notify is idempotent and guards against amount mismatch", () => {
  assert.ok(billing.includes('if (action === "already-paid") return new Response("OK")'));
  assert.ok(billing.includes('"amount-mismatch"'));
  assert.ok(billing.includes("status != 'paid'"), "paid update must be guarded");
});

test("order-status only exposes the session store's own orders", () => {
  assert.ok(billing.includes("WHERE mer_trade_no = ? AND store_id = ?"));
});
