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

// ── 升級折抵（線上自助）──

test("upgrade quotes route is mounted", () => {
  assert.ok(index.includes('"/api/billing/upgrade-quotes"'), "index.ts must route upgrade-quotes");
  assert.ok(billing.includes("handleBillingUpgradeQuotes"));
});

test("gateway is charged the credited amount, never the list price", () => {
  const uppIdx = billing.indexOf("buildUppRequest(cfg, {");
  assert.ok(uppIdx !== -1, "buildUppRequest call not found");
  const uppBlock = billing.slice(uppIdx, billing.indexOf("});", uppIdx));
  assert.ok(uppBlock.includes("tradeAmt: gatewayAmount"), "must send the credited amount");
  assert.ok(!uppBlock.includes("tradeAmt: offer.amount"), "must not send list price to the gateway");
});

test("order amount matches what the gateway is asked to charge", () => {
  // decideNotifyAction rejects any mismatch, so these two must be the same value.
  assert.ok(billing.includes("const gatewayAmount = quote ? quote.difference : offer.amount"));
  assert.ok(billing.includes("tradeAmt: gatewayAmount"));
});

test("only a live paid plan earns upgrade credit", () => {
  assert.ok(
    billing.includes("PAYABLE_PLANS.includes(currentPlan) && isUpgrade(currentPlan, plan)"),
    "upgrade must require a payable current plan and a genuine rank increase"
  );
  assert.ok(billing.includes("function effectivePlanOf"), "lapsed plans must read as free");
});

test("unreconstructable billing basis is sent to support instead of being quoted", () => {
  assert.ok(billing.includes("store.needs_billing_review"));
  assert.ok(billing.includes('error: "CONTACT_SUPPORT"'));
  assert.ok(billing.includes("if (!quote.valid)"), "invalid quotes must never reach checkout");
});

test("a fully credited upgrade skips the gateway and activates directly", () => {
  assert.ok(billing.includes("if (gatewayAmount <= 0)"), "zero-charge upgrades must bypass PAYUNi");
  assert.ok(billing.includes("activated: true"));
});

test("activation reuses the credit locked in at checkout rather than recomputing", () => {
  const applyIdx = billing.indexOf("async function applyActivation");
  const applyBlock = billing.slice(applyIdx);
  assert.ok(applyBlock.includes("if (order.is_upgrade)"), "upgrade orders need their own activation path");
  assert.ok(
    !/computeUpgradeQuote\(/.test(applyBlock),
    "activation must not re-quote — the customer already paid the checkout-time difference"
  );
  assert.ok(applyBlock.includes("order.credit_basis_added"));
});

test("stacked renewals accumulate the credit basis, fresh terms reset it", () => {
  const applyBlock = billing.slice(billing.indexOf("async function applyActivation"));
  assert.ok(applyBlock.includes("activation.startedAt === null"), "stacking is decided by startedAt");
  assert.ok(applyBlock.includes("COALESCE(plan_paid_amount, 0) + ?"), "stacking must accumulate basis");
  assert.ok(applyBlock.includes("plan_paid_days = COALESCE(plan_paid_days, 0) + ?"));
});

test("checkout records the audit snapshot the activation path depends on", () => {
  assert.ok(billing.includes("source_snapshot_json"));
  assert.ok(billing.includes("credit_applied"));
  assert.ok(billing.includes("extra_paid_days"));
  assert.ok(billing.includes("parseOrderSnapshot"), "activation must read the snapshot back");
});
