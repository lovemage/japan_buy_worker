import { verifyToken } from "./platform-admin";
import {
  adminActOnCase,
  getCaseDetail,
  getModerationSummary,
  listCasesForAdmin,
  runModerationScan,
  setScanEnabled,
  type AdminCaseFilter,
  type ModerationEnv,
} from "../services/product-moderation";
import { MANUAL_SCAN_MAX_PRODUCTS } from "../shared/moderation-logic.js";

const FILTERS: AdminCaseFilter[] = ["active", "overdue", "review", "removed", "closed", "all"];
const ACTIONS = ["dismiss", "remove", "restore", "uphold", "note"];

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/**
 * Platform admin endpoints for product compliance moderation.
 * Returns null when the path is not a moderation endpoint.
 */
export async function handlePlatformModeration(
  request: Request,
  env: ModerationEnv,
  platformPassword: string
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/platform-admin/moderation")) return null;

  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!(await verifyToken(token, platformPassword))) return json({ ok: false, error: "Unauthorized" }, 401);

  if (url.pathname === "/api/platform-admin/moderation/summary" && request.method === "GET") {
    return json({ ok: true, ...(await getModerationSummary(env.DB)) });
  }

  if (url.pathname === "/api/platform-admin/moderation/cases" && request.method === "GET") {
    const raw = url.searchParams.get("filter") || "active";
    const filter = (FILTERS.includes(raw as AdminCaseFilter) ? raw : "active") as AdminCaseFilter;
    return json({ ok: true, cases: await listCasesForAdmin(env.DB, filter) });
  }

  const detail = url.pathname.match(/^\/api\/platform-admin\/moderation\/cases\/(\d+)$/);
  if (detail && request.method === "GET") {
    const data = await getCaseDetail(env.DB, Number(detail[1]));
    return data ? json({ ok: true, case: data }) : json({ ok: false, error: "案件不存在" }, 404);
  }

  const act = url.pathname.match(/^\/api\/platform-admin\/moderation\/cases\/(\d+)\/action$/);
  if (act && request.method === "POST") {
    let body: { action?: string; note?: string };
    try {
      body = (await request.json()) as { action?: string; note?: string };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    const action = String(body.action || "");
    if (!ACTIONS.includes(action)) return json({ ok: false, error: "不支援的動作" }, 400);
    const result = await adminActOnCase(env, Number(act[1]), action, String(body.note || ""));
    if (!result.ok) return json({ ok: false, error: result.error }, result.status || 400);
    return json(result);
  }

  if (url.pathname === "/api/platform-admin/moderation/scan" && request.method === "POST") {
    const summary = await runModerationScan(env, { trigger: "manual", maxProducts: MANUAL_SCAN_MAX_PRODUCTS });
    return json({ ok: true, summary });
  }

  if (url.pathname === "/api/platform-admin/moderation/settings" && request.method === "POST") {
    let body: { scanEnabled?: boolean };
    try {
      body = (await request.json()) as { scanEnabled?: boolean };
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400);
    }
    await setScanEnabled(env.DB, body.scanEnabled !== false);
    return json({ ok: true, scanEnabled: body.scanEnabled !== false });
  }

  return json({ ok: false, error: "Not Found" }, 404);
}
