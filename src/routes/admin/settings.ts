import type { RequestContext } from "../../context";
import type { D1DatabaseLike } from "../../types/d1";

export async function getGeminiApiKey(db: D1DatabaseLike, storeId: number): Promise<string> {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'gemini_api_key'")
    .bind(storeId)
    .first<{ value: string }>();
  return row?.value || "";
}

export async function handleAdminGeminiSettings(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  if (request.method === "GET") {
    const key = await getGeminiApiKey(ctx.db, ctx.storeId);
    return new Response(
      JSON.stringify({ ok: true, hasKey: key.length > 0, maskedKey: key ? key.slice(0, 6) + "..." : "" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method Not Allowed" }), {
      status: 405, headers: { "content-type": "application/json" },
    });
  }

  let body: { geminiApiKey?: string };
  try {
    body = (await request.json()) as { geminiApiKey?: string };
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  const apiKey = (body.geminiApiKey || "").trim();
  if (!apiKey) {
    return new Response(JSON.stringify({ ok: false, error: "geminiApiKey is required" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }

  await ctx.db
    .prepare(
      "INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'gemini_api_key', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    )
    .bind(ctx.storeId, apiKey)
    .run();

  return new Response(
    JSON.stringify({ ok: true, maskedKey: apiKey.slice(0, 6) + "..." }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
