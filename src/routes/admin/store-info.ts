import type { RequestContext } from "../../context";

// Country → currency mapping
export const COUNTRY_CONFIG: Record<string, { currency: string; currencySymbol: string; currencyLabel: string; defaultRate: number }> = {
  jp: { currency: "JPY", currencySymbol: "¥", currencyLabel: "日圓", defaultRate: 0.22 },
  kr: { currency: "KRW", currencySymbol: "₩", currencyLabel: "韓元", defaultRate: 0.024 },
  th: { currency: "THB", currencySymbol: "฿", currencyLabel: "泰銖", defaultRate: 0.9 },
  tw: { currency: "TWD", currencySymbol: "NT$", currencyLabel: "台幣", defaultRate: 1 },
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
      .prepare("SELECT id, slug, name, destination_country, display_currency, line_id, plan FROM stores WHERE id = ?")
      .bind(ctx.storeId)
      .first<{ id: number; slug: string; name: string; destination_country: string; display_currency: string; line_id: string | null; plan: string }>();

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

    // Set default exchange rate for this country if not already set
    const existingRate = await ctx.db
      .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'exchange_rate'")
      .bind(ctx.storeId)
      .first<{ value: string }>();

    if (!existingRate) {
      await ctx.db
        .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'exchange_rate', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
        .bind(ctx.storeId, String(conf.defaultRate))
        .run();
    }

    return json({ ok: true, country, countryConfig: conf });
  }

  return json({ ok: false, error: "Method Not Allowed" }, 405);
}
