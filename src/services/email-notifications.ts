import type { D1DatabaseLike } from "../types/d1";
import { PLAN_LABELS } from "../shared/billing-logic.js";

type EmailBinding = {
  send: (message: {
    to: string | string[];
    from: { email: string; name?: string };
    subject: string;
    html: string;
    text: string;
  }) => Promise<unknown>;
};

export type EmailNotificationEnv = {
  DB: D1DatabaseLike;
  EMAIL?: EmailBinding;
  APP_URL: string;
};

type PlanKey = keyof typeof PLAN_LABELS;

const FROM = { email: "notify@vovosnap.com", name: "我拍開店平台" };

function isRealEmail(email: string | null | undefined): email is string {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.endsWith("@placeholder.local"));
}

function planLabel(plan: string): string {
  return PLAN_LABELS[plan as PlanKey] || plan;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "未設定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function adminUrl(appUrl: string, slug: string): string {
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/s/${encodeURIComponent(slug)}/admin.html`;
}

async function reserveNotification(
  db: D1DatabaseLike,
  input: { storeId: number; eventType: string; dedupeKey: string; recipientEmail: string }
): Promise<boolean> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO email_notification_logs
        (store_id, event_type, dedupe_key, recipient_email, status)
       VALUES (?, ?, ?, ?, 'pending')`
    )
    .bind(input.storeId, input.eventType, input.dedupeKey, input.recipientEmail)
    .run();

  const row = await db
    .prepare("SELECT status FROM email_notification_logs WHERE event_type = ? AND dedupe_key = ?")
    .bind(input.eventType, input.dedupeKey)
    .first<{ status: string }>();
  return row?.status !== "sent";
}

async function markNotificationSent(db: D1DatabaseLike, eventType: string, dedupeKey: string) {
  await db
    .prepare(
      `UPDATE email_notification_logs
       SET status = 'sent', error = NULL, sent_at = datetime('now'), updated_at = datetime('now')
       WHERE event_type = ? AND dedupe_key = ?`
    )
    .bind(eventType, dedupeKey)
    .run();
}

async function markNotificationFailed(db: D1DatabaseLike, eventType: string, dedupeKey: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "unknown error");
  await db
    .prepare(
      `UPDATE email_notification_logs
       SET status = 'failed', error = ?, updated_at = datetime('now')
       WHERE event_type = ? AND dedupe_key = ?`
    )
    .bind(message.slice(0, 500), eventType, dedupeKey)
    .run();
}

async function sendEmail(env: EmailNotificationEnv, message: { to: string; subject: string; html: string; text: string }) {
  if (!env.EMAIL) throw new Error("EMAIL binding is not configured");
  await env.EMAIL.send({
    to: message.to,
    from: FROM,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}

export async function sendPlanActivatedEmail(
  env: EmailNotificationEnv,
  input: {
    storeId: number;
    storeName: string;
    storeSlug: string;
    ownerEmail: string | null;
    plan: string;
    expiresAt: string;
    merTradeNo: string;
  }
): Promise<boolean> {
  if (!isRealEmail(input.ownerEmail)) return false;

  const eventType = "plan_activated";
  const dedupeKey = input.merTradeNo;
  const shouldSend = await reserveNotification(env.DB, {
    storeId: input.storeId,
    eventType,
    dedupeKey,
    recipientEmail: input.ownerEmail,
  });
  if (!shouldSend) return false;

  const label = planLabel(input.plan);
  const expiresText = formatDate(input.expiresAt);
  const link = adminUrl(env.APP_URL, input.storeSlug);
  const storeName = input.storeName || "你的商店";
  const safeName = escapeHtml(storeName);

  try {
    await sendEmail(env, {
      to: input.ownerEmail,
      subject: `我拍會員方案已升級為 ${label}`,
      text: [
        `${storeName} 你好，`,
        "",
        `你的我拍會員方案已成功升級為 ${label}。`,
        `目前會員有效期限：${expiresText}`,
        "",
        `前往會員後台：${link}`,
      ].join("\n"),
      html: `
        <p>${safeName} 你好，</p>
        <p>你的我拍會員方案已成功升級為 <strong>${escapeHtml(label)}</strong>。</p>
        <p>目前會員有效期限：<strong>${escapeHtml(expiresText)}</strong></p>
        <p><a href="${escapeHtml(link)}">前往會員後台</a></p>
      `,
    });
    await markNotificationSent(env.DB, eventType, dedupeKey);
    return true;
  } catch (error) {
    await markNotificationFailed(env.DB, eventType, dedupeKey, error);
    throw error;
  }
}

export async function sendPlanExpiredEmail(
  env: EmailNotificationEnv,
  input: {
    storeId: number;
    storeName: string;
    storeSlug: string;
    ownerEmail: string | null;
    expiredPlan: string;
    expiredAt: string;
  }
): Promise<boolean> {
  if (!isRealEmail(input.ownerEmail)) return false;

  const eventType = "plan_expired";
  const dedupeKey = `${input.storeId}:${input.expiredPlan}:${input.expiredAt}`;
  const shouldSend = await reserveNotification(env.DB, {
    storeId: input.storeId,
    eventType,
    dedupeKey,
    recipientEmail: input.ownerEmail,
  });
  if (!shouldSend) return false;

  const label = planLabel(input.expiredPlan);
  const expiredText = formatDate(input.expiredAt);
  const link = adminUrl(env.APP_URL, input.storeSlug);
  const storeName = input.storeName || "你的商店";
  const safeName = escapeHtml(storeName);

  try {
    await sendEmail(env, {
      to: input.ownerEmail,
      subject: "我拍會員資格已到期，請續約以恢復方案功能",
      text: [
        `${storeName} 你好，`,
        "",
        `你的 ${label} 會員資格已於 ${expiredText} 到期，目前已切換為 Free 方案。`,
        "若商品數量超過 Free 方案上限，前台只會顯示目前方案允許的商品數量。",
        "",
        `前往續約：${link}`,
      ].join("\n"),
      html: `
        <p>${safeName} 你好，</p>
        <p>你的 <strong>${escapeHtml(label)}</strong> 會員資格已於 <strong>${escapeHtml(expiredText)}</strong> 到期，目前已切換為 Free 方案。</p>
        <p>若商品數量超過 Free 方案上限，前台只會顯示目前方案允許的商品數量。</p>
        <p><a href="${escapeHtml(link)}">前往續約</a></p>
      `,
    });
    await markNotificationSent(env.DB, eventType, dedupeKey);
    return true;
  } catch (error) {
    await markNotificationFailed(env.DB, eventType, dedupeKey, error);
    throw error;
  }
}

export async function sendPlanExpiringSoonEmail(
  env: EmailNotificationEnv,
  input: {
    storeId: number;
    storeName: string;
    storeSlug: string;
    ownerEmail: string | null;
    plan: string;
    expiresAt: string;
  }
): Promise<boolean> {
  if (!isRealEmail(input.ownerEmail)) return false;

  const eventType = "plan_expiring_soon";
  const dedupeKey = `${input.storeId}:${input.plan}:${input.expiresAt}:3d`;
  const shouldSend = await reserveNotification(env.DB, {
    storeId: input.storeId,
    eventType,
    dedupeKey,
    recipientEmail: input.ownerEmail,
  });
  if (!shouldSend) return false;

  const label = planLabel(input.plan);
  const expiresText = formatDate(input.expiresAt);
  const link = adminUrl(env.APP_URL, input.storeSlug);
  const storeName = input.storeName || "你的商店";
  const safeName = escapeHtml(storeName);

  try {
    await sendEmail(env, {
      to: input.ownerEmail,
      subject: `我拍 ${label} 會員資格將於 3 日內到期`,
      text: [
        `${storeName} 你好，`,
        "",
        `你的 ${label} 會員資格將於 ${expiresText} 到期。`,
        "為避免方案功能中斷，請在到期前完成續約。",
        "",
        `前往續約：${link}`,
      ].join("\n"),
      html: `
        <p>${safeName} 你好，</p>
        <p>你的 <strong>${escapeHtml(label)}</strong> 會員資格將於 <strong>${escapeHtml(expiresText)}</strong> 到期。</p>
        <p>為避免方案功能中斷，請在到期前完成續約。</p>
        <p><a href="${escapeHtml(link)}">前往續約</a></p>
      `,
    });
    await markNotificationSent(env.DB, eventType, dedupeKey);
    return true;
  } catch (error) {
    await markNotificationFailed(env.DB, eventType, dedupeKey, error);
    throw error;
  }
}

export async function runPlanExpiryNotifications(env: EmailNotificationEnv): Promise<{
  scanned: number;
  downgraded: number;
  sent: number;
  failed: number;
  expiringSoonScanned: number;
  expiringSoonSent: number;
  expiringSoonFailed: number;
  activationScanned: number;
  activationSent: number;
  activationFailed: number;
}> {
  const activationResult = await retryPlanActivatedEmails(env);
  const expiringSoonResult = await sendPlanExpiringSoonEmails(env);
  const rows = await env.DB
    .prepare(
      `SELECT id, slug, name, owner_email, plan, plan_expires_at
       FROM stores
       WHERE is_active = 1
         AND plan IN ('plus', 'pro', 'proplus')
         AND plan_expires_at IS NOT NULL
         AND datetime(plan_expires_at) <= datetime('now')`
    )
    .all<{
      id: number;
      slug: string;
      name: string;
      owner_email: string | null;
      plan: string;
      plan_expires_at: string;
    }>();

  const stores = Array.isArray(rows?.results) ? rows.results : [];
  let sent = 0;
  let failed = 0;
  let downgraded = 0;

  for (const store of stores) {
    let notificationDelivered = false;
    try {
      const didSend = await sendPlanExpiredEmail(env, {
        storeId: store.id,
        storeName: store.name,
        storeSlug: store.slug,
        ownerEmail: store.owner_email,
        expiredPlan: store.plan,
        expiredAt: store.plan_expires_at,
      });
      if (didSend) sent += 1;
      notificationDelivered = true;
    } catch (error) {
      failed += 1;
      console.error("Failed to send plan expiry email:", error);
    }

    if (!notificationDelivered) continue;

    const result = await env.DB
      .prepare(
        `UPDATE stores
         SET plan = 'free',
             plan_expires_at = NULL,
             updated_at = datetime('now')
         WHERE id = ? AND plan = ?`
      )
      .bind(store.id, store.plan)
      .run();
    if (result?.meta?.changes) downgraded += Number(result.meta.changes);
  }

  return {
    scanned: stores.length,
    downgraded,
    sent,
    failed,
    expiringSoonScanned: expiringSoonResult.scanned,
    expiringSoonSent: expiringSoonResult.sent,
    expiringSoonFailed: expiringSoonResult.failed,
    activationScanned: activationResult.scanned,
    activationSent: activationResult.sent,
    activationFailed: activationResult.failed,
  };
}

export async function sendPlanExpiringSoonEmails(env: EmailNotificationEnv): Promise<{
  scanned: number;
  sent: number;
  failed: number;
}> {
  const rows = await env.DB
    .prepare(
      `SELECT id, slug, name, owner_email, plan, plan_expires_at
       FROM stores
       WHERE is_active = 1
         AND plan IN ('plus', 'pro', 'proplus')
         AND plan_expires_at IS NOT NULL
         AND datetime(plan_expires_at) > datetime('now')
         AND datetime(plan_expires_at) <= datetime('now', '+3 days')`
    )
    .all<{
      id: number;
      slug: string;
      name: string;
      owner_email: string | null;
      plan: string;
      plan_expires_at: string;
    }>();

  const stores = Array.isArray(rows?.results) ? rows.results : [];
  let sent = 0;
  let failed = 0;

  for (const store of stores) {
    try {
      const didSend = await sendPlanExpiringSoonEmail(env, {
        storeId: store.id,
        storeName: store.name,
        storeSlug: store.slug,
        ownerEmail: store.owner_email,
        plan: store.plan,
        expiresAt: store.plan_expires_at,
      });
      if (didSend) sent += 1;
    } catch (error) {
      failed += 1;
      console.error("Failed to send plan expiring-soon email:", error);
    }
  }

  return { scanned: stores.length, sent, failed };
}

export async function retryPlanActivatedEmails(env: EmailNotificationEnv): Promise<{
  scanned: number;
  sent: number;
  failed: number;
}> {
  const rows = await env.DB
    .prepare(
      `SELECT
         o.store_id,
         o.mer_trade_no,
         o.plan,
         s.name AS store_name,
         s.slug AS store_slug,
         s.owner_email,
         s.plan_expires_at
       FROM payment_orders o
       JOIN stores s ON s.id = o.store_id
       LEFT JOIN email_notification_logs l
         ON l.event_type = 'plan_activated'
        AND l.dedupe_key = o.mer_trade_no
        AND l.status = 'sent'
       WHERE o.status = 'paid'
         AND l.id IS NULL
       ORDER BY o.id DESC
       LIMIT 50`
    )
    .all<{
      store_id: number;
      mer_trade_no: string;
      plan: string;
      store_name: string;
      store_slug: string;
      owner_email: string | null;
      plan_expires_at: string | null;
    }>();

  const orders = Array.isArray(rows?.results) ? rows.results : [];
  let sent = 0;
  let failed = 0;

  for (const order of orders) {
    try {
      const didSend = await sendPlanActivatedEmail(env, {
        storeId: order.store_id,
        storeName: order.store_name,
        storeSlug: order.store_slug,
        ownerEmail: order.owner_email,
        plan: order.plan,
        expiresAt: order.plan_expires_at || "",
        merTradeNo: order.mer_trade_no,
      });
      if (didSend) sent += 1;
    } catch (error) {
      failed += 1;
      console.error("Failed to retry plan activation email:", error);
    }
  }

  return { scanned: orders.length, sent, failed };
}
