import type { D1DatabaseLike } from "../../types/d1";

type Env = {
  DB: D1DatabaseLike;
};

type ManualProductRequest = {
  titleJa: string;
  titleZhTw: string;
  brand: string;
  category: string;
  priceJpyTaxIn: number | null;
  description: string;
  specs: Record<string, string>;
  sizeOptions: string[];
  colorOptions: string[];
  imageDataUrl: string;
};

export async function handleAdminProducts(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  let body: ManualProductRequest;
  try {
    body = (await request.json()) as ManualProductRequest;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const titleJa = (body.titleJa || "").trim();
  const titleZhTw = (body.titleZhTw || "").trim();
  if (!titleJa && !titleZhTw) {
    return new Response(
      JSON.stringify({ ok: false, error: "商品名稱（日文或中文）為必填" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const code = `manual-${Date.now()}`;
  const payload = JSON.stringify({
    description: body.description || "",
    specs: body.specs || {},
    sizeOptions: Array.isArray(body.sizeOptions) ? body.sizeOptions : [],
    colorOptions: Array.isArray(body.colorOptions) ? body.colorOptions : [],
    gallery: body.imageDataUrl ? [body.imageDataUrl] : [],
  });

  const result = await env.DB
    .prepare(
      `INSERT INTO products (
        source_site, source_product_code, title_ja, title_zh_tw,
        brand, category, price_jpy_tax_in, color_count,
        image_url, is_active, last_crawled_at, source_payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), ?)`
    )
    .bind(
      "manual",
      code,
      titleJa || titleZhTw,
      titleZhTw || null,
      body.brand || null,
      body.category || null,
      body.priceJpyTaxIn ?? null,
      Array.isArray(body.colorOptions) ? body.colorOptions.length : null,
      body.imageDataUrl || null,
      payload
    )
    .run();

  const productId = result?.meta?.last_row_id;

  return new Response(
    JSON.stringify({ ok: true, productId, code }),
    { status: 201, headers: { "content-type": "application/json" } }
  );
}
