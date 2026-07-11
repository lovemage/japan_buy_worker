import type { RequestContext } from "../../context";
import type { D1DatabaseLike } from "../../types/d1";
import {
  genMerTradeNo,
  genPublicToken,
  computeExpiresAt,
  canUseStoreCollection,
  computeEffectiveEnabled,
  parseCanonicalAmount,
} from "../../shared/store-payment-logic.js";
import { parseDisplaySettings } from "../../shared/display-settings.js";
import { getPricingConfig } from "../pricing";

type RequirementItemInput = {
  productId?: number | null;
  productNameSnapshot?: string;
  selectedImageUrl?: string;
  quantity?: number;
  unitPriceJpy?: number | null;
  unitPriceTwd?: number | null;
  subtotalJpy?: number | null;
  subtotalTwd?: number | null;
  variantName?: string;
  desiredSize?: string;
  desiredColor?: string;
  note?: string;
};

type CvsStoreInput = {
  chain?: string;
  id?: string;
  name?: string;
  address?: string;
};

type RequirementInput = {
  memberName?: string;
  memberPhone?: string;
  recipientCity?: string;
  recipientAddress?: string;
  lineId?: string;
  // Free-form string — covers legacy ids ("consolidated_tw" etc) and merchant-defined names
  shippingMethod?: string;
  shippingInternationalTwd?: number;
  shippingDomesticTwd?: number;
  shippingTotalTwd?: number;
  requiresEzway?: boolean;
  cvsStore?: CvsStoreInput | null;
  notes?: string;
  items?: RequirementItemInput[];
};

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

type RequirementFormRow = {
  id: number;
  order_code: string | null;
  customer_name: string;
  member_phone: string | null;
  recipient_city: string | null;
  recipient_address: string | null;
  line_id: string | null;
  shipping_method: string | null;
  shipping_international_jpy: number | null;
  shipping_domestic_twd: number | null;
  shipping_total_twd: number | null;
  adjusted_items_total_twd: number | null;
  adjusted_shipping_total_twd: number | null;
  requires_ezway: number | null;
  notes: string | null;
  status?: string | null;
  created_at: string;
};

type StorePaymentConfigRow = {
  mer_id_enc: string | null;
  hash_key_enc: string | null;
  hash_iv_enc: string | null;
  is_sandbox: number;
  is_enabled: number;
  direct_checkout_enabled: number;
};

function generateOrderCode(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `${dd}${mm}${rand}`;
}

function configIsValid(cfg: StorePaymentConfigRow | null | undefined): boolean {
  return Boolean(cfg?.mer_id_enc && cfg.hash_key_enc && cfg.hash_iv_enc);
}

type ShippingQuote = {
  method: string;
  internationalTwd: number;
  domesticTwd: number;
  totalTwd: number;
  requiresEzway: boolean;
};

type CustomShippingMethod = {
  name?: unknown;
  price?: unknown;
  enabled?: unknown;
};

function toShippingPrice(value: unknown): number {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? Math.round(price) : 0;
}

async function quoteShipping(
  ctx: RequestContext,
  shippingMethod: string
): Promise<ShippingQuote | null> {
  const displayRow = await ctx.db
    .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'display_settings'")
    .bind(ctx.storeId)
    .first<{ value: string }>();
  const displaySettings = parseDisplaySettings(displayRow?.value || null);
  const customMethods = Array.isArray(displaySettings.shippingMethods)
    ? (displaySettings.shippingMethods as CustomShippingMethod[]).filter(
        (method) => method && method.enabled !== false && String(method.name || "").trim()
      )
    : [];

  // Merchant-defined methods override the legacy checkout options.
  if (customMethods.length > 0) {
    const method = customMethods.find((candidate) => String(candidate.name).trim() === shippingMethod);
    if (!method) return null;

    const totalTwd = toShippingPrice(method.price);
    return { method: shippingMethod, internationalTwd: 0, domesticTwd: totalTwd, totalTwd, requiresEzway: false };
  }

  const pricing = await getPricingConfig(ctx.db, ctx.storeId);
  if (!pricing.shippingOptionsEnabled) {
    return shippingMethod === "shipping_hidden"
      ? { method: shippingMethod, internationalTwd: 0, domesticTwd: 0, totalTwd: 0, requiresEzway: false }
      : null;
  }

  switch (shippingMethod) {
    case "consolidated_tw": {
      const internationalTwd = toShippingPrice(pricing.internationalShippingTwd);
      const domesticTwd = toShippingPrice(pricing.domesticShippingTwd);
      return {
        method: shippingMethod,
        internationalTwd,
        domesticTwd,
        totalTwd: internationalTwd + domesticTwd,
        requiresEzway: false,
      };
    }
    case "jp_direct": {
      const internationalTwd = toShippingPrice(pricing.internationalShippingTwd);
      return { method: shippingMethod, internationalTwd, domesticTwd: 0, totalTwd: internationalTwd, requiresEzway: true };
    }
    case "limited_proxy": {
      const totalTwd = toShippingPrice(pricing.limitedProxyShippingTwd);
      return { method: shippingMethod, internationalTwd: 0, domesticTwd: 0, totalTwd, requiresEzway: false };
    }
    default:
      return null;
  }
}

function computeRequirementAmountTwd(body: RequirementInput, shippingTotalTwd: number): number | null {
  const itemsTotal = (body.items || []).reduce((sum, item) => {
    const subtotal = Number(item.subtotalTwd || 0);
    return sum + (Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 0);
  }, 0);
  const total = Math.round(itemsTotal + shippingTotalTwd);
  return parseCanonicalAmount(total);
}

async function maybeCreateDirectPaymentOrder(
  ctx: RequestContext,
  requirementId: number,
  orderCode: string,
  body: RequirementInput,
  shippingTotalTwd: number
): Promise<string | null> {
  const cfg = await ctx.db
    .prepare("SELECT * FROM store_payment_configs WHERE store_id = ?")
    .bind(ctx.storeId)
    .first<StorePaymentConfigRow>();

  const paymentEnabled = computeEffectiveEnabled({
    isEnabled: cfg?.is_enabled === 1,
    planOk: canUseStoreCollection(ctx.storePlan),
    configValid: configIsValid(cfg),
  });
  if (!paymentEnabled || cfg?.direct_checkout_enabled !== 1) return null;

  const amount = computeRequirementAmountTwd(body, shippingTotalTwd);
  if (amount === null) return null;

  const publicToken = genPublicToken();
  const merTradeNo = genMerTradeNo();
  const expiresAt = computeExpiresAt(168);
  const now = new Date().toISOString();
  const title = `訂單 #${orderCode || requirementId} 收款`;

  await ctx.db
    .prepare(
      `INSERT INTO store_payment_orders
         (store_id, public_token, mer_trade_no, title, amount, currency,
          status, is_sandbox, requirement_form_id, expires_at,
          created_under_plan, plan_valid_until_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'TWD', 'pending', ?, ?, ?, ?, NULL, ?, ?)`
    )
    .bind(
      ctx.storeId,
      publicToken,
      merTradeNo,
      title,
      amount,
      cfg.is_sandbox,
      requirementId,
      expiresAt,
      ctx.storePlan,
      now,
      now
    )
    .run();

  return `${ctx.basePath || ""}/pay?o=${encodeURIComponent(publicToken)}`;
}

async function generateUniqueOrderCode(db: D1DatabaseLike, storeId: number, maxRetries = 10): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const code = generateOrderCode();
    const exists = await db
      .prepare("SELECT 1 FROM requirement_forms WHERE order_code = ? AND store_id = ? LIMIT 1")
      .bind(code, storeId)
      .first();
    if (!exists) {
      return code;
    }
  }
  const fallback = generateOrderCode() + String(Math.floor(Math.random() * 100)).padStart(2, "0");
  return fallback;
}

type RequirementItemRow = {
  id: number;
  product_id: number | null;
  product_name_snapshot: string;
  selected_image_url: string | null;
  quantity: number;
  unit_price_jpy: number | null;
  unit_price_twd: number | null;
  subtotal_jpy: number | null;
  subtotal_twd: number | null;
  desired_size: string | null;
  desired_color: string | null;
  item_status: string | null;
  note: string | null;
  product_code: string | null;
};

function mapRequirementItem(item: RequirementItemRow) {
  return {
    id: item.id,
    productId: item.product_id,
    productNameSnapshot: item.product_name_snapshot,
    selectedImageUrl: item.selected_image_url || "",
    code: item.product_code || "",
    productUrl: item.product_code
      ? `https://fo-online.jp/items/${encodeURIComponent(item.product_code)}`
      : "",
    quantity: item.quantity,
    unitPriceJpy: Number(item.unit_price_jpy || 0),
    unitPriceTwd: Number(item.unit_price_twd || 0),
    subtotalJpy: Number(item.subtotal_jpy || 0),
    subtotalTwd: Number(item.subtotal_twd || 0),
    variantName: item.desired_size || "",
    desiredSize: item.desired_size || "",
    desiredColor: item.desired_color || "",
    itemStatus: item.item_status || "pending",
    note: item.note || "",
  };
}

function hasAdjustedValue(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function normalizeVariantName(item: RequirementItemInput): string {
  return (item.variantName || item.desiredSize || "").trim();
}

export async function handlePublicRequirements(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let body: RequirementInput;
  try {
    body = (await request.json()) as RequirementInput;
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!body.memberName?.trim()) {
    return badRequest("memberName is required");
  }
  if (!body.memberPhone?.trim()) {
    return badRequest("memberPhone is required");
  }
  if (!body.recipientCity?.trim()) {
    return badRequest("recipientCity is required");
  }
  if (!body.recipientAddress?.trim()) {
    return badRequest("recipientAddress is required");
  }
  if (!body.lineId?.trim()) {
    return badRequest("lineId is required");
  }
  const shippingMethod = (body.shippingMethod || "").trim();
  if (!shippingMethod) {
    return badRequest("shippingMethod is required");
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return badRequest("items is required");
  }
  if (body.items.some((item) => Number(item.quantity || 0) < 1)) {
    return badRequest("item quantity must be >= 1");
  }

  // The server owns the quote so a browser cannot omit or alter the shipping fee.
  const shipping = await quoteShipping(ctx, shippingMethod);
  if (!shipping) {
    return badRequest("shippingMethod is invalid or unavailable");
  }

  const orderCode = await generateUniqueOrderCode(ctx.db, ctx.storeId);

  const insertedForm = await ctx.db
    .prepare(
      `
INSERT INTO requirement_forms (
  store_id,
  customer_name,
  contact,
  member_phone,
  recipient_city,
  recipient_address,
  line_id,
  shipping_method,
  shipping_international_jpy,
  shipping_domestic_twd,
  shipping_total_twd,
  requires_ezway,
  notes,
  status,
  order_code,
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))
RETURNING id, order_code
`
    )
    .bind(
      ctx.storeId,
      body.memberName.trim(),
      body.lineId.trim(),
      body.memberPhone.trim(),
      body.recipientCity.trim(),
      body.recipientAddress.trim(),
      body.lineId.trim(),
      shipping.method,
      shipping.internationalTwd,
      shipping.domesticTwd,
      shipping.totalTwd,
      shipping.requiresEzway ? 1 : 0,
      (() => {
        const userNotes = (body.notes || "").trim();
        const cvs = body.cvsStore;
        if (cvs && cvs.id && cvs.name) {
          const chainLabel = cvs.chain === "7-11" ? "7-11" : cvs.chain === "family" ? "全家" : (cvs.chain || "");
          const cvsLine = `[取貨門市] ${chainLabel} ${cvs.name} #${cvs.id}${cvs.address ? `｜${cvs.address}` : ""}`;
          return userNotes ? `${cvsLine}\n${userNotes}` : cvsLine;
        }
        return userNotes;
      })(),
      orderCode
    )
    .first<{ id: number; order_code: string }>();

  if (!insertedForm?.id) {
    return new Response(JSON.stringify({ ok: false, error: "Failed to create form" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  for (const item of body.items) {
    const productNameSnapshot = (item.productNameSnapshot || "").trim();
    if (!productNameSnapshot) {
      return badRequest("productNameSnapshot is required");
    }

    const inserted = await ctx.db
      .prepare(
        `
INSERT INTO requirement_items (
  requirement_form_id,
  product_id,
  product_name_snapshot,
  selected_image_url,
  quantity,
  unit_price_jpy,
  unit_price_twd,
  subtotal_jpy,
  subtotal_twd,
  desired_size,
  desired_color,
  note,
  created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`
      )
      .bind(
        insertedForm.id,
        item.productId || null,
        productNameSnapshot,
        (item.selectedImageUrl || "").trim(),
        Number(item.quantity || 1),
        Number.isFinite(Number(item.unitPriceJpy)) ? Number(item.unitPriceJpy) : null,
        Number.isFinite(Number(item.unitPriceTwd)) ? Number(item.unitPriceTwd) : null,
        Number.isFinite(Number(item.subtotalJpy)) ? Number(item.subtotalJpy) : null,
        Number.isFinite(Number(item.subtotalTwd)) ? Number(item.subtotalTwd) : null,
        normalizeVariantName(item),
        (item.desiredColor || "").trim(),
        (item.note || "").trim()
      )
      .run();

    if (!inserted.success) {
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to create requirement items" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }
  }

  let payUrl: string | null = null;
  try {
    payUrl = await maybeCreateDirectPaymentOrder(
      ctx,
      insertedForm.id,
      insertedForm.order_code || String(insertedForm.id),
      body,
      shipping.totalTwd
    );
  } catch {
    payUrl = null;
  }

  return new Response(
    JSON.stringify({
      ok: true,
      requirementId: insertedForm.id,
      orderCode: insertedForm.order_code || String(insertedForm.id),
      payUrl,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

export async function handlePublicRequirementDetail(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id") || "");
  if (!Number.isFinite(id) || id <= 0) {
    return badRequest("id is required");
  }

  const form = await ctx.db
    .prepare(
      `
SELECT
  id,
  order_code,
  customer_name,
  member_phone,
  recipient_city,
  recipient_address,
  line_id,
  shipping_method,
  shipping_international_jpy,
  shipping_domestic_twd,
  shipping_total_twd,
  requires_ezway,
  notes,
  status,
  created_at
FROM requirement_forms
WHERE id = ? AND store_id = ?
LIMIT 1
`
    )
    .bind(id, ctx.storeId)
    .first<RequirementFormRow>();
  if (!form) {
    return new Response(JSON.stringify({ ok: false, error: "requirement not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const itemsRes = await ctx.db
    .prepare(
      `
SELECT
  ri.id,
  ri.requirement_form_id,
  ri.product_id,
  ri.product_name_snapshot,
  ri.selected_image_url,
  ri.quantity,
  ri.unit_price_jpy,
  ri.unit_price_twd,
  ri.subtotal_jpy,
  ri.subtotal_twd,
  ri.desired_size,
  ri.desired_color,
  ri.status AS item_status,
  ri.note,
  p.source_product_code as product_code
FROM requirement_items ri
LEFT JOIN products p ON p.id = ri.product_id
WHERE ri.requirement_form_id = ?
ORDER BY ri.id ASC
`
    )
    .bind(id)
    .all<RequirementItemRow>();
  const items = Array.isArray(itemsRes?.results) ? itemsRes.results : [];

  const itemsTotalJpy = items.reduce((sum, item) => sum + Number(item.subtotal_jpy || 0), 0);
  const originalItemsTotalTwd = items.reduce((sum, item) => sum + Number(item.subtotal_twd || 0), 0);
  const originalShippingTwd = Number(form.shipping_total_twd || 0);
  const amountAdjusted = hasAdjustedValue(form.adjusted_items_total_twd) || hasAdjustedValue(form.adjusted_shipping_total_twd);
  const itemsTotalTwd = hasAdjustedValue(form.adjusted_items_total_twd) ? Number(form.adjusted_items_total_twd) : originalItemsTotalTwd;
  const shippingTwd = hasAdjustedValue(form.adjusted_shipping_total_twd) ? Number(form.adjusted_shipping_total_twd) : originalShippingTwd;
  const grandTotalTwd = itemsTotalTwd + shippingTwd;

  return new Response(
    JSON.stringify({
      ok: true,
      requirement: {
        id: form.id,
        orderCode: form.order_code || String(form.id),
        createdAt: form.created_at,
        memberName: form.customer_name,
        memberPhone: form.member_phone || "",
        recipientCity: form.recipient_city || "",
        recipientAddress: form.recipient_address || "",
        lineId: form.line_id || "",
        shippingMethod: form.shipping_method || "consolidated_tw",
        shippingInternationalTwd: Number(form.shipping_international_jpy || 0),
        shippingDomesticTwd: Number(form.shipping_domestic_twd || 0),
        shippingTotalTwd: shippingTwd,
        requiresEzway: Number(form.requires_ezway || 0) === 1,
        notes: form.notes || "",
        status: form.status || "pending",
        itemsTotalJpy,
        itemsTotalTwd,
        originalItemsTotalTwd,
        originalShippingTotalTwd: originalShippingTwd,
        originalGrandTotalTwd: originalItemsTotalTwd + originalShippingTwd,
        grandTotalTwd,
        amountAdjusted,
        items: items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          productNameSnapshot: item.product_name_snapshot,
          selectedImageUrl: item.selected_image_url || "",
          code: item.product_code || "",
          productUrl: item.product_code
            ? `https://fo-online.jp/items/${encodeURIComponent(item.product_code)}`
            : "",
          quantity: item.quantity,
          unitPriceJpy: Number(item.unit_price_jpy || 0),
          unitPriceTwd: Number(item.unit_price_twd || 0),
          subtotalJpy: Number(item.subtotal_jpy || 0),
          subtotalTwd: Number(item.subtotal_twd || 0),
          variantName: item.desired_size || "",
          desiredSize: item.desired_size || "",
          desiredColor: item.desired_color || "",
          itemStatus: item.item_status || "pending",
          note: item.note || "",
        })),
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
}

export async function handlePublicRequirementHistory(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const phone = (url.searchParams.get("phone") || "").trim();
  if (!phone) {
    return badRequest("phone is required");
  }

  const formsResult = await ctx.db
    .prepare(
      `
SELECT
  id,
  order_code,
  customer_name,
  member_phone,
  recipient_city,
  recipient_address,
  line_id,
  shipping_method,
  shipping_international_jpy,
  shipping_domestic_twd,
  shipping_total_twd,
  adjusted_items_total_twd,
  adjusted_shipping_total_twd,
  requires_ezway,
  notes,
  status,
  created_at
FROM requirement_forms
WHERE store_id = ? AND member_phone = ?
ORDER BY created_at DESC, id DESC
LIMIT 50
`
    )
    .bind(ctx.storeId, phone)
    .all<RequirementFormRow>();
  const forms = Array.isArray(formsResult?.results) ? formsResult.results : [];

  if (forms.length === 0) {
    return new Response(JSON.stringify({ ok: true, orders: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const ids = forms.map((form) => form.id);
  const placeholders = ids.map(() => "?").join(",");
  const itemsResult = await ctx.db
    .prepare(
      `
SELECT
  ri.id,
  ri.requirement_form_id,
  ri.product_id,
  ri.product_name_snapshot,
  ri.selected_image_url,
  ri.quantity,
  ri.unit_price_jpy,
  ri.unit_price_twd,
  ri.subtotal_jpy,
  ri.subtotal_twd,
  ri.desired_size,
  ri.desired_color,
  ri.status AS item_status,
  ri.note,
  p.source_product_code as product_code
FROM requirement_items ri
LEFT JOIN products p ON p.id = ri.product_id
WHERE ri.requirement_form_id IN (${placeholders})
ORDER BY ri.id ASC
`
    )
    .bind(...ids)
    .all<RequirementItemRow & { requirement_form_id: number }>();
  const items = Array.isArray(itemsResult?.results) ? itemsResult.results : [];
  const itemMap = new Map<number, RequirementItemRow[]>();
  for (const item of items) {
    if (!itemMap.has(item.requirement_form_id)) {
      itemMap.set(item.requirement_form_id, []);
    }
    itemMap.get(item.requirement_form_id)?.push(item);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      orders: forms.map((form) => {
        const orderItems = itemMap.get(form.id) || [];
        const itemsTotalJpy = orderItems.reduce((sum, item) => sum + Number(item.subtotal_jpy || 0), 0);
        const originalItemsTotalTwd = orderItems.reduce((sum, item) => sum + Number(item.subtotal_twd || 0), 0);
        const originalShippingTwd = Number(form.shipping_total_twd || 0);
        const amountAdjusted = hasAdjustedValue(form.adjusted_items_total_twd) || hasAdjustedValue(form.adjusted_shipping_total_twd);
        const itemsTotalTwd = hasAdjustedValue(form.adjusted_items_total_twd) ? Number(form.adjusted_items_total_twd) : originalItemsTotalTwd;
        const shippingTwd = hasAdjustedValue(form.adjusted_shipping_total_twd) ? Number(form.adjusted_shipping_total_twd) : originalShippingTwd;
        return {
          id: form.id,
          orderCode: form.order_code || String(form.id),
          createdAt: form.created_at,
          memberName: form.customer_name,
          memberPhone: form.member_phone || "",
          recipientCity: form.recipient_city || "",
          recipientAddress: form.recipient_address || "",
          lineId: form.line_id || "",
          shippingMethod: form.shipping_method || "consolidated_tw",
          shippingInternationalTwd: Number(form.shipping_international_jpy || 0),
          shippingDomesticTwd: Number(form.shipping_domestic_twd || 0),
          shippingTotalTwd: shippingTwd,
          requiresEzway: Number(form.requires_ezway || 0) === 1,
          notes: form.notes || "",
          status: form.status || "pending",
          itemsTotalJpy,
          itemsTotalTwd,
          originalItemsTotalTwd,
          originalShippingTotalTwd: originalShippingTwd,
          originalGrandTotalTwd: originalItemsTotalTwd + originalShippingTwd,
          grandTotalTwd: itemsTotalTwd + shippingTwd,
          amountAdjusted,
          items: orderItems.map(mapRequirementItem),
        };
      }),
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
}
