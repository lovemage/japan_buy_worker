import type { RequestContext } from "../../context";

const VALID_STATUSES = ["pending", "paid", "preparing", "ordered", "shipped", "completed", "cancelled"] as const;
type RequirementStatus = (typeof VALID_STATUSES)[number];
const VALID_ITEM_STATUSES = ["pending", "processed", "cancelled"] as const;
type RequirementItemStatus = (typeof VALID_ITEM_STATUSES)[number];

type FormRow = {
  id: number;
  order_code: string | null;
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
  adjusted_items_total_twd: number | null;
  adjusted_shipping_total_twd: number | null;
  requires_ezway: number | null;
  notes: string | null;
  status: string;
  payment_status: string | null;
  payment_public_token: string | null;
  payment_paid_at: string | null;
  created_at: string;
};

type ItemRow = {
  id: number;
  requirement_form_id: number;
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

export async function handleAdminRequirements(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method === "PATCH") {
    let body: {
      id?: number;
      status?: string;
      itemId?: number;
      itemStatus?: string;
      adjustedItemsTotalTwd?: number | string | null;
      adjustedShippingTotalTwd?: number | string | null;
      applyWholesale?: boolean;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (body?.applyWholesale === true) {
      const formId = Number(body?.id);
      if (!Number.isInteger(formId) || formId <= 0) {
        return new Response(JSON.stringify({ ok: false, error: "id is required" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      const formExists = await ctx.db
        .prepare("SELECT id FROM requirement_forms WHERE id = ? AND store_id = ?")
        .bind(formId, ctx.storeId)
        .first<{ id: number }>();
      if (!formExists?.id) {
        return new Response(JSON.stringify({ ok: false, error: "Requirement not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      const itemsRes = await ctx.db
        .prepare(
          `SELECT ri.id, ri.quantity, ri.subtotal_twd, p.wholesale_price_twd
             FROM requirement_items ri
             LEFT JOIN products p ON p.id = ri.product_id
            WHERE ri.requirement_form_id = ?`
        )
        .bind(formId)
        .all<{ id: number; quantity: number; subtotal_twd: number | null; wholesale_price_twd: number | null }>();
      const items = Array.isArray(itemsRes?.results) ? itemsRes.results : [];
      let total = 0;
      let appliedCount = 0;
      for (const item of items) {
        const qty = Number(item.quantity || 0);
        const wp = item.wholesale_price_twd === null || item.wholesale_price_twd === undefined
          ? null
          : Number(item.wholesale_price_twd);
        if (wp !== null && Number.isFinite(wp) && wp >= 0) {
          total += wp * qty;
          appliedCount += 1;
        } else {
          total += Number(item.subtotal_twd || 0);
        }
      }
      if (appliedCount === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: "訂單中沒有商品設定批發價，無法套用。" }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      const adjusted = Math.round(total);
      await ctx.db
        .prepare(
          "UPDATE requirement_forms SET adjusted_items_total_twd = ?, updated_at = datetime('now') WHERE id = ? AND store_id = ?"
        )
        .bind(adjusted, formId, ctx.storeId)
        .run();
      return new Response(
        JSON.stringify({ ok: true, id: formId, adjustedItemsTotalTwd: adjusted, appliedCount }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (Object.prototype.hasOwnProperty.call(body, "itemId") || Object.prototype.hasOwnProperty.call(body, "itemStatus")) {
      const itemId = Number(body?.itemId);
      const itemStatus = (body?.itemStatus || "") as RequirementItemStatus;
      if (!Number.isInteger(itemId) || itemId <= 0) {
        return new Response(JSON.stringify({ ok: false, error: "itemId is required" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      if (!VALID_ITEM_STATUSES.includes(itemStatus)) {
        return new Response(
          JSON.stringify({ ok: false, error: `itemStatus must be one of: ${VALID_ITEM_STATUSES.join(", ")}` }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      await ctx.db
        .prepare(
          `
UPDATE requirement_items
SET status = ?
WHERE id = ?
  AND requirement_form_id IN (SELECT id FROM requirement_forms WHERE store_id = ?)
`
        )
        .bind(itemStatus, itemId, ctx.storeId)
        .run();
      return new Response(JSON.stringify({ ok: true, itemId, itemStatus }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const id = Number(body?.id);
    const status = (body?.status || "") as RequirementStatus;
    if (!Number.isInteger(id) || id <= 0) {
      return new Response(JSON.stringify({ ok: false, error: "id is required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (!VALID_STATUSES.includes(status)) {
      return new Response(
        JSON.stringify({ ok: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    const hasAdjustmentPatch = Object.prototype.hasOwnProperty.call(body, "adjustedItemsTotalTwd") || Object.prototype.hasOwnProperty.call(body, "adjustedShippingTotalTwd");
    const normalizeAdjustedAmount = (value: number | string | null | undefined) => {
      if (value === null || value === undefined || value === "") return null;
      const num = Number(value);
      return Number.isFinite(num) && num >= 0 ? Math.round(num) : NaN;
    };
    if (hasAdjustmentPatch) {
      const adjustedItemsTotalTwd = normalizeAdjustedAmount(body.adjustedItemsTotalTwd);
      const adjustedShippingTotalTwd = normalizeAdjustedAmount(body.adjustedShippingTotalTwd);
      if (Number.isNaN(adjustedItemsTotalTwd) || Number.isNaN(adjustedShippingTotalTwd)) {
        return new Response(JSON.stringify({ ok: false, error: "adjusted amounts must be non-negative numbers" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      await ctx.db
        .prepare(
          "UPDATE requirement_forms SET status = ?, adjusted_items_total_twd = ?, adjusted_shipping_total_twd = ?, updated_at = datetime('now') WHERE id = ? AND store_id = ?"
        )
        .bind(status, adjustedItemsTotalTwd, adjustedShippingTotalTwd, id, ctx.storeId)
        .run();
      return new Response(JSON.stringify({ ok: true, id, status, adjustedItemsTotalTwd, adjustedShippingTotalTwd }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    await ctx.db
      .prepare(
        "UPDATE requirement_forms SET status = ?, updated_at = datetime('now') WHERE id = ? AND store_id = ?"
      )
      .bind(status, id, ctx.storeId)
      .run();
    return new Response(JSON.stringify({ ok: true, id, status }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id") || "");
    if (!Number.isInteger(id) || id <= 0) {
      return new Response(JSON.stringify({ ok: false, error: "id is required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const exists = await ctx.db
      .prepare("SELECT id FROM requirement_forms WHERE id = ? AND store_id = ?")
      .bind(id, ctx.storeId)
      .first<{ id: number }>();
    if (!exists?.id) {
      return new Response(JSON.stringify({ ok: false, error: "Requirement not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    await ctx.db.prepare("DELETE FROM requirement_forms WHERE id = ? AND store_id = ?").bind(id, ctx.storeId).run();
    return new Response(JSON.stringify({ ok: true, deletedId: id }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const formsResult = await ctx.db
    .prepare(
      `
SELECT
  id,
  order_code,
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
  adjusted_items_total_twd,
  adjusted_shipping_total_twd,
  requires_ezway,
  notes,
  status,
  (SELECT spo.status FROM store_payment_orders spo WHERE spo.requirement_form_id = requirement_forms.id ORDER BY spo.id DESC LIMIT 1) AS payment_status,
  (SELECT spo.public_token FROM store_payment_orders spo WHERE spo.requirement_form_id = requirement_forms.id ORDER BY spo.id DESC LIMIT 1) AS payment_public_token,
  (SELECT spo.paid_at FROM store_payment_orders spo WHERE spo.requirement_form_id = requirement_forms.id ORDER BY spo.id DESC LIMIT 1) AS payment_paid_at,
  created_at
FROM requirement_forms
WHERE store_id = ?
ORDER BY created_at DESC, id DESC
LIMIT 100
`
    )
    .bind(ctx.storeId)
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
  p.source_product_code AS product_code
FROM requirement_items ri
LEFT JOIN products p ON p.id = ri.product_id
WHERE ri.requirement_form_id IN (${placeholders})
ORDER BY ri.id DESC
`;
  const itemsResult = await ctx.db
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
        orderCode: form.order_code || String(form.id),
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
        adjustedItemsTotalTwd: form.adjusted_items_total_twd,
        adjustedShippingTotalTwd: form.adjusted_shipping_total_twd,
        requiresEzway: Number(form.requires_ezway || 0) === 1,
        notes: form.notes || "",
        status: form.status,
        paymentStatus: form.payment_status || null,
        paymentPublicToken: form.payment_public_token || null,
        paymentPaidAt: form.payment_paid_at || null,
        createdAt: form.created_at,
        items: (itemMap.get(form.id) || []).map((item) => ({
          id: item.id,
          productId: item.product_id,
          code: item.product_code || "",
          productUrl: item.product_code
            ? `https://fo-online.jp/items/${encodeURIComponent(item.product_code)}`
            : "",
          productNameSnapshot: item.product_name_snapshot,
          selectedImageUrl: item.selected_image_url || "",
          quantity: item.quantity,
          unitPriceJpy: item.unit_price_jpy,
          unitPriceTwd: item.unit_price_twd,
          subtotalJpy: item.subtotal_jpy,
          subtotalTwd: item.subtotal_twd,
          variantName: item.desired_size || "",
          desiredSize: item.desired_size || "",
          desiredColor: item.desired_color || "",
          itemStatus: item.item_status || "pending",
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
