import type { RequestContext } from "../../context";
import { getGeminiApiKey, getAiModel, getOpenRouterApiKey, getOpenRouterModel, getGeminiModel } from "./settings";

const TONE_MAP: Record<string, string> = {
  professional: "專業、有信賴感的語氣，用詞精準，強調品質與服務",
  friendly: "親切溫暖的語氣，像朋友推薦好物，用「你」稱呼讀者",
  list: "條列式重點整理，簡潔有力，方便快速瀏覽",
  lively: "活潑有趣、帶點俏皮的語氣，善用表情符號和流行用語",
};

const PLATFORM_PROMPTS: Record<string, string> = {
  line: `## 平台：LINE 群組 / 官方帳號貼文
- 字數：300-500 字，分 2-4 段，段落之間空一行
- 連結處理：LINE 內連結可直接點擊且會顯示預覽卡片，將商店連結獨立放一行，前後各空一行，讓預覽卡片完整顯示
- 格式：純文字，可用少量表情符號點綴段落開頭（每段最多 1 個），不要用 Markdown 或 HTML
- 結構：開場情境引入 → 商品亮點推薦 → 商店連結（獨立一行）→ 行動呼籲（下單方式/截止時間）
- 語感：像在群組裡跟朋友說話，自然不刻意，避免廣告感太重`,

  threads: `## 平台：Threads 貼文
- 字數：嚴格控制在 300 字以內（Threads 超過 500 字會被截斷，但 300 字內閱讀效果最佳）
- 連結處理：Threads 貼文內的連結不會顯示預覽，且外觀不好看。將商店連結放在文末最後一行，格式為「逛逛 → {連結}」，不要在文中重複貼連結
- 格式：純文字短段落，每段 1-2 句，節奏輕快。可用 1-2 個表情符號但不要過度
- 結構：一句話 hook → 痛點或情境 → 解決方案/商品亮點 → 連結
- 語感：像發推文一樣精簡，要有觀點或態度，適合引起討論和轉發`,

  "ig-post": `## 平台：Instagram 貼文（Feed Post）
- 字數：150-300 字為最佳（IG 貼文上限 2200 字，但多數人只看前兩行）
- 連結處理：IG 貼文內的連結「不可點擊」，絕對不要把網址貼在文案中。改用引導語：「連結在個人檔案」或「點限動連結」
- 格式：第一行就要吸睛（會顯示在摺疊前）。正文用短段落。末段附 8-15 個相關 hashtag，hashtag 與正文之間空一行
- 結構：吸睛第一行 → 情境描述/商品推薦 → 行動呼籲「連結在個人檔案」 → 空行 → hashtag 區塊
- Hashtag 規則：混合大標籤（#代購 #日本代購）和長尾標籤（#日本藥妝推薦 #代購好物分享），不要自創無人搜尋的標籤
- 語感：視覺導向、簡潔有力，搭配照片使用，文案是輔助不是主角`,

  "ig-reels": `## 平台：Instagram Reels 短影片腳本
- 總長度：15-30 秒的口語腳本，約 80-150 字
- 連結處理：Reels 說明欄的連結不可點擊。在腳本結尾用口語引導：「連結放在我的個人檔案」，不要在腳本中念出網址
- 格式：分成三段，每段標示秒數。純口語稿，是「要講的話」不是「要寫的字」
- 結構：
  [0-5秒] Hook — 用問句或驚人數字抓住注意力，前 3 秒決定觀眾會不會繼續看
  [5-20秒] 內容 — 展示商品亮點或使用場景，語速自然不要太趕
  [20-30秒] CTA — 行動呼籲，引導到個人檔案連結
- 語感：口語化、有節奏感，像在跟一個朋友講話而不是念稿`,

  fb: `## 平台：Facebook 貼文（粉專/社團）
- 字數：200-400 字（FB 沒有嚴格限制，但太長會被摺疊，前 3 行最關鍵）
- 連結處理：FB 貼文的連結會自動生成預覽卡片。將商店連結放在文末獨立一行，FB 會自動抓取預覽圖和標題。不要在文中重複貼連結
- 格式：前 3 行要能獨立吸引點擊「查看更多」。段落間空行。可用少量表情符號
- 結構：吸睛開場（問句或共鳴句）→ 內容/商品推薦 → 互動引導（留言問句）→ 商店連結（獨立一行）
- 互動引導：結尾加一個引導留言的問句，例如「你最想帶哪一款？留言告訴我」
- 語感：親切但有資訊量，適合社團或粉專的交流氛圍`,

  other: `## 平台：通用社群文案
- 字數：200-350 字
- 連結處理：將商店連結自然放在文末，格式為獨立一行
- 格式：純文字，分段清楚，可用少量表情符號
- 結構：開場 → 商品亮點 → 行動呼籲 → 連結
- 語感：通用格式，可直接複製到多數平台使用`,
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
  const platformPrompt = PLATFORM_PROMPTS[platformKey] || PLATFORM_PROMPTS.other;

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
  const prompt = `你是一位專業的社群行銷文案撰寫專家，擅長針對不同平台特性產出最適合的文案格式。

## 商店資訊
- 商店名稱：${storeName}
- 代購來源國：${countryName}
- 商店連結：${storeUrl}
${storeRules ? `- 賣場規則：${storeRules}` : ""}

## 目前上架商品
${productList || "（尚無商品）"}

${platformPrompt}

## 語氣風格
${tone}

## 通用規則
- 只輸出「1 種」文案，絕對不要提供其他平台版本、替代版本或多段選項
- 如適合，可提及幾個熱門商品名稱作為推薦
- 文案需為繁體中文

## 輸出格式（嚴格遵守）
- 直接輸出文案本體，第一個字就是文案內容
- 禁止在文案前後加上任何前綴、後綴、說明、標題或註解
- 禁止輸出「好的」「以下是」「完成」「希望這篇」等引導語
- 禁止輸出 Markdown 標題（#）或分隔線（---）
- 使用者會直接複製你的輸出貼到社群平台，任何多餘文字都會造成困擾`;

  // Call AI
  const aiModel = await getAiModel(ctx.db, ctx.storeId, plan);
  const useOpenRouter = aiModel === "v2" && plan === "pro";

  let content: string;

  if (useOpenRouter) {
    const apiKey = await getOpenRouterApiKey(ctx.db);
    const modelId = await getOpenRouterModel(ctx.db);
    if (!apiKey || !modelId) {
      return json({ ok: false, error: "AI 功能設定不完整，請聯繫 vovosnap 管理員處理" }, 400);
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
  const mk = getMonthKey();
  await Promise.all([
    ctx.db
      .prepare(
        `INSERT INTO app_settings (store_id, key, value, updated_at)
         VALUES (?, ?, '1', datetime('now'))
         ON CONFLICT(store_id, key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = datetime('now')`
      )
      .bind(ctx.storeId, settingKey)
      .run(),
    ctx.db
      .prepare(
        `INSERT INTO api_usage_logs (store_id, api_type, month_key, call_count, last_called_at)
         VALUES (?, 'marketing', ?, 1, datetime('now'))
         ON CONFLICT(store_id, api_type, month_key) DO UPDATE SET call_count = call_count + 1, last_called_at = datetime('now')`
      )
      .bind(ctx.storeId, mk)
      .run(),
  ]);

  return json({ ok: true, content });
}
