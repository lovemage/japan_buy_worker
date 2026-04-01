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
  // Store owners can no longer set their own API key
  // Just return status of whether a key is available for their plan
  const key = await getGeminiApiKey(ctx.db, ctx.storeId, ctx.storePlan);
  return new Response(
    JSON.stringify({ ok: true, hasKey: key.length > 0, plan: ctx.storePlan }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
