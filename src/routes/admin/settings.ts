import type { RequestContext } from "../../context";
import type { D1DatabaseLike } from "../../types/d1";

// Gemini API key is now managed by platform admin, stored as:
//   store_id=0, key='gemini_api_key_starter' (for Starter plan)
//   store_id=0, key='gemini_api_key_pro' (for Pro plan)
// store_id=0 is used as a "platform" scope

export async function getGeminiApiKey(db: D1DatabaseLike, storeId: number, storePlan?: string): Promise<string> {
  // First check if store has its own key (backward compat for bootstrap store)
  const storeKey = await db
    .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'gemini_api_key'")
    .bind(storeId)
    .first<{ value: string }>();
  if (storeKey?.value) return storeKey.value;

  // Otherwise use platform-level key based on plan
  const plan = storePlan || "free";
  const keyName = plan === "pro" ? "gemini_api_key_pro" : "gemini_api_key_starter";
  const platformKey = await db
    .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = ?")
    .bind(keyName)
    .first<{ value: string }>();

  return platformKey?.value || "";
}

export async function handleAdminGeminiSettings(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  const key = await getGeminiApiKey(ctx.db, ctx.storeId, ctx.storePlan);
  return new Response(
    JSON.stringify({ ok: true, hasKey: key.length > 0, plan: ctx.storePlan }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

export async function getAiModel(db: D1DatabaseLike, storeId: number): Promise<string> {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE store_id = ? AND key = 'ai_model'")
    .bind(storeId)
    .first<{ value: string }>();
  return row?.value || "v1";
}

export async function getOpenRouterApiKey(db: D1DatabaseLike): Promise<string> {
  const row = await db
    .prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'openrouter_api_key_pro'")
    .first<{ value: string }>();
  return row?.value || "";
}

export async function handleAdminAiModel(
  request: Request,
  ctx: RequestContext
): Promise<Response> {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

  if (request.method === "GET") {
    const model = await getAiModel(ctx.db, ctx.storeId);
    return json({ ok: true, model });
  }

  if (request.method === "POST") {
    if (ctx.storePlan !== "pro") {
      return json({ ok: false, error: "僅 Pro 方案可切換模型" }, 403);
    }
    let body: { model?: string };
    try {
      body = (await request.json()) as { model?: string };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    const model = body.model === "v2" ? "v2" : "v1";
    await ctx.db
      .prepare("INSERT INTO app_settings (store_id, key, value, updated_at) VALUES (?, 'ai_model', ?, datetime('now')) ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')")
      .bind(ctx.storeId, model)
      .run();
    return json({ ok: true, model });
  }

  return json({ ok: false, error: "Method not allowed" }, 405);
}
