import type { RequestContext } from "../../context";
import {
  canReportRemittance,
  parseRemittanceSettings,
  validateRemittanceReport,
} from "../../shared/remittance-logic.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type RemittanceSettings = {
  enabled: boolean;
  instruction: string;
  accounts: { bankName: string; bankCode: string; accountNo: string; accountName: string }[];
};

async function loadSettings(ctx: RequestContext): Promise<RemittanceSettings> {
  const row = await ctx.db
    .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'remittance_accounts'")
    .bind(ctx.storeId)
    .first<{ value: string }>();
  return parseRemittanceSettings(row?.value || null) as RemittanceSettings;
}

// GET /api/remittance-info — 買家匯款前看的收款帳戶。
// 店家沒開啟時只回 enabled:false，不洩漏任何帳戶資料。
export async function handlePublicRemittanceInfo(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method Not Allowed" }, 405);
  }
  const settings = await loadSettings(ctx);
  if (!settings.enabled) {
    return json({ ok: true, enabled: false, instruction: "", accounts: [] });
  }
  return json({
    ok: true,
    enabled: true,
    instruction: settings.instruction,
    accounts: settings.accounts,
  });
}

type ReportInput = {
  orderCode?: string;
  phone?: string;
  last5?: string;
  amount?: number | string;
  paidDate?: string;
  note?: string;
};

type ReportFormRow = {
  id: number;
  order_code: string | null;
  status: string;
  created_at: string;
  remittance_status: string | null;
};

// POST /api/remittance-report — 買家回報匯款帳號後五碼。
//
// 身分驗證：order_code + member_phone 必須同時吻合（同一個 store 範圍內）。
// 查無資料時回傳的訊息刻意不區分「訂單不存在」與「電話不符」，
// 否則這支端點會變成訂單編號的存在性探測器。
export async function handlePublicRemittanceReport(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method Not Allowed" }, 405);
  }

  const settings = await loadSettings(ctx);
  if (!settings.enabled) {
    return json({ ok: false, error: "本商店尚未開放匯款回報" }, 400);
  }

  let body: ReportInput;
  try {
    body = (await request.json()) as ReportInput;
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const orderCode = String(body.orderCode || "").trim();
  const phone = String(body.phone || "").trim();
  if (!orderCode || !phone) {
    return json({ ok: false, error: "請輸入訂單編號與訂購時填寫的電話" }, 400);
  }

  const form = await ctx.db
    .prepare(
      `SELECT id, order_code, status, created_at, remittance_status
         FROM requirement_forms
        WHERE store_id = ? AND order_code = ? AND member_phone = ?
        LIMIT 1`
    )
    .bind(ctx.storeId, orderCode, phone)
    .first<ReportFormRow>();

  if (!form?.id) {
    return json({ ok: false, error: "訂單編號或電話不正確，請確認後再試一次" }, 400);
  }

  const reportable = canReportRemittance(form);
  if (!reportable.ok) {
    return json({ ok: false, error: reportable.error }, 400);
  }

  const validated = validateRemittanceReport({
    last5: body.last5,
    amount: body.amount,
    paidDate: body.paidDate,
    note: body.note,
    orderCreatedAt: form.created_at,
    todayIso: new Date().toISOString().slice(0, 10),
  });
  if (!validated.ok) {
    return json({ ok: false, error: validated.error }, 400);
  }

  const { last5, amount, paidDate, note } = validated.value;

  await ctx.db
    .prepare(
      `UPDATE requirement_forms
          SET remittance_status = 'reported',
              remittance_last5 = ?,
              remittance_amount = ?,
              remittance_paid_date = ?,
              remittance_note = ?,
              remittance_reported_at = datetime('now'),
              remittance_verified_at = NULL,
              updated_at = datetime('now')
        WHERE id = ? AND store_id = ?`
    )
    .bind(last5, amount, paidDate, note, form.id, ctx.storeId)
    .run();

  return json({
    ok: true,
    orderCode: form.order_code || String(form.id),
    remittanceStatus: "reported",
    last5,
  });
}
