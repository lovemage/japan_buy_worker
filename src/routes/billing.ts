import type { D1DatabaseLike } from "../types/d1";
import { DEFAULT_PLAN_OFFERS, getPlanOfferByMonths } from "../shared/plan-offers.js";
import {
  PAYABLE_PLANS,
  PLAN_LABELS,
  makeMerTradeNo,
  decideNotifyAction,
  computeActivation,
} from "../shared/billing-logic.js";
import { buildUppRequest, verifyAndDecrypt } from "../shared/payuni.js";
import { parseCookieHeader, STORE_COOKIE_NAME } from "./admin/auth";
import { ensureLogTable, getTestStoreIds } from "./platform-admin";

export type BillingEnv = {
  DB: D1DatabaseLike;
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
    .prepare("SELECT id, plan, plan_expires_at, owner_email FROM stores WHERE id = ? AND is_active = 1")
    .bind(session.store_id)
    .first<SessionStore>();
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

  const merTradeNo = makeMerTradeNo(store.id);
  await env.DB
    .prepare(
      "INSERT INTO payment_orders (store_id, mer_trade_no, plan, months, days, amount) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(store.id, merTradeNo, plan, offer.months, offer.days, offer.amount)
    .run();

  const usrMail =
    store.owner_email && !store.owner_email.endsWith("@placeholder.local")
      ? store.owner_email
      : "";
  const upp = await buildUppRequest(cfg, {
    merTradeNo,
    tradeAmt: offer.amount,
    timestamp: Math.floor(Date.now() / 1000),
    prodDesc: `我拍開店平台 ${PLAN_LABELS[plan as keyof typeof PLAN_LABELS]} 方案 ${offer.months} 個月`,
    usrMail,
    returnUrl: `${env.APP_URL}/api/billing/return`,
    notifyUrl: `${env.APP_URL}/api/billing/notify`,
  });

  return json({ ok: true, merTradeNo, action: upp.action, fields: upp.fields });
}

async function applyActivation(db: D1DatabaseLike, order: OrderRow, data: Record<string, string>) {
  const storeRow = await db
    .prepare("SELECT plan, plan_expires_at FROM stores WHERE id = ?")
    .bind(order.store_id)
    .first<{ plan: string; plan_expires_at: string | null }>();
  const activation = computeActivation({
    currentPlan: storeRow?.plan || "free",
    currentExpiresAt: storeRow?.plan_expires_at || null,
    orderPlan: order.plan,
    days: order.days,
    now: new Date(),
  });
  await db
    .prepare(
      "UPDATE stores SET plan = ?, plan_expires_at = ?, plan_paid_amount = ?, plan_started_at = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .bind(activation.plan, activation.expiresAt, order.amount, new Date().toISOString(), order.store_id)
    .run();
  await db
    .prepare(
      "UPDATE payment_orders SET status = 'paid', paid_at = datetime('now'), pay_type = ?, payuni_trade_no = ?, raw_notify = ? WHERE id = ? AND status != 'paid'"
    )
    .bind(data.PaymentType || null, data.TradeNo || null, JSON.stringify(data), order.id)
    .run();

  // 與 platform-admin 人工開通一致：記錄營收（排除測試店）
  const testIds = await getTestStoreIds(db);
  if (!testIds.includes(order.store_id)) {
    await ensureLogTable(db);
    const s = await db
      .prepare("SELECT name, owner_email FROM stores WHERE id = ?")
      .bind(order.store_id)
      .first<{ name: string; owner_email: string }>();
    await db
      .prepare(
        "INSERT INTO plan_change_logs (store_id, store_name, store_email, plan, days, amount) VALUES (?, ?, ?, ?, ?, ?)"
      )
      .bind(order.store_id, s?.name || "", s?.owner_email || "", order.plan, order.days, order.amount)
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
    tradeStatus: data.TradeStatus,
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
    await applyActivation(env.DB, order, data);
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
    const status = String(data.TradeStatus) === "1" ? "paid" : "pending";
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
