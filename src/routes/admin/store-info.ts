import type { RequestContext } from "../../context";
import { normalizeSlug, getSlugValidationError, canChangeSlugOnceForPro } from "../../shared/slug-rules.js";
import { getGeminiApiKey } from "./settings";

// Country → currency mapping
export const COUNTRY_CONFIG: Record<string, { currency: string; currencySymbol: string; currencyLabel: string; defaultRate: number; defaultMarkup: number }> = {
  jp: { currency: "JPY", currencySymbol: "¥", currencyLabel: "日圓", defaultRate: 0.21, defaultMarkup: 1000 },
  kr: { currency: "KRW", currencySymbol: "₩", currencyLabel: "韓元", defaultRate: 0.024, defaultMarkup: 5000 },
  th: { currency: "THB", currencySymbol: "฿", currencyLabel: "泰銖", defaultRate: 1.01, defaultMarkup: 50 },
  us: { currency: "USD", currencySymbol: "$", currencyLabel: "美元", defaultRate: 32.5, defaultMarkup: 5 },
  vn: { currency: "VND", currencySymbol: "₫", currencyLabel: "越南盾", defaultRate: 0.0013, defaultMarkup: 50000 },
  eu: { currency: "EUR", currencySymbol: "€", currencyLabel: "歐元", defaultRate: 35, defaultMarkup: 5 },
  au: { currency: "AUD", currencySymbol: "A$", currencyLabel: "澳幣", defaultRate: 21, defaultMarkup: 10 },
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
      .prepare("SELECT id, slug, name, description, owner_email, destination_country, display_currency, line_id, plan, plan_expires_at, slug_change_used FROM stores WHERE id = ?")
      .bind(ctx.storeId)
      .first<{ id: number; slug: string; name: string; description: string; owner_email: string; destination_country: string; display_currency: string; line_id: string | null; plan: string; plan_expires_at: string | null; slug_change_used: number }>();

    if (!store) return json({ ok: false, error: "Store not found" }, 404);

    const countryConf = COUNTRY_CONFIG[store.destination_country] || COUNTRY_CONFIG["tw"];

    return json({
      ok: true,
      store: {
        ...store,
        effective_plan: ctx.storePlan,
        can_change_slug_once: canChangeSlugOnceForPro({
          effectivePlan: ctx.storePlan,
          slugChangeUsed: store.slug_change_used,
        }),
        countryConfig: countryConf,
      },
      countries: Object.entries(COUNTRY_CONFIG).map(([code, conf]) => ({
        code,
        currency: conf.currency,
        label: { jp: "🇯🇵 日本", kr: "🇰🇷 韓國", th: "🇹🇭 泰國", us: "🇺🇸 美國", vn: "🇻🇳 越南", eu: "🇪🇺 歐洲", au: "🇦🇺 澳洲", tw: "🇹🇼 台灣" }[code] || code,
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
      return json({ ok: false, error: "Invalid country" }, 400);
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
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    // Merge with existing settings to preserve fields not in this request
    const existingRow = await ctx.db
      .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'display_settings'")
      .bind(ctx.storeId)
      .first<{ value: string }>();
    let existing: Record<string, unknown> = {};
    try { if (existingRow?.value) existing = JSON.parse(existingRow.value); } catch {}
    // Strip Pro-only fields for non-Pro plans
    if (ctx.storePlan !== "pro") {
      delete body.tagNames;
      delete body.storeLogo;
    }
    const settings: Record<string, unknown> = { ...existing, ...body };
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

  let body: { name?: string; description?: string };
  try {
    body = (await request.json()) as { name?: string; description?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const name = (body.name || "").trim();
  if (!name || name.length > 100) return json({ ok: false, error: "Name required (max 100 chars)" }, 400);

  const description = (body.description || "").trim().slice(0, 200);

  await ctx.db
    .prepare("UPDATE stores SET name = ?, description = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(name, description, ctx.storeId)
    .run();

  return json({ ok: true });
}

export async function handleStoreSlugUpdate(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);

  const store = await ctx.db
    .prepare("SELECT slug_change_used FROM stores WHERE id = ?")
    .bind(ctx.storeId)
    .first<{ slug_change_used: number }>();
  if (!store) return json({ ok: false, error: "Store not found" }, 404);

  if (!canChangeSlugOnceForPro({ effectivePlan: ctx.storePlan, slugChangeUsed: store.slug_change_used })) {
    return json({ ok: false, error: "Pro members can change slug only once" }, 403);
  }

  let body: { slug?: string };
  try {
    body = (await request.json()) as { slug?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const slug = normalizeSlug(body.slug || "");
  const slugError = getSlugValidationError(slug);
  if (slugError) return json({ ok: false, error: slugError }, 400);

  const existing = await ctx.db
    .prepare("SELECT id FROM stores WHERE slug = ? AND id != ?")
    .bind(slug, ctx.storeId)
    .first();
  if (existing) {
    return json({ ok: false, error: "This slug is already taken" }, 400);
  }

  await ctx.db
    .prepare("UPDATE stores SET slug = ?, subdomain = ?, slug_change_used = 1, updated_at = datetime('now') WHERE id = ?")
    .bind(slug, slug, ctx.storeId)
    .run();

  return json({
    ok: true,
    slug,
    redirectUrl: `/s/${slug}/admin`,
  });
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

// ── Template selection ──
const TEMPLATES: Record<string, { name: string; plans: string[] }> = {
  default:      { name: "抹茶暖色", plans: ["free", "plus", "pro", "proplus"] },
  "ink-blue":   { name: "墨藍",     plans: ["pro", "proplus"] },
  sand:         { name: "暖沙灰",   plans: ["proplus"] },
  moss:         { name: "苔蘚灰綠", plans: ["proplus"] },
  slate:        { name: "石板灰藍", plans: ["proplus"] },
  "bold-gold":  { name: "白黃黑",   plans: ["proplus"] },
  "bold-ocean": { name: "白藍黑",   plans: ["proplus"] },
};

export { TEMPLATES };

export async function handleTemplate(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method === "GET") {
    const row = await ctx.db
      .prepare("SELECT template, plan FROM stores WHERE id = ?")
      .bind(ctx.storeId)
      .first<{ template: string; plan: string }>();
    const current = row?.template || "default";
    const plan = row?.plan || "free";
    const available = Object.entries(TEMPLATES)
      .filter(([, v]) => v.plans.includes(plan))
      .map(([k, v]) => ({ id: k, name: v.name, active: k === current }));
    return json({ ok: true, current, templates: available });
  }

  if (request.method === "POST") {
    const body = (await request.json()) as { template: string };
    const tpl = body?.template;
    if (!tpl || !TEMPLATES[tpl]) {
      return json({ ok: false, error: "Invalid template" }, 400);
    }
    // Check plan permission
    const row = await ctx.db
      .prepare("SELECT plan FROM stores WHERE id = ?")
      .bind(ctx.storeId)
      .first<{ plan: string }>();
    const plan = row?.plan || "free";
    if (!TEMPLATES[tpl].plans.includes(plan)) {
      return json({ ok: false, error: "此模板需要升級方案才能使用" }, 403);
    }
    await ctx.db
      .prepare("UPDATE stores SET template = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(tpl, ctx.storeId)
      .run();
    return json({ ok: true, template: tpl });
  }

  return json({ ok: false, error: "Method not allowed" }, 405);
}

// ── Banner (店招) management ── Pro / ProPlus only ──

export async function handleBannerSettings(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method === "GET") {
    const row = await ctx.db
      .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'banner_settings'")
      .bind(ctx.storeId)
      .first<{ value: string }>();

    if (!row?.value) return json({ ok: true, enabled: false, images: [] });

    try {
      const data = JSON.parse(row.value);
      return json({ ok: true, enabled: !!data.enabled, images: data.images || [] });
    } catch {
      return json({ ok: true, enabled: false, images: [] });
    }
  }

  if (request.method === "POST") {
    if (ctx.storePlan !== "pro" && ctx.storePlan !== "proplus") {
      return json({ ok: false, error: "此功能需要 Pro 或 Pro+ 方案" }, 403);
    }

    let body: { enabled?: boolean; images?: string[] };
    try {
      body = (await request.json()) as { enabled?: boolean; images?: string[] };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }

    const images = (body.images || []).slice(0, 3);
    const enabled = !!body.enabled;

    await ctx.db
      .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'banner_settings', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
      .bind(ctx.storeId, JSON.stringify({ enabled, images }))
      .run();

    return json({ ok: true });
  }

  return json({ ok: false, error: "Method Not Allowed" }, 405);
}

// Upload banner image (client converts to WebP, base64 → R2)
export async function handleBannerUpload(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);
  if (!ctx.r2) return json({ ok: false, error: "R2 not configured" }, 500);
  if (ctx.storePlan !== "pro" && ctx.storePlan !== "proplus") {
    return json({ ok: false, error: "此功能需要 Pro 或 Pro+ 方案" }, 403);
  }

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

  const key = `${ctx.storeId}/banners/${Date.now()}.webp`;
  await ctx.r2.put(key, bytes.buffer, {
    httpMetadata: { contentType: "image/webp" },
  });

  return json({ ok: true, key });
}

// Delete banner image from R2
export async function handleBannerDelete(
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
  if (!body.key.startsWith(`${ctx.storeId}/`)) {
    return json({ ok: false, error: "Unauthorized" }, 403);
  }

  await ctx.r2.delete(body.key);
  return json({ ok: true });
}

// AI Banner generation
const BANNER_STYLE_PROMPTS: Record<string, string> = {
  japanese: "日式和風設計：使用柔和的配色（如櫻花粉、抹茶綠、靛藍），融入和風紋樣、書法字體風格、簡約禪意留白，整體氛圍溫暖優雅",
  american: "美式現代設計：大膽鮮明的配色、現代無襯線字體、幾何形狀元素，風格簡潔有力、充滿活力與商業感",
  taiwanese: "台灣在地風格設計：融入台灣意象（如夜市霓虹、復古招牌、繽紛色彩），親切熱鬧、充滿人情味的視覺風格",
  minimalist: "簡約設計風格：極簡主義配色（黑白灰為主搭配一個強調色），大量留白、清晰的排版層次、現代優雅感",
  luxury: "奢華精品設計風格：深色背景搭配金色或香檳色點綴、精緻的裝飾元素、優雅的襯線字體，營造高級尊貴感",
};

const BANNER_GEN_LIMITS: Record<string, number> = {
  free: 0,
  plus: 0,
  pro: 5,
  proplus: -1,
};

export async function handleBannerGenerate(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);
  if (ctx.storePlan !== "pro" && ctx.storePlan !== "proplus") {
    return json({ ok: false, error: "此功能需要 Pro 或 Pro+ 方案" }, 403);
  }

  // Rate limit
  const limit = BANNER_GEN_LIMITS[ctx.storePlan] ?? 0;
  if (limit !== -1) {
    const now = new Date();
    const monthKey = `ai_banner_gen_count_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
    const usage = await ctx.db
      .prepare("SELECT COALESCE((SELECT value FROM app_settings WHERE store_id = ? AND key = ?), '0') as cnt")
      .bind(ctx.storeId, monthKey)
      .first<{ cnt: string }>();
    const count = parseInt(usage?.cnt || "0", 10);
    if (count >= limit) {
      return json({ ok: false, error: `本月 AI 招牌生成次數已用完（${limit} 次/月）。升級方案可獲得更多次數。` }, 403);
    }
  }

  let body: { storeName?: string; eventName?: string; eventMessage?: string; style?: string; description?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const storeName = (body.storeName || "").trim();
  const eventName = (body.eventName || "").trim();
  const eventMessage = (body.eventMessage || "").trim();
  const style = body.style || "japanese";
  const description = (body.description || "").trim();

  if (!storeName) return json({ ok: false, error: "請輸入商店名稱" }, 400);

  const stylePrompt = BANNER_STYLE_PROMPTS[style] || BANNER_STYLE_PROMPTS.japanese;

  // Get banner-specific API settings (fallback to image_gen settings)
  const bannerSettings = await ctx.db
    .prepare("SELECT key, value FROM app_settings WHERE store_id = 0 AND key IN ('banner_provider', 'banner_api_key', 'banner_model', 'image_gen_api_key', 'image_gen_model')")
    .all<{ key: string; value: string }>();
  const settingsMap: Record<string, string> = {};
  for (const row of bannerSettings.results) settingsMap[row.key] = row.value;

  const provider = settingsMap["banner_provider"] || "gemini";
  let apiKey = settingsMap["banner_api_key"] || settingsMap["image_gen_api_key"] || "";
  if (!apiKey) apiKey = await getGeminiApiKey(ctx.db, ctx.storeId, ctx.storePlan);
  if (!apiKey) {
    return json({ ok: false, error: "AI 招牌生成功能尚未啟用，請聯繫 vovosnap 管理員處理" }, 400);
  }
  const modelId = settingsMap["banner_model"] || settingsMap["image_gen_model"] || "gemini-2.5-flash-preview-image-generation";

  const prompt = `Generate a professional e-commerce store banner image with 16:9 aspect ratio.

## Banner requirements
- Store name: "${storeName}"
- ${eventName ? `Event/campaign name: "${eventName}"` : "No specific event"}
- ${eventMessage ? `Promotional message: "${eventMessage}"` : "No promotional message"}
- Visual style: ${stylePrompt}
${description ? `- Additional description: ${description}` : ""}

## Design rules
- Output aspect ratio MUST be 16:9 (wide banner format, e.g. 1920x1080 or 1280x720)
- The store name "${storeName}" must be prominently displayed and clearly readable
${eventName ? `- The event name "${eventName}" should be visible as a secondary heading` : ""}
${eventMessage ? `- The message "${eventMessage}" should appear as supporting text` : ""}
- Use high-quality, professional design suitable for an online store homepage
- Text must be crisp and clearly legible
- DO NOT add any watermarks
- Create a visually appealing composition with proper hierarchy of information
- Ensure the overall design feels cohesive and polished`;

  let imageData: string | undefined;
  let outputMimeFromApi = "image/png";

  if (provider === "openrouter") {
    // OpenRouter path (text-to-image via chat completions)
    let orRes: Response;
    try {
      orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch (err) {
      return json({ ok: false, error: `OpenRouter API 連線失敗：${String(err)}` }, 502);
    }
    if (!orRes.ok) {
      const errText = await orRes.text().catch(() => "");
      return json({ ok: false, error: `OpenRouter API 錯誤 (${orRes.status})：${errText.slice(0, 300)}` }, 502);
    }
    const orData = (await orRes.json()) as Record<string, any>;
    const content = orData?.choices?.[0]?.message?.content || "";
    // OpenRouter image models may return base64 in content or as image_url
    const imgMatch = content.match(/data:image\/(png|webp|jpeg);base64,([A-Za-z0-9+/=]+)/);
    if (imgMatch) {
      outputMimeFromApi = `image/${imgMatch[1]}`;
      imageData = imgMatch[2];
    }
    if (!imageData) {
      return json({ ok: false, error: "AI 無法生成招牌圖片（OpenRouter 未回傳圖片）", debug: content.slice(0, 200) }, 502);
    }
  } else {
    // Gemini path
    const geminiBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
    };
    const geminiUrl = `https://generativelanguage.googleapis.com/v1alpha/models/${modelId}:generateContent?key=${apiKey}`;

    let geminiRes: Response;
    try {
      geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });
    } catch (err) {
      return json({ ok: false, error: `Gemini API 連線失敗：${String(err)}` }, 502);
    }
    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      return json({ ok: false, error: `Gemini API 錯誤 (${geminiRes.status})：${errText.slice(0, 300)}` }, 502);
    }

    const geminiRaw = await geminiRes.json() as Record<string, any>;
    const candidates = geminiRaw?.candidates || [];
    const parts = candidates[0]?.content?.parts || [];
    const imagePart = parts.find((p: any) => (p.inline_data?.data) || (p.inlineData?.data));
    imageData = imagePart?.inline_data?.data || imagePart?.inlineData?.data;
    if (imageData) {
      outputMimeFromApi = imagePart?.inline_data?.mime_type || imagePart?.inlineData?.mimeType || "image/png";
    }

    if (!imageData) {
      const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text).join(" ");
      return json({ ok: false, error: "AI 無法生成招牌圖片，請稍後再試", debug: textParts.slice(0, 200) }, 502);
    }
  }

  // Upload to R2
  if (!ctx.r2) return json({ ok: false, error: "R2 儲存空間未設定" }, 500);

  const ext = outputMimeFromApi.includes("webp") ? "webp" : "png";
  const r2Key = `${ctx.storeId}/banners/${Date.now()}.${ext}`;
  const binaryString = atob(imageData);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  await ctx.r2.put(r2Key, bytes.buffer, {
    httpMetadata: { contentType: outputMimeFromApi },
  });

  // Increment usage counter
  const now = new Date();
  const monthKey = `ai_banner_gen_count_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthKeyShort = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
  await Promise.all([
    ctx.db
      .prepare(
        `INSERT INTO app_settings (store_id, key, value, updated_at)
         VALUES (?, ?, '1', datetime('now'))
         ON CONFLICT(store_id, key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = datetime('now')`
      )
      .bind(ctx.storeId, monthKey)
      .run(),
    ctx.db
      .prepare(
        `INSERT INTO api_usage_logs (store_id, api_type, month_key, call_count, last_called_at)
         VALUES (?, 'banner_gen', ?, 1, datetime('now'))
         ON CONFLICT(store_id, api_type, month_key) DO UPDATE SET call_count = call_count + 1, last_called_at = datetime('now')`
      )
      .bind(ctx.storeId, monthKeyShort)
      .run(),
  ]).catch(() => {});

  return json({ ok: true, imageUrl: `/api/images/${r2Key}`, key: r2Key });
}
