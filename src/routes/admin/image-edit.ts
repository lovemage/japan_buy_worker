import type { RequestContext } from "../../context";

const DEFAULT_IMAGE_GEN_PROMPT = `You are a professional e-commerce product photographer. Transform this product photo into a clean, professional product listing image.

MUST DO:
- Remove the entire background and replace with a pure white (#FFFFFF) background
- Center the product in the frame with balanced white space on all sides
- Maintain the original aspect ratio of the product, output image ratio 4:3
- Enhance brightness and contrast slightly for a crisp, well-lit look
- Preserve all original product details: colors, textures, labels, logos, barcodes
- Preserve every character of text on the product packaging exactly as-is (Japanese, Chinese, English, numbers)
- Keep reflections and shadows natural and subtle

DO NOT:
- DO NOT alter, redraw, rearrange, or regenerate any text or characters on the product
- DO NOT change the product shape, proportions, or physical appearance in any way
- DO NOT add any text, watermark, badge, label, price tag, or overlay
- DO NOT add any decorative elements, props, or additional objects
- DO NOT change the product color, brand logo, or packaging design
- DO NOT crop or cut off any part of the product
- DO NOT invent or hallucinate details that are not in the original photo
- DO NOT apply artistic filters, stylization, or cartoon effects — keep it photorealistic`;

const IMAGE_EDIT_LIMITS: Record<string, number> = {
  free: 10,
  starter: 50,
  pro: -1,
};

async function getImageGenApiKey(db: RequestContext["db"]): Promise<string> {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'image_gen_api_key'")
    .first<{ value: string }>();
  return row?.value || "";
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

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
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
  const apiKey = await getImageGenApiKey(ctx.db);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "AI 圖片編輯 API Key 尚未設定，請聯繫平台管理員" }),
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

  // Call Gemini image generation API
  const geminiBody = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: "image/webp" as const, data: base64Data } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

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
      JSON.stringify({
        ok: false,
        error: `Gemini API 錯誤 (${geminiRes.status})：${errText.slice(0, 300)}`,
      }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  const geminiData = (await geminiRes.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inline_data?: { mime_type: string; data: string };
          text?: string;
        }>;
      };
    }>;
  };

  // Find the image part in the response
  const parts = geminiData?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inline_data?.data);

  if (!imagePart?.inline_data?.data) {
    return new Response(
      JSON.stringify({ ok: false, error: "AI 未回傳圖片，請稍後再試" }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }

  // Upload to R2
  if (!ctx.r2) {
    return new Response(
      JSON.stringify({ ok: false, error: "R2 儲存空間未設定" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  const timestamp = Date.now();
  const r2Key = `${ctx.storeId}/ai-edit/${timestamp}.webp`;
  const imageBuffer = base64ToArrayBuffer(imagePart.inline_data.data);

  await ctx.r2.put(r2Key, imageBuffer, {
    httpMetadata: { contentType: "image/webp" },
  });

  // Increment usage counter (non-blocking)
  const now = new Date();
  const monthKey = `ai_image_edit_count_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
  await ctx.db
    .prepare(
      `INSERT INTO app_settings (store_id, key, value, updated_at)
       VALUES (?, ?, '1', datetime('now'))
       ON CONFLICT(store_id, key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = datetime('now')`
    )
    .bind(ctx.storeId, monthKey)
    .run()
    .catch(() => {});

  return new Response(
    JSON.stringify({ ok: true, imageUrl: `/api/images/${r2Key}` }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
