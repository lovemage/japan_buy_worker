// src/shared/remittance-logic.js
// 匯款回報（離線銀行轉帳）的純邏輯層 — 不碰 D1，可直接 import 做單元測試。
// 供 src/routes/public/remittance.ts、src/routes/admin/requirements.ts、
// src/routes/admin/store-info.ts 共用。

import { parseCanonicalAmount } from "./store-payment-logic.js";

// ── 買家回報欄位正規化 ────────────────────────────────────────────────────────

// normalizeLast5(input) → "12345" | null
// 帳號後五碼：去掉空白與常見分隔符後，必須「恰好」5 位數字。
// 刻意不接受 4 碼或 6 碼 — 長度不對通常代表買家填錯欄位（填成帳號全碼或末四碼）。
export function normalizeLast5(input) {
  if (input === null || input === undefined) return null;
  const digits = String(input).replace(/[\s-]/g, "");
  if (!/^\d{5}$/.test(digits)) return null;
  return digits;
}

// normalizeDateOnly(value) → "YYYY-MM-DD" | null
// 同時吃 "YYYY-MM-DD" 與 D1 的 "YYYY-MM-DD HH:MM:SS"（只取日期部分）。
export function normalizeDateOnly(value) {
  if (!value) return null;
  const str = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // 反查真實日期，擋掉 2026-02-31 這種格式合法但不存在的日子
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return `${y}-${m}-${d}`;
}

function dayDiff(aIso, bIso) {
  const a = Date.UTC(Number(aIso.slice(0, 4)), Number(aIso.slice(5, 7)) - 1, Number(aIso.slice(8, 10)));
  const b = Date.UTC(Number(bIso.slice(0, 4)), Number(bIso.slice(5, 7)) - 1, Number(bIso.slice(8, 10)));
  return Math.round((a - b) / 86400000);
}

// ── 可否回報 ─────────────────────────────────────────────────────────────────

const UNREPORTABLE_STATUSES = new Set(["shipped", "completed", "cancelled", "merged"]);

// canReportRemittance(form) → { ok: true } | { ok: false, error }
// form 用 D1 的 snake_case 欄位，直接餵查詢結果即可。
export function canReportRemittance(form) {
  if (!form) return { ok: false, error: "查無此訂單" };
  if (form.merged_into_id !== null && form.merged_into_id !== undefined) {
    return { ok: false, error: "此訂單已合併至其他訂單，請於主訂單回報匯款" };
  }
  if (UNREPORTABLE_STATUSES.has(String(form.status || ""))) {
    return { ok: false, error: "此訂單目前狀態無法回報匯款，請聯繫賣家" };
  }
  if (form.remittance_status === "verified") {
    return { ok: false, error: "此訂單的匯款已核對完成，無需重複回報" };
  }
  return { ok: true };
}

// ── 回報內容驗證 ─────────────────────────────────────────────────────────────

// validateRemittanceReport({ last5, amount, paidDate, orderCreatedAt, todayIso })
//   → { ok: true, value: { last5, amount, paidDate, note } } | { ok: false, error }
//
// 日期區間刻意放寬各一天：伺服器時間是 UTC、買家在 UTC+8，跨日時段送出時
// 兩邊的「今天」會差一天，抓太緊會把正常回報擋掉。
export function validateRemittanceReport({ last5, amount, paidDate, note, orderCreatedAt, todayIso }) {
  const normalizedLast5 = normalizeLast5(last5);
  if (!normalizedLast5) {
    return { ok: false, error: "請輸入匯款帳號的後五碼（5 位數字）" };
  }

  const normalizedAmount = parseCanonicalAmount(amount);
  if (normalizedAmount === null) {
    return { ok: false, error: "請輸入正確的匯款金額" };
  }

  const normalizedDate = normalizeDateOnly(paidDate);
  if (!normalizedDate) {
    return { ok: false, error: "請選擇匯款日期" };
  }

  const today = normalizeDateOnly(todayIso);
  if (today && dayDiff(normalizedDate, today) > 1) {
    return { ok: false, error: "匯款日期不能是未來日期" };
  }

  const created = normalizeDateOnly(orderCreatedAt);
  if (created && dayDiff(normalizedDate, created) < -1) {
    return { ok: false, error: "匯款日期不能早於訂單成立日" };
  }

  const normalizedNote = String(note || "").trim().slice(0, 200);

  return {
    ok: true,
    value: {
      last5: normalizedLast5,
      amount: normalizedAmount,
      paidDate: normalizedDate,
      note: normalizedNote,
    },
  };
}

// ── 店家收款帳戶設定（存 app_settings.key = 'remittance_accounts'）──────────────
//
// 這是店家對外公開的收款資訊，買家必須看得到，性質與 PAYUNi 商店密鑰不同，
// 明文存 app_settings 即可，不走 secret-box.js。

export const DEFAULT_REMITTANCE_SETTINGS = {
  enabled: false,
  instruction: "",
  accounts: [],
};

const MAX_ACCOUNTS = 5;

function sanitizeAccount(raw) {
  if (!raw || typeof raw !== "object") return null;
  const bankName = String(raw.bankName || "").trim().slice(0, 40);
  const bankCode = String(raw.bankCode || "").replace(/\D/g, "").slice(0, 5);
  const accountNo = String(raw.accountNo || "").replace(/[^\d-]/g, "").slice(0, 24);
  const accountName = String(raw.accountName || "").trim().slice(0, 40);
  // 銀行名稱與帳號是買家匯款的最低必要資訊，缺一就不是一筆可用的收款帳戶
  if (!bankName || !accountNo) return null;
  return { bankName, bankCode, accountNo, accountName };
}

export function parseRemittanceSettings(rawValue) {
  if (!rawValue) return { ...DEFAULT_REMITTANCE_SETTINGS };
  try {
    const parsed = JSON.parse(rawValue);
    const accounts = Array.isArray(parsed?.accounts)
      ? parsed.accounts.map(sanitizeAccount).filter(Boolean).slice(0, MAX_ACCOUNTS)
      : [];
    return {
      enabled: parsed?.enabled === true,
      instruction: String(parsed?.instruction || "").slice(0, 500),
      accounts,
    };
  } catch {
    return { ...DEFAULT_REMITTANCE_SETTINGS };
  }
}

export function sanitizeRemittanceSettingsPatch(input) {
  const next = input && typeof input === "object" ? input : {};
  const accounts = Array.isArray(next.accounts)
    ? next.accounts.map(sanitizeAccount).filter(Boolean).slice(0, MAX_ACCOUNTS)
    : [];
  return {
    // 沒有任何一組帳戶時不允許開啟，否則買家會看到空的匯款說明
    enabled: next.enabled === true && accounts.length > 0,
    instruction: String(next.instruction || "").trim().slice(0, 500),
    accounts,
  };
}

// ── 後台核帳 ─────────────────────────────────────────────────────────────────

export const ADMIN_REMITTANCE_ACTIONS = ["verified", "rejected"];

// 自報金額與訂單應收金額是否吻合 — 後台用來標紅字提示，不阻擋核銷
// （少收訂金、多筆併匯都是實務上會發生的正常情況）。
export function remittanceAmountMatches(reportedAmount, orderTotal) {
  // Number(null) 是 0 而不是 NaN，所以缺值要先擋掉，否則「沒有金額」會被算成不符
  if (reportedAmount === null || reportedAmount === undefined || reportedAmount === "") return true;
  if (orderTotal === null || orderTotal === undefined || orderTotal === "") return true;
  const reported = Number(reportedAmount);
  const total = Number(orderTotal);
  if (!Number.isFinite(reported) || !Number.isFinite(total)) return true;
  return reported === total;
}
