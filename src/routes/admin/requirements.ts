import type { D1DatabaseLike } from "../../types/d1";
import { isAdminAuthorized } from "./auth";

type Env = {
  DB: D1DatabaseLike;
};

type FormRow = {
  id: number;
  customer_name: string;
  contact: string;
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
  status: string;
  created_at: string;
};

type ItemRow = {
  id: number;
  requirement_form_id: number;
  product_id: number | null;
  product_name_snapshot: string;
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

export async function handleAdminRequirements(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }
  if (!isAdminAuthorized(request)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const formsResult = await env.DB
    .prepare(
      `
SELECT
  id,
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
  created_at
FROM requirement_forms
ORDER BY created_at DESC, id DESC
LIMIT 100
`
    )
    .all<FormRow>();
  const forms = Array.isArray(formsResult?.results) ? formsResult.results : [];

  if (forms.length === 0) {
    return new Response(JSON.stringify({ ok: true, forms: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const ids = forms.map((form) => form.id);
  const placeholders = ids.map(() => "?").join(",");
  const itemsSql = `
SELECT
  ri.id,
  ri.requirement_form_id,
  ri.product_id,
  ri.product_name_snapshot,
  ri.quantity,
  ri.unit_price_jpy,
  ri.unit_price_twd,
  ri.subtotal_jpy,
  ri.subtotal_twd,
  ri.desired_size,
  ri.desired_color,
  ri.note,
  p.source_product_code AS product_code
FROM requirement_items ri
LEFT JOIN products p ON p.id = ri.product_id
WHERE ri.requirement_form_id IN (${placeholders})
ORDER BY ri.id DESC
`;
  const itemsResult = await env.DB
    .prepare(itemsSql)
    .bind(...ids)
    .all<ItemRow>();
  const items = Array.isArray(itemsResult?.results) ? itemsResult.results : [];

  const itemMap = new Map<number, ItemRow[]>();
  for (const item of items) {
    if (!itemMap.has(item.requirement_form_id)) {
      itemMap.set(item.requirement_form_id, []);
    }
    itemMap.get(item.requirement_form_id)?.push(item);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      forms: forms.map((form) => ({
        id: form.id,
        customerName: form.customer_name,
        contact: form.contact,
        memberPhone: form.member_phone || "",
        recipientCity: form.recipient_city || "",
        recipientAddress: form.recipient_address || "",
        lineId: form.line_id || "",
        shippingMethod: form.shipping_method || "consolidated_tw",
        shippingInternationalTwd: form.shipping_international_jpy,
        shippingDomesticTwd: form.shipping_domestic_twd,
        shippingTotalTwd: form.shipping_total_twd,
        requiresEzway: Number(form.requires_ezway || 0) === 1,
        notes: form.notes || "",
        status: form.status,
        createdAt: form.created_at,
        items: (itemMap.get(form.id) || []).map((item) => ({
          id: item.id,
          productId: item.product_id,
          code: item.product_code || "",
          productUrl: item.product_code
            ? `https://fo-online.jp/items/${encodeURIComponent(item.product_code)}`
            : "",
          productNameSnapshot: item.product_name_snapshot,
          quantity: item.quantity,
          unitPriceJpy: item.unit_price_jpy,
          unitPriceTwd: item.unit_price_twd,
          subtotalJpy: item.subtotal_jpy,
          subtotalTwd: item.subtotal_twd,
          desiredSize: item.desired_size || "",
          desiredColor: item.desired_color || "",
          note: item.note || "",
        })),
      })),
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
}
