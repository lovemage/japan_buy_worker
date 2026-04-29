import type { RequestContext } from "../../context";
import { getGeminiApiKey } from "./settings";

const DEFAULT_IMAGE_GEN_PROMPT = `You are a professional e-commerce product photographer. Transform this product photo into a clean, professional product listing image suitable for online shopping platforms.

MUST DO:
- Remove the entire background and replace with a pure white (#FFFFFF) background
- If a human hand, fingers, or arm is holding or touching the product, remove the hand/body completely — show ONLY the product as if it were standing or lying on its own
- Center the product in the frame with balanced white space on all sides
- Maintain the original aspect ratio of the product, output image ratio 4:3
- Enhance brightness and contrast slightly for a crisp, well-lit studio look
- Preserve all original product details: colors, textures, labels, logos, barcodes
- Preserve every character of text on the product packaging exactly as-is (Japanese, Chinese, English, numbers)
- Add a subtle, natural drop shadow beneath the product for depth
- The final image should look like a professional product shot from Amazon, Rakuten, or similar e-commerce platforms

DO NOT:
- DO NOT keep any human body parts (hands, fingers, arms, skin) in the output image
- DO NOT alter, redraw, rearrange, or regenerate any text or characters on the product
- DO NOT change the product shape, proportions, or physical appearance in any way
- DO NOT add any text, watermark, badge, label, price tag, or overlay
- DO NOT add any decorative elements, props, or additional objects
- DO NOT change the product color, brand logo, or packaging design
- DO NOT crop or cut off any part of the product
- DO NOT invent or hallucinate details that are not in the original photo
- DO NOT apply artistic filters, stylization, or cartoon effects — keep it photorealistic
- DO NOT keep store shelves, price tags, shopping baskets, or any retail environment elements`;

const IMAGE_EDIT_LIMITS: Record<string, number> = {
  free: 10,
  plus: 25,
  pro: 60,
  proplus: -1,
};

async function getImageGenApiKey(db: RequestContext["db"], storeId: number, storePlan: string): Promise<string> {
  // First try dedicated image gen key
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'image_gen_api_key'")
    .first<{ value: string }>();
  if (row?.value) return row.value;
  // Fallback to the general Gemini API key used for recognize
  return getGeminiApiKey(db, storeId, storePlan);
}

async function getImageGenModel(db: RequestContext["db"]): Promise<string> {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'image_gen_model'")
    .first<{ value: string }>();
  return row?.value || "gemini-2.5-flash-preview-image-generation";
}

async function getImageGenPrompt(db: RequestContext["db"]): Promise<string> {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'image_gen_prompt'")
    .first<{ value: string }>();
  return row?.value || DEFAULT_IMAGE_GEN_PROMPT;
}

function buildImageDataUrl(base64Data: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64Data}`;
}

export async function handleAdminImageEdit(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  // Rate limit check
  const limit = IMAGE_EDIT_LIMITS[ctx.storePlan] ?? 10;
  if (limit !== -1) {
    const now = new Date();
    const monthKey = `ai_image_edit_count_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
    const usage = await ctx.db
      .prepare(
        "SELECT COALESCE((SELECT value FROM app_settings WHERE store_id = ? AND key = ?), '0') as cnt"
      )
      .bind(ctx.storeId, monthKey)
      .first<{ cnt: string }>();
    const count = parseInt(usage?.cnt || "0", 10);
    if (count >= limit) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `本月 AI 圖片編輯次數已用完（${limit} 次/月）。下個月將自動恢復額度，或升級方案解鎖更多次數。`,
        }),
        { status: 403, headers: { "content-type": "application/json" } }
      );
    }
  }

  // Get settings
  const apiKey = await getImageGenApiKey(ctx.db, ctx.storeId, ctx.storePlan);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "AI 圖片優化功能尚未啟用，請聯繫 vovosnap 管理員處理" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const modelId = await getImageGenModel(ctx.db);
  const prompt = await getImageGenPrompt(ctx.db);

  // Parse request body
  let body: { imageBase64?: string };
  try {
    body = (await request.json()) as { imageBase64?: string };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const imageBase64 = body.imageBase64;
  if (!imageBase64) {
    return new Response(
      JSON.stringify({ ok: false, error: "缺少 imageBase64 欄位" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // Strip data URL prefix if present
  const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;

  // Detect mime type from data URL prefix, default to jpeg for best compatibility
  let inputMime = "image/jpeg";
  if (imageBase64.startsWith("data:image/png")) inputMime = "image/png";
  else if (imageBase64.startsWith("data:image/webp")) inputMime = "image/webp";

  // Call Gemini image generation API
  const geminiBody = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: inputMime, data: base64Data } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  // Image generation models require v1alpha endpoint
  const geminiUrl = `https://generativelanguage.googleapis.com/v1alpha/models/${modelId}:generateContent?key=${apiKey}`;

  let geminiRes: Response;
  try {
    geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: "AI 圖片優化連線失敗，請稍後再試" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  if (!geminiRes.ok) {
    await geminiRes.text().catch(() => "");
    return new Response(
      JSON.stringify({
        ok: false,
        error: "AI 圖片優化暫時無法使用，請稍後再試",
      }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  const geminiRaw = await geminiRes.json() as Record<string, any>;

  // Gemini API may return inline_data (snake_case) or inlineData (camelCase) depending on version
  const candidates = geminiRaw?.candidates || [];
  const parts = candidates[0]?.content?.parts || [];

  // Normalize: check both snake_case and camelCase
  const imagePart = parts.find((p: any) =>
    (p.inline_data?.data) || (p.inlineData?.data)
  );
  const imageData = imagePart?.inline_data?.data || imagePart?.inlineData?.data;

  if (!imageData) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "AI 圖片優化暫時無法使用，請稍後再試",
      }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  const outputMime = imagePart?.inline_data?.mime_type || imagePart?.inlineData?.mimeType || "image/png";
  const imageDataUrl = buildImageDataUrl(imageData, outputMime);

  // Increment usage counter (non-blocking)
  const now = new Date();
  const monthKey = `ai_image_edit_count_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
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
         VALUES (?, 'image_edit', ?, 1, datetime('now'))
         ON CONFLICT(store_id, api_type, month_key) DO UPDATE SET call_count = call_count + 1, last_called_at = datetime('now')`
      )
      .bind(ctx.storeId, monthKeyShort)
      .run(),
  ]).catch(() => {});

  return new Response(
    JSON.stringify({ ok: true, imageDataUrl, mimeType: outputMime }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
