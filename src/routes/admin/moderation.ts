import type { RequestContext } from "../../context";
import { listSellerCases, sellerRespond, sellerSelfRemove } from "../../services/product-moderation";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function readBody(request: Request): Promise<{ caseId?: number; message?: string } | null> {
  try {
    return (await request.json()) as { caseId?: number; message?: string };
  } catch {
    return null;
  }
}

// GET /api/admin/moderation — compliance notices for the signed-in store.
export async function handleSellerModerationList(_request: Request, ctx: RequestContext): Promise<Response> {
  return json({ ok: true, cases: await listSellerCases(ctx.db, ctx.storeId) });
}

// POST /api/admin/moderation/respond { caseId, message }
export async function handleSellerModerationRespond(request: Request, ctx: RequestContext): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);
  const body = await readBody(request);
  if (!body) return json({ ok: false, error: "Invalid JSON" }, 400);
  const result = await sellerRespond(ctx.db, ctx.storeId, Number(body.caseId), String(body.message || ""));
  return result.ok ? json(result) : json({ ok: false, error: result.error }, result.status);
}

// POST /api/admin/moderation/self-remove { caseId }
export async function handleSellerModerationSelfRemove(request: Request, ctx: RequestContext): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method Not Allowed" }, 405);
  const body = await readBody(request);
  if (!body) return json({ ok: false, error: "Invalid JSON" }, 400);
  const result = await sellerSelfRemove(ctx.db, ctx.storeId, Number(body.caseId));
  return result.ok ? json(result) : json({ ok: false, error: result.error }, result.status);
}
