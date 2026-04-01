import type { RequestContext } from "../../context";

// Country → currency mapping
export const COUNTRY_CONFIG: Record<string, { currency: string; currencySymbol: string; currencyLabel: string; defaultRate: number; defaultMarkup: number }> = {
  jp: { currency: "JPY", currencySymbol: "¥", currencyLabel: "日圓", defaultRate: 0.21, defaultMarkup: 1000 },
  kr: { currency: "KRW", currencySymbol: "₩", currencyLabel: "韓元", defaultRate: 0.024, defaultMarkup: 5000 },
  th: { currency: "THB", currencySymbol: "฿", currencyLabel: "泰銖", defaultRate: 1.01, defaultMarkup: 50 },
  tw: { currency: "TWD", currencySymbol: "NT$", currencyLabel: "台幣", defaultRate: 1, defaultMarkup: 100 },
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function handleStoreInfo(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  // GET: return store info including country config
  if (request.method === "GET") {
    const store = await ctx.db
      .prepare("SELECT id, slug, name, owner_email, destination_country, display_currency, line_id, plan FROM stores WHERE id = ?")
      .bind(ctx.storeId)
      .first<{ id: number; slug: string; name: string; owner_email: string; destination_country: string; display_currency: string; line_id: string | null; plan: string }>();

    if (!store) return json({ ok: false, error: "Store not found" }, 404);

    const countryConf = COUNTRY_CONFIG[store.destination_country] || COUNTRY_CONFIG["jp"];

    return json({
      ok: true,
      store: {
        ...store,
        countryConfig: countryConf,
      },
      countries: Object.entries(COUNTRY_CONFIG).map(([code, conf]) => ({
        code,
        currency: conf.currency,
        label: code === "jp" ? "🇯🇵 日本" : code === "kr" ? "🇰🇷 韓國" : code === "th" ? "🇹🇭 泰國" : "🇹🇼 台灣",
      })),
    });
  }

  // POST: update store country
  if (request.method === "POST") {
    let body: { destinationCountry?: string };
    try {
      body = (await request.json()) as { destinationCountry?: string };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const country = body.destinationCountry;
    if (!country || !COUNTRY_CONFIG[country]) {
      return json({ ok: false, error: "Invalid country. Must be: jp, kr, th, tw" }, 400);
    }

    const conf = COUNTRY_CONFIG[country];

    // Update store country
    await ctx.db
      .prepare("UPDATE stores SET destination_country = ?, display_currency = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(country, "TWD", ctx.storeId)
      .run();

    // Update exchange rate and markup to country defaults when switching country
    await ctx.db
      .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'jpy_to_twd', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
      .bind(ctx.storeId, String(conf.defaultRate))
      .run();
    await ctx.db
      .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'markup_jpy', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
      .bind(ctx.storeId, String(conf.defaultMarkup))
      .run();

    return json({ ok: true, country, countryConfig: conf });
  }

  return json({ ok: false, error: "Method Not Allowed" }, 405);
}

// Display settings (view mode, promo filters)
export async function handleDisplaySettings(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method === "GET") {
    const row = await ctx.db
      .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'display_settings'")
      .bind(ctx.storeId)
      .first<{ value: string }>();
    const defaults = { viewMode: "2card", promoEnabled: true, promoFilters: ["all", "350", "450", "550"] };
    try {
      const data = row?.value ? JSON.parse(row.value) : defaults;
      return json({ ok: true, ...data });
    } catch {
      return json({ ok: true, ...defaults });
    }
  }

  if (request.method === "POST") {
    let body: { viewMode?: string; promoEnabled?: boolean; promoFilters?: unknown[] };
    try {
      body = (await request.json()) as { viewMode?: string; promoFilters?: string[] };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    const settings = {
      viewMode: body.viewMode || "2card",
      promoEnabled: body.promoEnabled !== false,
      promoFilters: body.promoFilters || ["all", "350", "450", "550"],
    };
    await ctx.db
      .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'display_settings', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
      .bind(ctx.storeId, JSON.stringify(settings))
      .run();
    return json({ ok: true });
  }

  return json({ ok: false, error: "Method Not Allowed" }, 405);
}

// Update store display name
export async function handleStoreNameUpdate(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  let body: { name?: string };
  try {
    body = (await request.json()) as { name?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const name = (body.name || "").trim();
  if (!name || name.length > 100) return json({ ok: false, error: "Name required (max 100 chars)" }, 400);

  await ctx.db
    .prepare("UPDATE stores SET name = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(name, ctx.storeId)
    .run();

  return json({ ok: true });
}

// Popup ad management
export async function handlePopupAds(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method === "GET") {
    const row = await ctx.db
      .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'popup_ads'")
      .bind(ctx.storeId)
      .first<{ value: string }>();

    if (!row?.value) return json({ ok: true, images: [], interval: 0.5 });

    try {
      const data = JSON.parse(row.value);
      return json({ ok: true, images: data.images || [], interval: data.interval || 0.5 });
    } catch {
      return json({ ok: true, images: [], interval: 0.5 });
    }
  }

  if (request.method === "POST") {
    let body: { images?: string[]; interval?: number };
    try {
      body = (await request.json()) as { images?: string[]; interval?: number };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const images = (body.images || []).slice(0, 3);
    const interval = Math.max(0.3, Math.min(10, body.interval || 0.5));

    await ctx.db
      .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'popup_ads', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
      .bind(ctx.storeId, JSON.stringify({ images, interval }))
      .run();

    return json({ ok: true });
  }

  return json({ ok: false, error: "Method Not Allowed" }, 405);
}

// Upload popup ad image (WebP → R2)
export async function handlePopupAdUpload(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);
  if (!ctx.r2) return json({ ok: false, error: "R2 not configured" }, 500);

  let body: { image?: string };
  try {
    body = (await request.json()) as { image?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  if (!body.image) return json({ ok: false, error: "Missing image" }, 400);

  const binaryString = atob(body.image);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const key = `${ctx.storeId}/popup-ads/${Date.now()}.webp`;
  await ctx.r2.put(key, bytes.buffer, {
    httpMetadata: { contentType: "image/webp" },
  });

  return json({ ok: true, key });
}

// Delete popup ad image from R2
export async function handlePopupAdDelete(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);
  if (!ctx.r2) return json({ ok: false, error: "R2 not configured" }, 500);

  let body: { key?: string };
  try {
    body = (await request.json()) as { key?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  if (!body.key) return json({ ok: false, error: "Missing key" }, 400);

  // Security: ensure key belongs to this store
  if (!body.key.startsWith(`${ctx.storeId}/`)) {
    return json({ ok: false, error: "Unauthorized" }, 403);
  }

  await ctx.r2.delete(body.key);
  return json({ ok: true });
}
