import type { RequestContext } from "../context";
import type { D1DatabaseLike } from "../types/d1";
// Auth is now handled by the router before dispatching to this handler

type SettingRow = {
  key: string;
  value: string;
};

const DEFAULT_MARKUP_JPY = 1000;
const DEFAULT_MARKUP_MODE = "flat"; // "flat" | "percent"
const DEFAULT_MARKUP_PERCENT = 15;
const DEFAULT_JPY_TO_TWD = 0.21;
const DEFAULT_INTL_SHIPPING_TWD = 350;
const DEFAULT_DOMESTIC_SHIPPING_TWD = 60;
const DEFAULT_PROMO_TAG_MAX_TWD = 500;
const DEFAULT_LIMITED_PROXY_SHIPPING_TWD = 80;
const DEFAULT_SHIPPING_OPTIONS_ENABLED = 1;

async function ensureSettingsTable(db: D1DatabaseLike): Promise<void> {
  await db
    .prepare(
      `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
`
    )
    .run();
}

export async function getPricingConfig(db: D1DatabaseLike, storeId: number): Promise<{
  markupJpy: number;
  markupMode: string;
  markupPercent: number;
  jpyToTwd: number;
  internationalShippingTwd: number;
  domesticShippingTwd: number;
  promoTagMaxTwd: number;
  limitedProxyShippingTwd: number;
  shippingOptionsEnabled: boolean;
}> {
  await ensureSettingsTable(db);
  await db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'markup_jpy', ?, datetime('now')) ON CONFLICT(store_id, key) DO NOTHING"
    )
    .bind(storeId, String(DEFAULT_MARKUP_JPY))
    .run();
  await db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'jpy_to_twd', ?, datetime('now')) ON CONFLICT(store_id, key) DO NOTHING"
    )
    .bind(storeId, String(DEFAULT_JPY_TO_TWD))
    .run();
  await db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'international_shipping_twd', ?, datetime('now')) ON CONFLICT(store_id, key) DO NOTHING"
    )
    .bind(storeId, String(DEFAULT_INTL_SHIPPING_TWD))
    .run();
  await db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'domestic_shipping_twd', ?, datetime('now')) ON CONFLICT(store_id, key) DO NOTHING"
    )
    .bind(storeId, String(DEFAULT_DOMESTIC_SHIPPING_TWD))
    .run();
  await db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'promo_tag_max_twd', ?, datetime('now')) ON CONFLICT(store_id, key) DO NOTHING"
    )
    .bind(storeId, String(DEFAULT_PROMO_TAG_MAX_TWD))
    .run();
  await db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'limited_proxy_shipping_twd', ?, datetime('now')) ON CONFLICT(store_id, key) DO NOTHING"
    )
    .bind(storeId, String(DEFAULT_LIMITED_PROXY_SHIPPING_TWD))
    .run();
  await db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'shipping_options_enabled', ?, datetime('now')) ON CONFLICT(store_id, key) DO NOTHING"
    )
    .bind(storeId, String(DEFAULT_SHIPPING_OPTIONS_ENABLED))
    .run();
  await db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'markup_mode', ?, datetime('now')) ON CONFLICT(store_id, key) DO NOTHING"
    )
    .bind(storeId, DEFAULT_MARKUP_MODE)
    .run();
  await db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'markup_percent', ?, datetime('now')) ON CONFLICT(store_id, key) DO NOTHING"
    )
    .bind(storeId, String(DEFAULT_MARKUP_PERCENT))
    .run();

  const rows = await db
    .prepare(
      "SELECT key, value FROM app_settings WHERE store_id = ? AND key IN ('markup_jpy','markup_mode','markup_percent','jpy_to_twd','international_shipping_twd','international_shipping_jpy','domestic_shipping_twd','promo_tag_max_twd','limited_proxy_shipping_twd','shipping_options_enabled')"
    )
    .bind(storeId)
    .all<SettingRow>();
  const result = Array.isArray(rows?.results) ? rows.results : [];
  const markupRaw = result.find((x) => x.key === "markup_jpy")?.value;
  const markupModeRaw = result.find((x) => x.key === "markup_mode")?.value;
  const markupPercentRaw = result.find((x) => x.key === "markup_percent")?.value;
  const rateRaw = result.find((x) => x.key === "jpy_to_twd")?.value;
  const intlShippingRaw =
    result.find((x) => x.key === "international_shipping_twd")?.value ||
    result.find((x) => x.key === "international_shipping_jpy")?.value;
  const domesticShippingRaw = result.find((x) => x.key === "domestic_shipping_twd")?.value;
  const promoTagMaxRaw = result.find((x) => x.key === "promo_tag_max_twd")?.value;
  const limitedProxyShippingRaw = result.find(
    (x) => x.key === "limited_proxy_shipping_twd"
  )?.value;
  const shippingOptionsEnabledRaw = result.find(
    (x) => x.key === "shipping_options_enabled"
  )?.value;

  const markup = Number(markupRaw);
  const markupMode = markupModeRaw === "percent" ? "percent" : "flat";
  const markupPercent = Number(markupPercentRaw);
  const rate = Number(rateRaw);
  const intlShipping = Number(intlShippingRaw);
  const domesticShipping = Number(domesticShippingRaw);
  const promoTagMaxTwd = Number(promoTagMaxRaw);
  const limitedProxyShippingTwd = Number(limitedProxyShippingRaw);
  const shippingOptionsEnabled = Number(shippingOptionsEnabledRaw);
  return {
    markupJpy: Number.isFinite(markup) ? markup : DEFAULT_MARKUP_JPY,
    markupMode,
    markupPercent: Number.isFinite(markupPercent) ? markupPercent : DEFAULT_MARKUP_PERCENT,
    jpyToTwd: Number.isFinite(rate) ? rate : DEFAULT_JPY_TO_TWD,
    internationalShippingTwd: Number.isFinite(intlShipping)
      ? intlShipping
      : DEFAULT_INTL_SHIPPING_TWD,
    domesticShippingTwd: Number.isFinite(domesticShipping)
      ? domesticShipping
      : DEFAULT_DOMESTIC_SHIPPING_TWD,
    promoTagMaxTwd: Number.isFinite(promoTagMaxTwd) ? promoTagMaxTwd : DEFAULT_PROMO_TAG_MAX_TWD,
    limitedProxyShippingTwd: Number.isFinite(limitedProxyShippingTwd)
      ? limitedProxyShippingTwd
      : DEFAULT_LIMITED_PROXY_SHIPPING_TWD,
    shippingOptionsEnabled:
      Number.isFinite(shippingOptionsEnabled) && shippingOptionsEnabled === 0 ? false : true,
  };
}

export async function handlePublicPricing(request: Request, ctx: RequestContext): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }
  const config = await getPricingConfig(ctx.db, ctx.storeId);
  return new Response(JSON.stringify({ ok: true, pricing: config }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function handleAdminPricing(request: Request, ctx: RequestContext): Promise<Response> {
  if (request.method === "GET") {
    const config = await getPricingConfig(ctx.db, ctx.storeId);
    return new Response(JSON.stringify({ ok: true, pricing: config }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  let body: {
    markupJpy?: number;
    markupMode?: string;
    markupPercent?: number;
    jpyToTwd?: number;
    internationalShippingTwd?: number;
    internationalShippingJpy?: number;
    domesticShippingTwd?: number;
    promoTagMaxTwd?: number;
    limitedProxyShippingTwd?: number;
    shippingOptionsEnabled?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const markupJpy = Number(body.markupJpy);
  const markupMode = body.markupMode === "percent" ? "percent" : "flat";
  const markupPercent = Number(body.markupPercent ?? DEFAULT_MARKUP_PERCENT);
  const jpyToTwd = Number(body.jpyToTwd);
  const internationalShippingTwd = Number(
    body.internationalShippingTwd ?? body.internationalShippingJpy
  );
  const domesticShippingTwd = Number(body.domesticShippingTwd);
  const promoTagMaxTwd = Number(body.promoTagMaxTwd);
  const limitedProxyShippingTwd = Number(body.limitedProxyShippingTwd);
  const shippingOptionsEnabled = body.shippingOptionsEnabled === false ? 0 : 1;
  if (!Number.isFinite(markupJpy) || markupJpy < 0) {
    return new Response(JSON.stringify({ ok: false, error: "markupJpy must be >= 0" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent > 100) {
    return new Response(JSON.stringify({ ok: false, error: "markupPercent must be 0-100" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!Number.isFinite(jpyToTwd) || jpyToTwd <= 0) {
    return new Response(JSON.stringify({ ok: false, error: "jpyToTwd must be > 0" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  if (!Number.isFinite(internationalShippingTwd) || internationalShippingTwd < 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "internationalShippingTwd must be >= 0" }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }
  if (!Number.isFinite(domesticShippingTwd) || domesticShippingTwd < 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "domesticShippingTwd must be >= 0" }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }
  if (!Number.isFinite(promoTagMaxTwd) || promoTagMaxTwd < 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "promoTagMaxTwd must be >= 0" }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }
  if (!Number.isFinite(limitedProxyShippingTwd) || limitedProxyShippingTwd < 0) {
    return new Response(
      JSON.stringify({ ok: false, error: "limitedProxyShippingTwd must be >= 0" }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }

  await ensureSettingsTable(ctx.db);
  await ctx.db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'markup_jpy', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(ctx.storeId, String(markupJpy))
    .run();
  await ctx.db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'markup_mode', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(ctx.storeId, markupMode)
    .run();
  await ctx.db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'markup_percent', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(ctx.storeId, String(markupPercent))
    .run();
  await ctx.db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'jpy_to_twd', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(ctx.storeId, String(jpyToTwd))
    .run();
  await ctx.db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'international_shipping_twd', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(ctx.storeId, String(internationalShippingTwd))
    .run();
  await ctx.db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'domestic_shipping_twd', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(ctx.storeId, String(domesticShippingTwd))
    .run();
  await ctx.db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'promo_tag_max_twd', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(ctx.storeId, String(promoTagMaxTwd))
    .run();
  await ctx.db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'limited_proxy_shipping_twd', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(ctx.storeId, String(limitedProxyShippingTwd))
    .run();
  await ctx.db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'shipping_options_enabled', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(ctx.storeId, String(shippingOptionsEnabled))
    .run();

  return new Response(
    JSON.stringify({
      ok: true,
      pricing: {
        markupJpy,
        markupMode,
        markupPercent,
        jpyToTwd,
        internationalShippingTwd,
        domesticShippingTwd,
        promoTagMaxTwd,
        limitedProxyShippingTwd,
        shippingOptionsEnabled: shippingOptionsEnabled === 1,
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
}
