import type { D1DatabaseLike } from "../../types/d1";

type Env = {
  DB: D1DatabaseLike;
  IMAGES?: R2Bucket;
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
  images: string[];
};

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

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
  const images = Array.isArray(body.images) ? body.images.filter(Boolean) : [];

  const imageUrls: string[] = [];
  if (env.IMAGES && images.length > 0) {
    for (let i = 0; i < images.length; i++) {
      const raw = images[i];
      const base64 = raw.includes(",") ? raw.split(",")[1] : raw;
      const key = `products/${code}/${i}.webp`;
      const buffer = base64ToArrayBuffer(base64);
      await env.IMAGES.put(key, buffer, {
        httpMetadata: { contentType: "image/webp" },
      });
      imageUrls.push(`/api/images/${key}`);
    }
  } else {
    // 無 R2 時不存圖片（base64 太大不適合存 D1）
  }

  const payload = JSON.stringify({
    description: body.description || "",
    specs: body.specs || {},
    sizeOptions: Array.isArray(body.sizeOptions) ? body.sizeOptions : [],
    colorOptions: Array.isArray(body.colorOptions) ? body.colorOptions : [],
    gallery: imageUrls,
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
      imageUrls[0] || null,
      payload
    )
    .run();

  const productId = result?.meta?.last_row_id;

  return new Response(
    JSON.stringify({ ok: true, productId, code, imageUrls }),
    { status: 201, headers: { "content-type": "application/json" } }
  );
}

export async function handleAdminProductToggle(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  let body: { id?: number; isActive?: number };
  try {
    body = (await request.json()) as { id?: number; isActive?: number };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const id = Number(body.id);
  const isActive = body.isActive === 1 ? 1 : 0;

  if (!Number.isInteger(id) || id <= 0) {
    return new Response(JSON.stringify({ ok: false, error: "id is required" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  await env.DB
    .prepare("UPDATE products SET is_active = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(isActive, id)
    .run();

  return new Response(
    JSON.stringify({ ok: true, id, isActive }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
