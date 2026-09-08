// src/shared/order-merge-logic.js
// 同客戶訂單合併的純邏輯層 — 不碰 D1，可直接 import 做單元測試。
// 供 src/routes/admin/order-merge.ts 使用。

// 已經進到出貨後階段的訂單不能再動品項；merged 代表它本身就是被併走的空殼。
const UNMERGEABLE_STATUSES = new Set(["shipped", "completed", "cancelled", "merged"]);

// 主單可以是還在處理中的任何狀態，但不能是已經被併走的單（避免鏈式合併）。
const INVALID_PRIMARY_STATUSES = new Set(["shipped", "completed", "cancelled", "merged"]);

function isMerged(form) {
  return form?.merged_into_id !== null && form?.merged_into_id !== undefined;
}

// canBeMergePrimary(form) → { ok } | { ok: false, error }
export function canBeMergePrimary(form) {
  if (!form) return { ok: false, error: "查無主訂單" };
  if (isMerged(form)) {
    return { ok: false, error: "主訂單已經被併入其他訂單，不能再當作合併目標" };
  }
  if (INVALID_PRIMARY_STATUSES.has(String(form.status || ""))) {
    return { ok: false, error: "主訂單目前狀態無法合併" };
  }
  return { ok: true };
}

// canBeMerged(form) → { ok } | { ok: false, error }
// form 需帶 status / merged_into_id / remittance_status / paid_payment_orders。
export function canBeMerged(form) {
  if (!form) return { ok: false, error: "查無訂單" };
  if (isMerged(form)) {
    return { ok: false, error: `訂單 #${form.order_code || form.id} 已經併入其他訂單` };
  }
  if (UNMERGEABLE_STATUSES.has(String(form.status || ""))) {
    return { ok: false, error: `訂單 #${form.order_code || form.id} 目前狀態無法合併` };
  }
  // 已經在對帳流程中的單併走，銀行明細會對不回任何一張訂單
  if (form.remittance_status === "reported" || form.remittance_status === "verified") {
    return { ok: false, error: `訂單 #${form.order_code || form.id} 已有匯款回報，請先處理核帳` };
  }
  if (Number(form.paid_payment_orders || 0) > 0) {
    return { ok: false, error: `訂單 #${form.order_code || form.id} 已完成線上付款，不能合併` };
  }
  return { ok: true };
}

// validateMerge(primary, others) → { ok } | { ok: false, error }
export function validateMerge(primary, others) {
  const list = Array.isArray(others) ? others : [];
  if (list.length === 0) {
    return { ok: false, error: "請選擇至少一張要合併的訂單" };
  }

  const primaryCheck = canBeMergePrimary(primary);
  if (!primaryCheck.ok) return primaryCheck;

  const seen = new Set();
  for (const form of list) {
    if (Number(form.id) === Number(primary.id)) {
      return { ok: false, error: "主訂單不能合併自己" };
    }
    if (seen.has(Number(form.id))) {
      return { ok: false, error: "合併清單有重複的訂單" };
    }
    seen.add(Number(form.id));

    if (Number(form.store_id) !== Number(primary.store_id)) {
      return { ok: false, error: "不能跨商店合併訂單" };
    }
    // 依電話認人是這個功能的前提；電話不同就是不同客戶
    if (String(form.member_phone || "") !== String(primary.member_phone || "")) {
      return { ok: false, error: "只能合併同一支電話的訂單" };
    }
    const check = canBeMerged(form);
    if (!check.ok) return check;
  }

  return { ok: true };
}

// buildMergeNote(primaryNotes, others) → 追加合併紀錄後的備註
// 店家在後台一眼要看得出這張單併了哪些單號。
export function buildMergeNote(primaryNotes, others) {
  const codes = (others || []).map((form) => `#${form.order_code || form.id}`);
  if (codes.length === 0) return String(primaryNotes || "");
  const line = `[已合併] ${codes.join(", ")}`;
  const existing = String(primaryNotes || "").trim();
  return existing ? `${line}\n${existing}` : line;
}

// isMergedForm(form) — 前後端共用的判斷（前端拿的是 camelCase）
export function isMergedForm(form) {
  return String(form?.status || "") === "merged" || isMerged(form);
}
