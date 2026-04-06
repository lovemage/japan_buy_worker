import type { RequestContext } from "../../context";
import { getGeminiApiKey, getAiModel, getOpenRouterApiKey, getOpenRouterModel, getGeminiModel } from "./settings";

const TONE_MAP: Record<string, string> = {
  professional: "專業、有信賴感的語氣，用詞精準，強調品質與服務",
  friendly: "親切溫暖的語氣，像朋友推薦好物，用「你」稱呼讀者",
  list: "條列式重點整理，簡潔有力，方便快速瀏覽",
  lively: "活潑有趣、帶點俏皮的語氣，善用表情符號和流行用語",
};

const PLATFORM_MAP: Record<string, string> = {
  line: "Line 群組/官方帳號貼文，適合較長的推薦文，可分段，含商品連結",
  threads: "Threads 貼文，簡短有力，500字以內，適合引起討論",
  "ig-post": "Instagram 貼文文案，搭配照片使用，含 hashtag，字數適中",
  "ig-reels": "Instagram Reels 短影片腳本，包含開場hook、重點、結尾CTA，15-30秒節奏",
  fb: "Facebook 貼文，可較長，適合社團或粉專發文，含互動引導",
  other: "通用社群行銷文案，適用於各種平台",
};

const PLATFORM_OUTPUT_RULES: Record<string, string> = {
  line: "輸出 1 則 Line 貼文，2-4 段，語句自然，保留清楚行動呼籲。",
  threads: "輸出 1 則 Threads 貼文，精簡有力，控制在 500 字內。",
  "ig-post": "輸出 1 則 Instagram 貼文文案，末段附上 5-10 個相關 hashtag。",
  "ig-reels": "輸出 1 則 Instagram Reels 腳本，分成開場 Hook、重點內容、結尾 CTA，標示大致秒數節奏。",
  fb: "輸出 1 則 Facebook 貼文，可稍長，包含互動引導問題。",
  other: "輸出 1 則通用社群貼文文案，適合多數平台直接使用。",
};

const MONTHLY_LIMITS: Record<string, number> = {
  free: 3,
  starter: 6,
  pro: 12,
};

function getMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function handleMarketingUsage(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

  const plan = ctx.storePlan || "free";
  const limit = MONTHLY_LIMITS[plan] ?? 5;
  const monthKey = getMonthKey();
  const settingKey = `ai_marketing_count_${monthKey}`;

  const row = await ctx.db
    .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = ?")
    .bind(ctx.storeId, settingKey)
    .first<{ value: string }>();
  const used = parseInt(row?.value || "0", 10);

  return json({ ok: true, used, limit });
}

export async function handleMarketing(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  // Check usage limit
  const plan = ctx.storePlan || "free";
  const limit = MONTHLY_LIMITS[plan] ?? 5;
  const monthKey = getMonthKey();
  const settingKey = `ai_marketing_count_${monthKey}`;

  if (limit !== -1) {
    const row = await ctx.db
      .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = ?")
      .bind(ctx.storeId, settingKey)
      .first<{ value: string }>();
    const used = parseInt(row?.value || "0", 10);
    if (used >= limit) {
      return json({ ok: false, error: `本月 AI 行銷次數已達上限（${limit} 次）。升級方案可獲得更多次數。` }, 403);
    }
  }

  // Parse body
  let body: { tone?: string; platform?: string };
  try {
    body = (await request.json()) as { tone?: string; platform?: string };
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const tone = TONE_MAP[body.tone || "professional"] || TONE_MAP.professional;
  const platformKey = body.platform || "line";
  const platform = PLATFORM_MAP[platformKey] || PLATFORM_MAP.line;
  const platformOutputRule = PLATFORM_OUTPUT_RULES[platformKey] || PLATFORM_OUTPUT_RULES.line;

  // Gather store context
  const storeInfo = await ctx.db
    .prepare("SELECT name, slug, destination_country, plan FROM stores WHERE id = ?")
    .bind(ctx.storeId)
    .first<{ name: string; slug: string; destination_country: string; plan: string }>();

  const storeName = storeInfo?.name || "我的商店";
  const country = storeInfo?.destination_country || "tw";
  const slug = storeInfo?.slug || "";
  const storePlan = storeInfo?.plan || "free";

  // Get store rules
  const rulesRow = await ctx.db
    .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'display_settings'")
    .bind(ctx.storeId)
    .first<{ value: string }>();
  let storeRules = "";
  if (rulesRow?.value) {
    try {
      const ds = JSON.parse(rulesRow.value);
      storeRules = ds.storeRules || "";
    } catch {}
  }

  // Build store URL
  const mainDomain = "vovosnap.com";
  let storeUrl: string;
  if (slug && storePlan === "pro") {
    storeUrl = `https://${slug}.${mainDomain}`;
  } else if (slug) {
    storeUrl = `https://${mainDomain}/s/${slug}`;
  } else {
    storeUrl = `https://${mainDomain}`;
  }

  // Get products (top 20 active)
  const products = await ctx.db
    .prepare("SELECT source_product_code AS code, title_ja, title_zh_tw, brand, category, price_jpy_tax_in FROM products WHERE store_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 20")
    .bind(ctx.storeId)
    .all<{ code: string; title_ja: string; title_zh_tw: string; brand: string; category: string; price_jpy_tax_in: number }>();

  const returnTo = storePlan === "pro" ? "/" : `/s/${slug}/`;
  const productList = (products.results || []).map((p, i) => {
    const name = p.title_zh_tw || p.title_ja;
    const link = `${storeUrl}/product?code=${encodeURIComponent(p.code || "")}&returnTo=${encodeURIComponent(returnTo)}`;
    return `${i + 1}. ${name}${p.brand ? ` (${p.brand})` : ""} - ${link}`;
  }).join("\n");

  const countryNames: Record<string, string> = { jp: "日本", kr: "韓國", th: "泰國", tw: "台灣" };
  const countryName = countryNames[country] || country;

  // Build prompt
  const prompt = `你是一位專業的社群行銷文案撰寫專家。請根據以下資訊，為代購商店撰寫一篇行銷文案。

## 商店資訊
- 商店名稱：${storeName}
- 代購來源國：${countryName}
- 商店連結：${storeUrl}
${storeRules ? `- 賣場規則：${storeRules}` : ""}

## 目前上架商品
${productList || "（尚無商品）"}

## 要求
- 語氣風格：${tone}
- 目標平台：${platform}
- 只輸出「1 種」平台版本，且必須符合目標平台格式
- 絕對不要提供其他平台版本、替代版本、平台比較或多段選項
- 平台輸出規格：${platformOutputRule}
- 文案中自然融入商店連結（${storeUrl}）
- 如適合，可提及幾個熱門商品名稱作為推薦
- 文案需為繁體中文
- 直接輸出文案內容，不要加其他說明`;

  // Call AI
  const aiModel = await getAiModel(ctx.db, ctx.storeId, plan);
  const useOpenRouter = aiModel === "v2" && plan === "pro";

  let content: string;

  if (useOpenRouter) {
    const apiKey = await getOpenRouterApiKey(ctx.db);
    const modelId = await getOpenRouterModel(ctx.db);
    if (!apiKey || !modelId) {
      return json({ ok: false, error: "OpenRouter 設定不完整，請聯繫平台管理員" }, 400);
    }

    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!orRes.ok) {
      const errText = await orRes.text().catch(() => "");
      return json({ ok: false, error: `AI 產生失敗 (${orRes.status})：${errText.slice(0, 200)}` }, 502);
    }

    const orData = (await orRes.json()) as { choices?: Array<{ message?: { content?: string } }> };
    content = orData?.choices?.[0]?.message?.content || "";
  } else {
    const apiKey = await getGeminiApiKey(ctx.db, ctx.storeId, plan);
    if (!apiKey) {
      return json({ ok: false, error: "API Key 尚未設定" }, 400);
    }

    const geminiModelId = await getGeminiModel(ctx.db);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModelId}:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      return json({ ok: false, error: `AI 產生失敗 (${geminiRes.status})：${errText.slice(0, 200)}` }, 502);
    }

    const geminiData = (await geminiRes.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    content = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  if (!content) {
    return json({ ok: false, error: "AI 未回傳結果" }, 502);
  }

  // Increment usage counter
  await ctx.db
    .prepare(
      `INSERT INTO app_settings (store_id, key, value, updated_at)
       VALUES (?, ?, '1', datetime('now'))
       ON CONFLICT(store_id, key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = datetime('now')`
    )
    .bind(ctx.storeId, settingKey)
    .run();

  return json({ ok: true, content });
}
