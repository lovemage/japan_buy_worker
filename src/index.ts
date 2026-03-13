import { handleAdminCrawl } from "./routes/admin/crawl";
import { handlePublicProducts } from "./routes/public/products";
import type { D1DatabaseLike } from "./types/d1";

type Env = {
  DB: D1DatabaseLike;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  CRAWL_MAX_PAGES?: string;
  CRAWL_TIMEOUT_MS?: string;
};

function json(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/healthz") {
      return json({ ok: true, service: "japan-buy-workers" });
    }

    if (url.pathname === "/admin/crawl") {
      return handleAdminCrawl(request, env);
    }

    if (url.pathname === "/api/products") {
      return handlePublicProducts(request, env);
    }

    return json({ ok: false, error: "Not Found" }, 404);
  },
};

