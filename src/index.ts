import {
  handleAdminLogin,
  handleAdminLogout,
  isAdminAuthorized,
} from "./routes/admin/auth";
import { handleAdminCrawl } from "./routes/admin/crawl";
import { handleAdminRequirements } from "./routes/admin/requirements";
import {
  handlePublicProductBrands,
  handlePublicProductCategories,
  handlePublicProductDetail,
  handlePublicProducts,
} from "./routes/public/products";
import {
  handlePublicRequirementDetail,
  handlePublicRequirements,
} from "./routes/public/requirements";
import { handleAdminPricing, handlePublicPricing } from "./routes/pricing";
import { handleAdminProducts } from "./routes/admin/products";
import { handleAdminRecognize } from "./routes/admin/recognize";
import { handleAdminGeminiSettings } from "./routes/admin/settings";
import type { D1DatabaseLike } from "./types/d1";

type Env = {
  DB: D1DatabaseLike;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  CRAWL_LIST_PAGES?: string;
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
    const isAdmin = isAdminAuthorized(request);

    if (request.method === "GET" && url.pathname === "/healthz") {
      return json({ ok: true, service: "japan-buy-workers" });
    }

    if (url.pathname === "/api/admin/login") {
      return handleAdminLogin(request);
    }

    if (url.pathname === "/api/admin/logout") {
      return handleAdminLogout(request);
    }

    if (url.pathname === "/admin/crawl") {
      if (!isAdmin) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
      return handleAdminCrawl(request, env);
    }

    if (url.pathname === "/api/admin/requirements") {
      if (!isAdmin) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
      return handleAdminRequirements(request, env);
    }

    if (url.pathname === "/api/admin/pricing") {
      return handleAdminPricing(request, env);
    }

    if (url.pathname === "/api/admin/settings/gemini") {
      if (!isAdmin) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
      return handleAdminGeminiSettings(request, env);
    }

    if (url.pathname === "/api/admin/recognize") {
      if (!isAdmin) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
      return handleAdminRecognize(request, env);
    }

    if (url.pathname === "/api/admin/products") {
      if (!isAdmin) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
      return handleAdminProducts(request, env);
    }

    if (url.pathname === "/api/products") {
      return handlePublicProducts(request, env);
    }

    if (url.pathname === "/api/product-categories") {
      return handlePublicProductCategories(request, env);
    }

    if (url.pathname === "/api/product-brands") {
      return handlePublicProductBrands(request, env);
    }

    if (url.pathname === "/api/product") {
      return handlePublicProductDetail(request, env);
    }

    if (url.pathname === "/api/requirements") {
      return handlePublicRequirements(request, env);
    }

    if (url.pathname === "/api/requirement") {
      return handlePublicRequirementDetail(request, env);
    }

    if (url.pathname === "/api/pricing") {
      return handlePublicPricing(request, env);
    }

    if (request.method === "GET" && (url.pathname === "/admin" || url.pathname === "/admin.html")) {
      if (!isAdmin) {
        return Response.redirect(new URL("/admin-login.html", request.url), 302);
      }
    }

    // Static files from /public via Wrangler assets binding.
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return json({ ok: false, error: "Not Found" }, 404);
  },
};
