import type { D1DatabaseLike } from "../../types/d1";

type Env = {
  DB: D1DatabaseLike;
};

type RequirementItemInput = {
  productId?: number | null;
  productNameSnapshot?: string;
  selectedImageUrl?: string;
  quantity?: number;
  unitPriceJpy?: number | null;
  unitPriceTwd?: number | null;
  subtotalJpy?: number | null;
  subtotalTwd?: number | null;
  desiredSize?: string;
  desiredColor?: string;
  note?: string;
};

type RequirementInput = {
  memberName?: string;
  memberPhone?: string;
  recipientCity?: string;
  recipientAddress?: string;
  lineId?: string;
  shippingMethod?: "consolidated_tw" | "jp_direct" | "limited_proxy" | "shipping_hidden";
  shippingInternationalTwd?: number;
  shippingDomesticTwd?: number;
  shippingTotalTwd?: number;
  requiresEzway?: boolean;
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
  customer_name: string;
  member_phone: string | null;
  recipient_city: string | null;
  recipient_address: string | null;
  line_id: string | null;
  shipping_method: string | null;
  shipping_international_jpy: number | null;
  shipping_domestic_twd: number | null;
  shipping_total_twd: number | null;
  requires_ezway: number | null;
  notes: string | null;
  created_at: string;
};

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
  note: string | null;
  product_code: string | null;
};

export async function handlePublicRequirements(
  request: Request,
  env: Env
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
  if (
    !body.shippingMethod ||
    !["consolidated_tw", "jp_direct", "limited_proxy", "shipping_hidden"].includes(
      body.shippingMethod
    )
  ) {
    return badRequest("shippingMethod is required");
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return badRequest("items is required");
  }
  if (body.items.some((item) => Number(item.quantity || 0) < 1)) {
    return badRequest("item quantity must be >= 1");
  }

  const insertedForm = await env.DB
    .prepare(
      `
INSERT INTO requirement_forms (
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
  created_at,
  updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', datetime('now'), datetime('now'))
RETURNING id
`
    )
    .bind(
      body.memberName.trim(),
      body.lineId.trim(),
      body.memberPhone.trim(),
      body.recipientCity.trim(),
      body.recipientAddress.trim(),
      body.lineId.trim(),
      body.shippingMethod,
      Number.isFinite(Number(body.shippingInternationalTwd))
        ? Number(body.shippingInternationalTwd)
        : null,
      Number.isFinite(Number(body.shippingDomesticTwd))
        ? Number(body.shippingDomesticTwd)
        : null,
      Number.isFinite(Number(body.shippingTotalTwd)) ? Number(body.shippingTotalTwd) : null,
      body.requiresEzway ? 1 : 0,
      (body.notes || "").trim()
    )
    .first<{ id: number }>();

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

    const inserted = await env.DB
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
        (item.desiredSize || "").trim(),
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

  return new Response(JSON.stringify({ ok: true, requirementId: insertedForm.id }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function handlePublicRequirementDetail(
  request: Request,
  env: Env
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

  const form = await env.DB
    .prepare(
      `
SELECT
  id,
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
  created_at
FROM requirement_forms
WHERE id = ?
LIMIT 1
`
    )
    .bind(id)
    .first<RequirementFormRow>();
  if (!form) {
    return new Response(JSON.stringify({ ok: false, error: "requirement not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const itemsRes = await env.DB
    .prepare(
      `
SELECT
  ri.id,
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
  const itemsTotalTwd = items.reduce((sum, item) => sum + Number(item.subtotal_twd || 0), 0);
  const shippingTwd = Number(form.shipping_total_twd || 0);
  const grandTotalTwd = itemsTotalTwd + shippingTwd;

  return new Response(
    JSON.stringify({
      ok: true,
      requirement: {
        id: form.id,
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
        itemsTotalJpy,
        itemsTotalTwd,
        grandTotalTwd,
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
          desiredSize: item.desired_size || "",
          desiredColor: item.desired_color || "",
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
