import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const billing = readFileSync(new URL("../src/routes/billing.ts", import.meta.url), "utf8");
const index = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const emailNotifications = readFileSync(new URL("../src/services/email-notifications.ts", import.meta.url), "utf8");

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

test("applyActivation claims the order before extending the store plan (prevents double-notify race)", () => {
  const claimIdx = billing.indexOf("WHERE id = ? AND status != 'paid'");
  const extendIdx = billing.indexOf("UPDATE stores SET plan");
  assert.ok(claimIdx !== -1, "guarded claim string not found in billing.ts");
  assert.ok(extendIdx !== -1, "UPDATE stores SET plan not found in billing.ts");
  assert.ok(
    claimIdx < extendIdx,
    `claim (index ${claimIdx}) must precede store plan extension (index ${extendIdx})`
  );
});

test("handleBillingOrders scopes queries to the session store", () => {
  assert.ok(billing.includes("WHERE store_id = ?"), "handleBillingOrders must scope by WHERE store_id = ?");
});

test("paid plan activation sends a transactional membership email", () => {
  assert.ok(billing.includes("sendPlanActivatedEmail"), "billing activation should call email notification service");
  assert.ok(emailNotifications.includes('eventType = "plan_activated"'));
  assert.ok(emailNotifications.includes("我拍會員方案已升級為"));
});

test("expired paid plans are downgraded and renewal emails run from a scheduled job", () => {
  assert.ok(wrangler.includes('send_email = [{ name = "EMAIL" }]'), "wrangler must define EMAIL binding");
  assert.ok(wrangler.includes("crons = ["), "wrangler must define a scheduled trigger");
  assert.ok(index.includes("runPlanExpiryNotifications"), "scheduled handler must run expiry notification job");
  assert.ok(emailNotifications.includes('eventType = "plan_expired"'));
  assert.ok(emailNotifications.includes('eventType = "plan_expiring_soon"'));
  assert.ok(emailNotifications.includes("3 日內到期"));
  assert.ok(emailNotifications.includes("SET plan = 'free'"));
  assert.ok(emailNotifications.includes("我拍會員資格已到期"));
});

test("PAYUNi return and notify use a centralized trade-status resolver", () => {
  assert.ok(billing.includes("getPayuniTradeStatus(data)"));
  assert.ok(!billing.includes("data.TradeStatus"), "billing route should not read TradeStatus directly");
});

test("scheduled plan notification job catches top-level failures", () => {
  const scheduledIdx = index.indexOf("async scheduled");
  assert.ok(scheduledIdx !== -1, "scheduled handler must exist");
  const scheduledBlock = index.slice(scheduledIdx, index.indexOf("async fetch", scheduledIdx));
  assert.ok(scheduledBlock.includes("try {"));
  assert.ok(scheduledBlock.includes("catch (error)"));
  assert.ok(scheduledBlock.includes("console.error(\"Plan expiry notification job failed:\""));
});
