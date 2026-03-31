import type { D1DatabaseLike } from "../../types/d1";
import { getGeminiApiKey } from "./settings";

type Env = {
  DB: D1DatabaseLike;
};

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

const RECOGNIZE_PROMPT = `你是日本商品辨識專家。分析以下日本商品包裝照片，提取商品資訊並翻譯為繁體中文。

請回傳以下 JSON 格式：
{
  "titleJa": "日文商品名（從包裝上讀取）",
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
- 如果包裝上有價格標籤，填入 priceJpy（整數日圓）
- 如果無法辨識的欄位，用空字串或空陣列
- specs 只列出能從包裝上看到的規格
- sizeOptions/colorOptions 只列出包裝上標示的選項
- 品牌名保留日文/英文原文
- category 用繁體中文`;

const SEARCH_PROMPT_SUFFIX = `

同時請使用搜尋功能查詢這個商品的更多資訊，包括：
- 完整商品規格
- 建議售價
- 可購買的尺寸/顏色選項
- 用戶評價摘要
將搜尋到的資訊整合到回傳的 JSON 中，並在 searchSources 陣列中列出參考來源網址。`;

export async function handleAdminRecognize(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  const apiKey = await getGeminiApiKey(env.DB);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "Gemini API Key 尚未設定，請至 Admin 設定頁填入" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
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
  const prompt = mode === "search"
    ? RECOGNIZE_PROMPT + SEARCH_PROMPT_SUFFIX
    : RECOGNIZE_PROMPT;

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

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

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

  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!rawText) {
    return new Response(
      JSON.stringify({ ok: false, error: "Gemini 未回傳結果" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  let result: RecognizeResult;
  try {
    result = JSON.parse(rawText) as RecognizeResult;
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Gemini 回傳格式解析失敗", raw: rawText.slice(0, 500) }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, mode, result }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
