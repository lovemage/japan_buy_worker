import type { RequestContext } from "../../context";
import type { D1DatabaseLike } from "../../types/d1";
import { getGeminiApiKey, getAiModel, getOpenRouterApiKey, getOpenRouterModel, getGeminiModel } from "./settings";

type RecognizeRequest = {
  images: string[]; // base64 encoded JPEG, max 3
  mode: "quick" | "search"; // quick=純圖片辨識, search=聯網搜尋
};

type RecognizeResult = {
  titleJa: string;
  titleZhTw: string;
  brand: string;
  category: string;
  description: string;
  specs: Record<string, string>;
  priceJpy: number | null;
  sizeOptions: string[];
  colorOptions: string[];
  searchSources: string[];
};

const DEFAULT_RECOGNIZE_PROMPT = `你是商品辨識專家。分析以下商品包裝照片，提取商品資訊並翻譯為繁體中文。

重要安全規則：
如果圖片中的商品為以下類型，必須回傳 {"rejected": true, "reason": "辨識失敗：此商品無法上架"}：
- 管制藥品、毒品、違禁品
- 武器、彈藥
- 仿冒品、明顯的假冒商品
- 色情或暴力內容
- 任何違反法律的商品

若商品合法，請回傳以下 JSON 格式：
{
  "rejected": false,
  "titleJa": "原文商品名（從包裝上讀取）",
  "titleZhTw": "繁體中文商品名（翻譯）",
  "brand": "品牌名",
  "category": "商品分類（例如：保養品、零食、日用品、服飾、文具等）",
  "description": "繁體中文商品描述（50-100字）",
  "specs": { "容量": "...", "成分": "...", "產地": "...", "保存期限": "..." },
  "priceJpy": null,
  "sizeOptions": ["S", "M", "L"],
  "colorOptions": ["紅色", "藍色"],
  "searchSources": []
}

注意事項：
- 如果包裝上有價格標籤，填入 priceJpy（整數）
- 如果無法辨識的欄位，用空字串或空陣列
- specs 只列出能從包裝上看到的規格
- sizeOptions/colorOptions 只列出包裝上標示的選項
- 品牌名保留原文
- category 用繁體中文`;

async function getRecognizePrompt(db: D1DatabaseLike): Promise<string> {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'recognize_prompt'")
    .first<{ value: string }>();
  return row?.value || DEFAULT_RECOGNIZE_PROMPT;
}

const SEARCH_PROMPT_SUFFIX = `

同時請使用搜尋功能查詢這個商品的更多資訊，包括：
- 完整商品規格
- 建議售價
- 可購買的尺寸/顏色選項
- 用戶評價摘要
將搜尋到的資訊整合到回傳的 JSON 中，並在 searchSources 陣列中列出參考來源網址。`;

export async function handleAdminRecognize(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  // Free plan: 5 AI recognize uses total
  if (ctx.storePlan === "free") {
    const usage = await ctx.db
      .prepare("SELECT COALESCE((SELECT value FROM app_settings WHERE store_id = ? AND key = 'ai_recognize_count'), '0') as cnt")
      .bind(ctx.storeId)
      .first<{ cnt: string }>();
    const count = parseInt(usage?.cnt || "0", 10);
    if (count >= 5) {
      return new Response(
        JSON.stringify({ ok: false, error: "Free 方案的 AI 辨識次數已用完（5 次）。升級方案以解鎖無限使用。" }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }
  }

  const aiModel = await getAiModel(ctx.db, ctx.storeId);
  const useOpenRouter = aiModel === "v2" && ctx.storePlan === "pro";

  let apiKey: string;
  if (useOpenRouter) {
    apiKey = await getOpenRouterApiKey(ctx.db);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "OpenRouter API Key 尚未設定，請聯繫平台管理員" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
  } else {
    apiKey = await getGeminiApiKey(ctx.db, ctx.storeId, ctx.storePlan);
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "Gemini API Key 尚未設定，請至 Admin 設定頁填入" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
  }

  let body: RecognizeRequest;
  try {
    body = (await request.json()) as RecognizeRequest;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  if (!Array.isArray(body.images) || body.images.length === 0 || body.images.length > 3) {
    return new Response(
      JSON.stringify({ ok: false, error: "images 需為 1-3 張 base64 圖片" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const mode = body.mode === "search" ? "search" : "quick";
  const basePrompt = await getRecognizePrompt(ctx.db);
  const prompt = mode === "search"
    ? basePrompt + SEARCH_PROMPT_SUFFIX
    : basePrompt;

  let rawText: string;

  if (useOpenRouter) {
    // OpenRouter API (OpenAI-compatible)
    const orModelId = await getOpenRouterModel(ctx.db);
    if (!orModelId) {
      return new Response(
        JSON.stringify({ ok: false, error: "OpenRouter 模型尚未選擇，請至平台管理 API Key 頁面選擇模型" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
    const imageContent = body.images.map((b64) => ({
      type: "image_url" as const,
      image_url: { url: `data:image/jpeg;base64,${b64}` },
    }));

    const orBody = {
      model: orModelId,
      messages: [
        {
          role: "user" as const,
          content: [
            ...imageContent,
            { type: "text" as const, text: prompt + "\n\n請以 JSON 格式回傳結果。" },
          ],
        },
      ],
      response_format: { type: "json_object" as const },
    };

    let orRes: Response;
    try {
      orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(orBody),
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: `OpenRouter API 連線失敗：${String(err)}` }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }

    if (!orRes.ok) {
      const errText = await orRes.text().catch(() => "");
      return new Response(
        JSON.stringify({ ok: false, error: `OpenRouter API 錯誤 (${orRes.status}) 模型:${orModelId}：${errText.slice(0, 300)}` }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }

    const orData = (await orRes.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    rawText = orData?.choices?.[0]?.message?.content || "";
  } else {
    // Gemini API
    const imageParts = body.images.map((b64) => ({
      inline_data: { mime_type: "image/jpeg" as const, data: b64 },
    }));

    const geminiBody: Record<string, unknown> = {
      contents: [
        {
          parts: [
            ...imageParts,
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    };

    if (mode === "search") {
      geminiBody.tools = [
        { google_search_retrieval: { dynamic_retrieval_config: { mode: "MODE_DYNAMIC" } } },
      ];
    }

    const geminiModelId = await getGeminiModel(ctx.db);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModelId}:generateContent?key=${apiKey}`;

    let geminiRes: Response;
    try {
      geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: `Gemini API 連線失敗：${String(err)}` }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      return new Response(
        JSON.stringify({ ok: false, error: `Gemini API 錯誤 (${geminiRes.status})：${errText.slice(0, 300)}` }),
        { status: 502, headers: { "content-type": "application/json" } }
      );
    }

    const geminiData = (await geminiRes.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  if (!rawText) {
    return new Response(
      JSON.stringify({ ok: false, error: "AI 未回傳結果" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "AI 回傳格式解析失敗", raw: rawText.slice(0, 500) }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  // Check if the product was rejected (illegal/prohibited)
  if (parsed.rejected) {
    return new Response(
      JSON.stringify({ ok: false, error: (parsed.reason as string) || "辨識失敗：此商品無法上架" }),
      { status: 403, headers: { "content-type": "application/json" } }
    );
  }

  const result = parsed as RecognizeResult;

  // Increment AI recognize counter (for free plan tracking)
  await ctx.db
    .prepare(
      `INSERT INTO app_settings (store_id, key, value, updated_at)
       VALUES (?, 'ai_recognize_count', '1', datetime('now'))
       ON CONFLICT(store_id, key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = datetime('now')`
    )
    .bind(ctx.storeId)
    .run()
    .catch(() => {}); // non-blocking

  return new Response(
    JSON.stringify({ ok: true, mode, result }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
