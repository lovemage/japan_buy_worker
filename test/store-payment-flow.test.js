import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const storePayment = readFileSync(new URL("../src/routes/store-payment.ts", import.meta.url), "utf8");
const publicRequirements = readFileSync(new URL("../src/routes/public/requirements.ts", import.meta.url), "utf8");
const adminRequirements = readFileSync(new URL("../src/routes/admin/requirements.ts", import.meta.url), "utf8");
const adminOrders = readFileSync(new URL("../public/assets/app-admin-orders.js", import.meta.url), "utf8");
const requestJs = readFileSync(new URL("../public/assets/app-request.js", import.meta.url), "utf8");
const payResult = readFileSync(new URL("../public/pay-result.html", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/0024_store_payment_direct_checkout.sql", import.meta.url), "utf8");

test("direct checkout is opt-in and defaults off in schema", () => {
  assert.match(migration, /direct_checkout_enabled INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /direct_checkout_enabled IN \(0, 1\)/);
});

test("store payment config exposes and saves direct checkout intent", () => {
  assert.ok(storePayment.includes("directCheckoutEnabled"));
  assert.ok(storePayment.includes("directCheckoutAvailable"));
  assert.ok(storePayment.includes("direct_checkout_enabled"));
  assert.ok(storePayment.includes("Enable and test payment collection before direct checkout"));
});

test("public requirement creation can create a linked direct payment order", () => {
  assert.ok(publicRequirements.includes("maybeCreateDirectPaymentOrder"));
  assert.ok(publicRequirements.includes("requirement_form_id"));
  assert.ok(publicRequirements.includes("direct_checkout_enabled"));
  assert.ok(publicRequirements.includes("payUrl"));
});

test("request frontend redirects to payUrl when direct checkout is returned", () => {
  assert.ok(requestJs.includes("if (body.payUrl)"));
  assert.ok(requestJs.includes("location.href = body.payUrl"));
});

test("PAYUNi notify marks linked requirement as paid only after successful claim", () => {
  const claimIdx = storePayment.indexOf("WHERE id = ? AND status = 'pending'");
  const requirementPaidIdx = storePayment.indexOf("UPDATE requirement_forms SET status = 'paid'");
  assert.ok(claimIdx > -1, "store payment claim guard missing");
  assert.ok(requirementPaidIdx > claimIdx, "requirement paid update must happen after payment claim");
  assert.ok(storePayment.includes("AND status = 'pending'"));
});

test("admin orders include payment status and render paid badge", () => {
  assert.ok(adminRequirements.includes("AS payment_status"));
  assert.ok(adminRequirements.includes("paymentStatus"));
  assert.ok(adminOrders.includes("paymentBadgeHtml(form.paymentStatus)"));
  assert.ok(adminOrders.includes("已付款"));
});

test("pay result page renders payment completion when status is paid", () => {
  assert.ok(payResult.includes('if (status === "paid")'));
  assert.ok(payResult.includes("<h1>付款完成</h1>"));
});
