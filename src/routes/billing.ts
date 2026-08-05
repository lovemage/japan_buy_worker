import type { D1DatabaseLike } from "../types/d1";
import { DEFAULT_PLAN_OFFERS, getPlanOfferByMonths, getPlanOffers } from "../shared/plan-offers.js";
import {
  PAYABLE_PLANS,
  PLAN_LABELS,
  makeMerTradeNo,
  decideNotifyAction,
  computeActivation,
  computeUpgradeQuote,
  getPayuniTradeStatus,
  isUpgrade,
} from "../shared/billing-logic.js";
import { buildUppRequest, verifyAndDecrypt } from "../shared/payuni.js";
import { parseCookieHeader, STORE_COOKIE_NAME } from "./admin/auth";
import { ensureLogTable, getTestStoreIds } from "./platform-admin";
import { sendPlanActivatedEmail } from "../services/email-notifications";

export type BillingEnv = {
  DB: D1DatabaseLike;
  EMAIL?: {
    send: (message: {
      to: string | string[];
      from: { email: string; name?: string };
      subject: string;
      html: string;
      text: string;
    }) => Promise<unknown>;
  };
  APP_URL: string;
  PAYUNI_MER_ID?: string;
  PAYUNI_HASH_KEY?: string;
  PAYUNI_HASH_IV?: string;
  PAYUNI_SANDBOX?: string; // "1" = sandbox
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function payuniConfig(env: BillingEnv) {
  if (!env.PAYUNI_MER_ID || !env.PAYUNI_HASH_KEY || !env.PAYUNI_HASH_IV) return null;
  return {
    merId: env.PAYUNI_MER_ID,
    hashKey: env.PAYUNI_HASH_KEY,
    hashIv: env.PAYUNI_HASH_IV,
    sandbox: env.PAYUNI_SANDBOX === "1",
  };
}

type SessionStore = {
  id: number;
  plan: string;
  plan_expires_at: string | null;
  owner_email: string | null;
  plan_paid_amount: number | null;
  plan_paid_days: number | null;
  plan_bonus_days: number | null;
  needs_billing_review: number | null;
};

async function getSessionStore(request: Request, db: D1DatabaseLike): Promise<SessionStore | null> {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const token = cookies[STORE_COOKIE_NAME];
  if (!token) return null;
  const session = await db
    .prepare("SELECT store_id FROM store_sessions WHERE token = ? AND expires_at > datetime('now')")
    .bind(token)
    .first<{ store_id: number }>();
  if (!session) return null;
  return db
    .prepare(
      `SELECT id, plan, plan_expires_at, owner_email,
       plan_paid_amount, plan_paid_days, plan_bonus_days, needs_billing_review
       FROM stores WHERE id = ? AND is_active = 1`
    )
    .bind(session.store_id)
    .first<SessionStore>();
}

/** Plan the store actually gets today — a lapsed paid plan reads as free. */
function effectivePlanOf(store: { plan: string; plan_expires_at: string | null }): string {
  if (!PAYABLE_PLANS.includes(store.plan)) return "free";
  if (!store.plan_expires_at) return store.plan;
  return new Date(store.plan_expires_at).getTime() > Date.now() ? store.plan : "free";
}

type OrderRow = {
  id: number;
  store_id: number;
  mer_trade_no: string;
  plan: string;
  months: number;
  days: number;
  amount: number;
  status: string;
  atm_bank_code: string | null;
  atm_account: string | null;
  atm_expire_at: string | null;
  paid_at: string | null;
  is_upgrade: number | null;
  list_amount: number | null;
  credit_applied: number | null;
  credit_basis_added: number | null;
  extra_paid_days: number | null;
  source_snapshot_json: string | null;
};

// POST /api/billing/checkout  body: { plan, months }
export async function handleBillingCheckout(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);
  const cfg = payuniConfig(env);
  if (!cfg) return json({ ok: false, error: "金流尚未設定" }, 503);

  const store = await getSessionStore(request, env.DB);
  if (!store) return json({ ok: false, error: "請先登入" }, 401);

  let body: { plan?: string; months?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const plan = String(body.plan || "");
  const months = Number(body.months);
  if (!PAYABLE_PLANS.includes(plan)) return json({ ok: false, error: "無效的方案" }, 400);
  const offer = getPlanOfferByMonths(plan, months, DEFAULT_PLAN_OFFERS);
  if (!offer) return json({ ok: false, error: "無效的方案期數" }, 400);

  // Upgrading from a live paid plan credits the unused value of the current one
  // (migration 0023's credit-basis model). Renewals, downgrades and buying from
  // free keep paying list price.
  const currentPlan = effectivePlanOf(store);
  const upgrading = PAYABLE_PLANS.includes(currentPlan) && isUpgrade(currentPlan, plan);

  let quote: ReturnType<typeof computeUpgradeQuote> | null = null;
  if (upgrading) {
    if (store.needs_billing_review) {
      return json({ ok: false, error: "CONTACT_SUPPORT", needsBillingReview: true }, 409);
    }
    quote = computeUpgradeQuote({
      current: {
        plan: currentPlan,
        paidAmount: store.plan_paid_amount || 0,
        paidDays: store.plan_paid_days || 0,
        bonusDays: store.plan_bonus_days || 0,
        expiresAt: store.plan_expires_at,
      },
      newOffer: offer,
      now: new Date(),
    });
    // Corrupt or unreconstructable basis → never quote a price, send to support.
    if (!quote.valid) {
      return json({ ok: false, error: "CONTACT_SUPPORT", needsBillingReview: true }, 409);
    }
  }

  const gatewayAmount = quote ? quote.difference : offer.amount;
  const offerPaidDays = offer.days - (offer.bonusDays || 0);
  const merTradeNo = makeMerTradeNo(store.id);

  try {
    await env.DB
      .prepare(
        `INSERT INTO payment_orders
         (store_id, mer_trade_no, plan, months, days, amount,
          is_upgrade, list_amount, gateway_amount, credit_applied, credit_basis_added,
          extra_paid_days, source_snapshot_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        store.id,
        merTradeNo,
        plan,
        offer.months,
        offer.days,
        gatewayAmount,
        upgrading ? 1 : 0,
        offer.amount,
        gatewayAmount,
        quote ? quote.creditableValue : null,
        quote ? quote.creditableValue + quote.difference : offer.amount,
        quote ? quote.extraPaidDays : 0,
        JSON.stringify({
          currentPlan,
          paidAmount: store.plan_paid_amount || 0,
          paidDays: store.plan_paid_days || 0,
          bonusDays: store.plan_bonus_days || 0,
          expiresAt: store.plan_expires_at,
          offerPaidDays,
          offerBonusDays: offer.bonusDays || 0,
          quotedAt: new Date().toISOString(),
        })
      )
      .run();
  } catch (e) {
    // idx_one_pending_upgrade: one unpaid upgrade order per store at a time.
    console.error("checkout INSERT failed:", e);
    if (upgrading) {
      return json(
        { ok: false, error: "您有一筆升級訂單尚未完成付款，請先完成或等待該筆訂單失效後再試" },
        409
      );
    }
    return json({ ok: false, error: "建立訂單失敗，請稍後再試" }, 500);
  }

  // Credit covers the whole upgrade — nothing to charge, so skip the gateway
  // entirely (PAYUNi cannot take a zero-amount order) and activate right away.
  if (gatewayAmount <= 0) {
    const order = await env.DB
      .prepare("SELECT * FROM payment_orders WHERE mer_trade_no = ?")
      .bind(merTradeNo)
      .first<OrderRow>();
    if (order) await applyActivation(env, order, { PaymentType: "credit" });
    return json({ ok: true, merTradeNo, activated: true });
  }

  const usrMail =
    store.owner_email && !store.owner_email.endsWith("@placeholder.local")
      ? store.owner_email
      : "";
  const upp = await buildUppRequest(cfg, {
    merTradeNo,
    // Must match payment_orders.amount — decideNotifyAction rejects mismatches.
    tradeAmt: gatewayAmount,
    timestamp: Math.floor(Date.now() / 1000),
    prodDesc: `我拍開店平台 ${PLAN_LABELS[plan as keyof typeof PLAN_LABELS]} 方案 ${offer.months} 個月${
      upgrading ? "（升級折抵後）" : ""
    }`,
    usrMail,
    returnUrl: `${env.APP_URL}/api/billing/return`,
    notifyUrl: `${env.APP_URL}/api/billing/notify`,
  });

  return json({ ok: true, merTradeNo, action: upp.action, fields: upp.fields });
}

/**
 * GET /api/billing/upgrade-quotes — what each plan/term actually costs this
 * store right now, so the admin plan modal can show the credited price before
 * the owner commits. Read-only; checkout recomputes and is the source of truth.
 */
export async function handleBillingUpgradeQuotes(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== "GET") return json({ ok: false, error: "Method Not Allowed" }, 405);
  const store = await getSessionStore(request, env.DB);
  if (!store) return json({ ok: false, error: "請先登入" }, 401);

  const currentPlan = effectivePlanOf(store);
  const now = new Date();
  const current = {
    plan: currentPlan,
    paidAmount: store.plan_paid_amount || 0,
    paidDays: store.plan_paid_days || 0,
    bonusDays: store.plan_bonus_days || 0,
    expiresAt: store.plan_expires_at,
  };

  const quotes: Record<string, unknown> = {};
  for (const plan of PAYABLE_PLANS) {
    for (const offer of getPlanOffers(plan, DEFAULT_PLAN_OFFERS)) {
      const key = `${plan}:${offer.months}`;
      const upgrading = PAYABLE_PLANS.includes(currentPlan) && isUpgrade(currentPlan, plan);
      if (!upgrading) {
        quotes[key] = { upgrading: false, payable: offer.amount, listAmount: offer.amount };
        continue;
      }
      if (store.needs_billing_review) {
        quotes[key] = { upgrading: true, needsBillingReview: true, listAmount: offer.amount };
        continue;
      }
      const quote = computeUpgradeQuote({ current, newOffer: offer, now });
      quotes[key] = quote.valid
        ? {
            upgrading: true,
            payable: quote.difference,
            listAmount: quote.listAmount,
            credit: quote.creditableValue,
            extraPaidDays: quote.extraPaidDays,
          }
        : { upgrading: true, needsBillingReview: true, listAmount: offer.amount };
    }
  }

  return json({ ok: true, currentPlan, quotes });
}

function parseOrderSnapshot(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function applyActivation(env: BillingEnv, order: OrderRow, data: Record<string, string>) {
  const db = env.DB;
  // Claim the order first so that two concurrent PAYUNi notifies for the same
  // order cannot both proceed to extend the plan (double-extension).  Only the
  // notify that atomically flips status → 'paid' continues; the other returns
  // here.  Accepted crash window: if this process dies after the claim but
  // before the UPDATE stores below, the order is marked paid but the plan is
  // not yet extended — preferable to double-extension; a platform-admin can
  // remedy manually.
  const claim = await db
    .prepare(
      "UPDATE payment_orders SET status = 'paid', paid_at = datetime('now'), pay_type = ?, payuni_trade_no = ?, raw_notify = ? WHERE id = ? AND status != 'paid'"
    )
    .bind(data.PaymentType || null, data.TradeNo || null, JSON.stringify(data), order.id)
    .run();
  if (!claim?.meta || claim.meta.changes !== 1) return; // 另一個 notify 已搶先開通

  // Merge both stores SELECTs into one to reduce round-trips.
  const storeRow = await db
    .prepare(
      `SELECT plan, plan_expires_at, plan_paid_amount, plan_paid_days, plan_bonus_days,
       name, slug, owner_email FROM stores WHERE id = ?`
    )
    .bind(order.store_id)
    .first<{
      plan: string;
      plan_expires_at: string | null;
      plan_paid_amount: number | null;
      plan_paid_days: number | null;
      plan_bonus_days: number | null;
      name: string;
      slug: string;
      owner_email: string;
    }>();

  const snapshot = parseOrderSnapshot(order.source_snapshot_json);
  const offerBonusDays = snapshot ? Number(snapshot.offerBonusDays) || 0 : 0;
  const offerPaidDays = snapshot
    ? Number(snapshot.offerPaidDays) || Math.max(0, order.days - offerBonusDays)
    : Math.max(0, order.days - offerBonusDays);
  const nowIso = new Date().toISOString();

  let activatedPlan: string;
  let activatedExpiresAt: string;

  if (order.is_upgrade) {
    // Credit was locked in at checkout — the customer already paid the quoted
    // difference, so reuse it rather than recomputing against a now-shorter
    // remainder. The new term still runs from the actual payment date.
    const extraPaidDays = Number(order.extra_paid_days) || 0;
    activatedPlan = order.plan;
    activatedExpiresAt = new Date(
      Date.now() + (order.days + extraPaidDays) * 86400000
    ).toISOString();
    await db
      .prepare(
        `UPDATE stores SET plan = ?, plan_expires_at = ?, plan_paid_amount = ?,
         plan_paid_days = ?, plan_bonus_days = ?, plan_started_at = ?,
         updated_at = datetime('now') WHERE id = ?`
      )
      .bind(
        activatedPlan,
        activatedExpiresAt,
        order.credit_basis_added ?? order.amount,
        offerPaidDays + extraPaidDays,
        offerBonusDays,
        nowIso,
        order.store_id
      )
      .run();
  } else {
    const activation = computeActivation({
      currentPlan: storeRow?.plan || "free",
      current: { expiresAt: storeRow?.plan_expires_at || null },
      orderPlan: order.plan,
      offer: { days: order.days, bonusDays: offerBonusDays, amount: order.amount },
      isUpgrade: false,
      now: new Date(),
    });
    activatedPlan = activation.plan;
    activatedExpiresAt = activation.expiresAt;
    // startedAt === null means this renewal stacks onto a live term, so the
    // credit basis accumulates. A fresh term (lapsed or new plan) resets it,
    // otherwise a long-dead plan's basis would inflate future upgrade credit.
    const stacking = activation.startedAt === null;
    await db
      .prepare(
        stacking
          ? `UPDATE stores SET plan = ?, plan_expires_at = ?,
             plan_paid_amount = COALESCE(plan_paid_amount, 0) + ?,
             plan_paid_days = COALESCE(plan_paid_days, 0) + ?,
             plan_bonus_days = COALESCE(plan_bonus_days, 0) + ?,
             updated_at = datetime('now') WHERE id = ?`
          : `UPDATE stores SET plan = ?, plan_expires_at = ?,
             plan_paid_amount = ?, plan_paid_days = ?, plan_bonus_days = ?,
             plan_started_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
      )
      .bind(
        activatedPlan,
        activatedExpiresAt,
        activation.paidAmount,
        activation.paidDays,
        activation.bonusDays,
        order.store_id
      )
      .run();
  }

  await sendPlanActivatedEmail(env, {
    storeId: order.store_id,
    storeName: storeRow?.name || "",
    storeSlug: storeRow?.slug || "default",
    ownerEmail: storeRow?.owner_email || null,
    plan: activatedPlan,
    expiresAt: activatedExpiresAt,
    merTradeNo: order.mer_trade_no,
  }).catch((error) => {
    console.error("Failed to send plan activation email:", error);
  });

  // 與 platform-admin 人工開通一致：記錄營收（排除測試店）
  const testIds = await getTestStoreIds(db);
  if (!testIds.includes(order.store_id)) {
    await ensureLogTable(db);
    await db
      .prepare(
        "INSERT INTO plan_change_logs (store_id, store_name, store_email, plan, days, amount) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(order.store_id, storeRow?.name || "", storeRow?.owner_email || "", order.plan, order.days, order.amount)
      .run();
  }
}

async function parseNotifyForm(request: Request): Promise<Record<string, string>> {
  const form = await request.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = String(v);
  return out;
}

// POST /api/billing/notify — PAYUNi 伺服器背景通知
export async function handleBillingNotify(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const cfg = payuniConfig(env);
  if (!cfg) return new Response("not configured", { status: 503 });

  let data: Record<string, string>;
  try {
    data = await verifyAndDecrypt(await parseNotifyForm(request), cfg.hashKey, cfg.hashIv);
  } catch {
    return new Response("verify failed", { status: 400 });
  }

  const order = await env.DB
    .prepare("SELECT * FROM payment_orders WHERE mer_trade_no = ?")
    .bind(data.MerTradeNo || "")
    .first<OrderRow>();
  if (!order) return new Response("order not found", { status: 404 });

  const action = decideNotifyAction({
    orderStatus: order.status,
    orderAmount: order.amount,
    tradeStatus: getPayuniTradeStatus(data),
    tradeAmt: data.TradeAmt,
  });

  if (action === "already-paid") return new Response("OK");
  if (action === "amount-mismatch") {
    await env.DB
      .prepare("UPDATE payment_orders SET status = 'failed', raw_notify = ? WHERE id = ?")
      .bind(JSON.stringify(data), order.id)
      .run();
    return new Response("OK");
  }
  if (action === "activate") {
    await applyActivation(env, order, data);
    return new Response("OK");
  }
  // pending：ATM 取號等，回填帳號資訊（欄位名稱防禦性讀取）
  await env.DB
    .prepare(
      "UPDATE payment_orders SET pay_type = ?, payuni_trade_no = ?, atm_bank_code = ?, atm_account = ?, atm_expire_at = ?, raw_notify = ? WHERE id = ?"
    )
    .bind(
      data.PaymentType || null,
      data.TradeNo || null,
      data.BankType || data.Bank || null,
      data.PayNo || data.Account || null,
      data.ExpireDate || null,
      JSON.stringify(data),
      order.id
    )
    .run();
  return new Response("OK");
}

// POST /api/billing/return — 瀏覽器從 PAYUNi 跳回
export async function handleBillingReturn(request: Request, env: BillingEnv): Promise<Response> {
  const cfg = payuniConfig(env);
  const redirect = (qs: string) =>
    new Response(null, { status: 302, headers: { location: `/billing-result.html?${qs}` } });
  if (!cfg) return redirect("status=error");
  try {
    const data = await verifyAndDecrypt(await parseNotifyForm(request), cfg.hashKey, cfg.hashIv);
    const order = encodeURIComponent(data.MerTradeNo || "");
    const status = String(getPayuniTradeStatus(data)) === "1" ? "paid" : "pending";
    return redirect(`order=${order}&status=${status}`);
  } catch {
    return redirect("status=error");
  }
}

// GET /api/billing/order-status?order={merTradeNo} — 結果頁輪詢（限本店訂單）
export async function handleBillingOrderStatus(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== "GET") return json({ ok: false, error: "Method Not Allowed" }, 405);
  const store = await getSessionStore(request, env.DB);
  if (!store) return json({ ok: false, error: "請先登入" }, 401);
  const merTradeNo = new URL(request.url).searchParams.get("order") || "";
  const order = await env.DB
    .prepare("SELECT * FROM payment_orders WHERE mer_trade_no = ? AND store_id = ?")
    .bind(merTradeNo, store.id)
    .first<OrderRow>();
  if (!order) return json({ ok: false, error: "找不到訂單" }, 404);
  return json({
    ok: true,
    order: {
      merTradeNo: order.mer_trade_no,
      plan: order.plan,
      months: order.months,
      amount: order.amount,
      status: order.status,
      paidAt: order.paid_at,
      atm:
        order.atm_account
          ? { bankCode: order.atm_bank_code, account: order.atm_account, expireAt: order.atm_expire_at }
          : null,
    },
  });
}

// GET /api/billing/orders — 本店訂單列表
export async function handleBillingOrders(request: Request, env: BillingEnv): Promise<Response> {
  if (request.method !== "GET") return json({ ok: false, error: "Method Not Allowed" }, 405);
  const store = await getSessionStore(request, env.DB);
  if (!store) return json({ ok: false, error: "請先登入" }, 401);
  const rows = await env.DB
    .prepare(
      "SELECT mer_trade_no, plan, months, amount, status, created_at, paid_at FROM payment_orders WHERE store_id = ? ORDER BY id DESC LIMIT 50"
    )
    .bind(store.id)
    .all<Record<string, unknown>>();
  return json({ ok: true, orders: rows?.results || [] });
}
