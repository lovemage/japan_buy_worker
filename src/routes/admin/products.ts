import type { RequestContext } from "../../context";

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
  ctx: RequestContext
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

  // Plan product limits: read from platform config (store_id=0)
  const limitsRow = await ctx.db
    .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'plan_limits'")
    .first<{ value: string }>();
  const planLimits = limitsRow?.value ? JSON.parse(limitsRow.value) : { free: 10, starter: 50, pro: -1 };
  const limit = planLimits[ctx.storePlan];
  if (limit && limit > 0) {
    const countRow = await ctx.db
      .prepare("SELECT COUNT(1) as c FROM products WHERE store_id = ?")
      .bind(ctx.storeId)
      .first<{ c: number }>();
    if ((countRow?.c || 0) >= limit) {
      return new Response(
        JSON.stringify({ ok: false, error: `${ctx.storePlan.toUpperCase()} 方案最多 ${limit} 件商品。升級方案以解鎖更多商品。` }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }
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
  if (ctx.r2 && images.length > 0) {
    for (let i = 0; i < images.length; i++) {
      const raw = images[i];
      const base64 = raw.includes(",") ? raw.split(",")[1] : raw;
      const key = `${ctx.storeId}/products/${code}/${i}.webp`;
      const buffer = base64ToArrayBuffer(base64);
      await ctx.r2.put(key, buffer, {
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

  const result = await ctx.db
    .prepare(
      `INSERT INTO products (
        store_id, source_site, source_product_code, title_ja, title_zh_tw,
        brand, category, price_jpy_tax_in, color_count,
        image_url, is_active, last_crawled_at, source_payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), ?)`
    )
    .bind(
      ctx.storeId,
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
  ctx: RequestContext
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

  await ctx.db
    .prepare("UPDATE products SET is_active = ?, updated_at = datetime('now') WHERE id = ? AND store_id = ?")
    .bind(isActive, id, ctx.storeId)
    .run();

  return new Response(
    JSON.stringify({ ok: true, id, isActive }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

export async function handleAdminProductUpdate(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "PATCH") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  let body: {
    id?: number;
    titleJa?: string;
    titleZhTw?: string;
    brand?: string;
    category?: string;
    priceJpyTaxIn?: number | null;
    gallery?: string[];
    newImages?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return new Response(JSON.stringify({ ok: false, error: "id is required" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  // Fetch current product for payload merge
  const current = await ctx.db
    .prepare("SELECT source_product_code, source_payload_json, image_url FROM products WHERE id = ? AND store_id = ?")
    .bind(id, ctx.storeId)
    .first<{ source_product_code: string; source_payload_json: string | null; image_url: string | null }>();

  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (body.titleJa !== undefined) { sets.push("title_ja = ?"); params.push((body.titleJa || "").trim()); }
  if (body.titleZhTw !== undefined) { sets.push("title_zh_tw = ?"); params.push((body.titleZhTw || "").trim() || null); }
  if (body.brand !== undefined) { sets.push("brand = ?"); params.push((body.brand || "").trim() || null); }
  if (body.category !== undefined) { sets.push("category = ?"); params.push((body.category || "").trim() || null); }
  if (body.priceJpyTaxIn !== undefined) { sets.push("price_jpy_tax_in = ?"); params.push(body.priceJpyTaxIn ?? null); }

  // Handle gallery updates (existing URLs kept + new images uploaded)
  let finalGallery: string[] | undefined;
  if (body.gallery !== undefined || (body.newImages && body.newImages.length > 0)) {
    let existingGallery: string[] = [];
    if (body.gallery !== undefined) {
      existingGallery = body.gallery;
    } else {
      try {
        const parsed = current?.source_payload_json ? JSON.parse(current.source_payload_json) : {};
        existingGallery = Array.isArray(parsed.gallery) ? parsed.gallery : [];
      } catch { /* empty */ }
    }

    // Upload new images to R2
    const newUrls: string[] = [];
    if (body.newImages && body.newImages.length > 0 && ctx.r2) {
      const code = current?.source_product_code || `product-${id}`;
      const ts = Date.now();
      for (let i = 0; i < body.newImages.length; i++) {
        const raw = body.newImages[i];
        const b64 = raw.includes(",") ? raw.split(",")[1] : raw;
        const key = `${ctx.storeId}/products/${code}/${ts}-${i}.webp`;
        const buffer = base64ToArrayBuffer(b64);
        await ctx.r2.put(key, buffer, { httpMetadata: { contentType: "image/webp" } });
        newUrls.push(`/api/images/${key}`);
      }
    }

    finalGallery = [...existingGallery, ...newUrls];

    // Update source_payload_json with new gallery
    let payloadObj: Record<string, unknown> = {};
    try {
      payloadObj = current?.source_payload_json ? JSON.parse(current.source_payload_json) : {};
    } catch { /* empty */ }
    payloadObj.gallery = finalGallery;
    sets.push("source_payload_json = ?");
    params.push(JSON.stringify(payloadObj));

    // Update image_url to first gallery image
    sets.push("image_url = ?");
    params.push(finalGallery[0] || null);
  }

  if (sets.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "沒有要更新的欄位" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  sets.push("updated_at = datetime('now')");
  params.push(id, ctx.storeId);

  await ctx.db
    .prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = ? AND store_id = ?`)
    .bind(...params)
    .run();

  return new Response(
    JSON.stringify({ ok: true, id, gallery: finalGallery }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

export async function handleAdminProductImageDelete(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  let body: { id?: number; imageUrl?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const id = Number(body.id);
  const imageUrl = (body.imageUrl || "").trim();
  if (!Number.isInteger(id) || id <= 0 || !imageUrl) {
    return new Response(JSON.stringify({ ok: false, error: "id and imageUrl required" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  // Delete from R2 if it's an R2 path
  if (imageUrl.startsWith("/api/images/") && ctx.r2) {
    const key = imageUrl.slice("/api/images/".length);
    await ctx.r2.delete(key);
  }

  // Update gallery in source_payload_json
  const row = await ctx.db
    .prepare("SELECT source_payload_json, image_url FROM products WHERE id = ? AND store_id = ?")
    .bind(id, ctx.storeId)
    .first<{ source_payload_json: string | null; image_url: string | null }>();

  let payloadObj: Record<string, unknown> = {};
  try { payloadObj = row?.source_payload_json ? JSON.parse(row.source_payload_json) : {}; } catch { /* */ }
  const gallery: string[] = Array.isArray(payloadObj.gallery) ? payloadObj.gallery.filter((u: string) => u !== imageUrl) : [];
  payloadObj.gallery = gallery;

  const newImageUrl = gallery[0] || null;
  await ctx.db
    .prepare("UPDATE products SET source_payload_json = ?, image_url = ?, updated_at = datetime('now') WHERE id = ? AND store_id = ?")
    .bind(JSON.stringify(payloadObj), newImageUrl, id, ctx.storeId)
    .run();

  return new Response(
    JSON.stringify({ ok: true, gallery }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
