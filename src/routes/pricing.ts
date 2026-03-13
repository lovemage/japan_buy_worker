import type { D1DatabaseLike } from "../types/d1";
import { isAdminAuthorized } from "./admin/auth";

type Env = {
  DB: D1DatabaseLike;
};

type SettingRow = {
  key: string;
  value: string;
};

const DEFAULT_MARKUP_JPY = 1000;
const DEFAULT_JPY_TO_TWD = 0.21;
const DEFAULT_INTL_SHIPPING_TWD = 350;
const DEFAULT_DOMESTIC_SHIPPING_TWD = 60;

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

export async function getPricingConfig(db: D1DatabaseLike): Promise<{
  markupJpy: number;
  jpyToTwd: number;
  internationalShippingTwd: number;
  domesticShippingTwd: number;
}> {
  await ensureSettingsTable(db);
  await db
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('markup_jpy', ?, datetime('now')) ON CONFLICT(key) DO NOTHING"
    )
    .bind(String(DEFAULT_MARKUP_JPY))
    .run();
  await db
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('jpy_to_twd', ?, datetime('now')) ON CONFLICT(key) DO NOTHING"
    )
    .bind(String(DEFAULT_JPY_TO_TWD))
    .run();
  await db
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('international_shipping_twd', ?, datetime('now')) ON CONFLICT(key) DO NOTHING"
    )
    .bind(String(DEFAULT_INTL_SHIPPING_TWD))
    .run();
  await db
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('domestic_shipping_twd', ?, datetime('now')) ON CONFLICT(key) DO NOTHING"
    )
    .bind(String(DEFAULT_DOMESTIC_SHIPPING_TWD))
    .run();

  const rows = await db
    .prepare(
      "SELECT key, value FROM app_settings WHERE key IN ('markup_jpy','jpy_to_twd','international_shipping_twd','international_shipping_jpy','domestic_shipping_twd')"
    )
    .all<SettingRow>();
  const result = Array.isArray(rows?.results) ? rows.results : [];
  const markupRaw = result.find((x) => x.key === "markup_jpy")?.value;
  const rateRaw = result.find((x) => x.key === "jpy_to_twd")?.value;
  const intlShippingRaw =
    result.find((x) => x.key === "international_shipping_twd")?.value ||
    result.find((x) => x.key === "international_shipping_jpy")?.value;
  const domesticShippingRaw = result.find((x) => x.key === "domestic_shipping_twd")?.value;

  const markup = Number(markupRaw);
  const rate = Number(rateRaw);
  const intlShipping = Number(intlShippingRaw);
  const domesticShipping = Number(domesticShippingRaw);
  return {
    markupJpy: Number.isFinite(markup) ? markup : DEFAULT_MARKUP_JPY,
    jpyToTwd: Number.isFinite(rate) ? rate : DEFAULT_JPY_TO_TWD,
    internationalShippingTwd: Number.isFinite(intlShipping)
      ? intlShipping
      : DEFAULT_INTL_SHIPPING_TWD,
    domesticShippingTwd: Number.isFinite(domesticShipping)
      ? domesticShipping
      : DEFAULT_DOMESTIC_SHIPPING_TWD,
  };
}

export async function handlePublicPricing(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }
  const config = await getPricingConfig(env.DB);
  return new Response(JSON.stringify({ ok: true, pricing: config }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function handleAdminPricing(request: Request, env: Env): Promise<Response> {
  if (!isAdminAuthorized(request)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  if (request.method === "GET") {
    const config = await getPricingConfig(env.DB);
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
    jpyToTwd?: number;
    internationalShippingTwd?: number;
    internationalShippingJpy?: number;
    domesticShippingTwd?: number;
  };
  try {
    body = (await request.json()) as {
      markupJpy?: number;
      jpyToTwd?: number;
      internationalShippingTwd?: number;
      internationalShippingJpy?: number;
      domesticShippingTwd?: number;
    };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const markupJpy = Number(body.markupJpy);
  const jpyToTwd = Number(body.jpyToTwd);
  const internationalShippingTwd = Number(
    body.internationalShippingTwd ?? body.internationalShippingJpy
  );
  const domesticShippingTwd = Number(body.domesticShippingTwd);
  if (!Number.isFinite(markupJpy) || markupJpy < 0) {
    return new Response(JSON.stringify({ ok: false, error: "markupJpy must be >= 0" }), {
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

  await ensureSettingsTable(env.DB);
  await env.DB
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('markup_jpy', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(String(markupJpy))
    .run();
  await env.DB
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('jpy_to_twd', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(String(jpyToTwd))
    .run();
  await env.DB
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('international_shipping_twd', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(String(internationalShippingTwd))
    .run();
  await env.DB
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES ('domestic_shipping_twd', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(String(domesticShippingTwd))
    .run();

  return new Response(
    JSON.stringify({
      ok: true,
      pricing: { markupJpy, jpyToTwd, internationalShippingTwd, domesticShippingTwd },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
}
