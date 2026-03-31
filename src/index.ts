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
import { handleAdminProducts, handleAdminProductToggle, handleAdminProductUpdate, handleAdminProductImageDelete } from "./routes/admin/products";
import { handleAdminChangePassword } from "./routes/admin/password";
import { handleAdminCategories } from "./routes/admin/categories";
import { handleAdminRecognize } from "./routes/admin/recognize";
import { handleAdminGeminiSettings } from "./routes/admin/settings";
import { handleAdminClearSyncProducts, handleAdminClearManualProducts } from "./routes/admin/clear-products";
import type { D1DatabaseLike } from "./types/d1";

type Env = {
  DB: D1DatabaseLike;
  IMAGES?: R2Bucket;
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
    if (request.method === "GET" && url.pathname === "/healthz") {
      return json({ ok: true, service: "japan-buy-workers" });
    }

    if (url.pathname === "/api/admin/login") {
      return handleAdminLogin(request, env);
    }

    if (url.pathname === "/api/admin/logout") {
      return handleAdminLogout(request, env);
    }

    // Public API routes (no auth needed)
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

    // Admin routes — check session token against DB
    const isAdmin = await isAdminAuthorized(request, env.DB);

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

    if (url.pathname === "/api/admin/change-password") {
      if (!isAdmin) return json({ ok: false, error: "Unauthorized" }, 401);
      return handleAdminChangePassword(request, env);
    }

    if (url.pathname === "/api/admin/categories") {
      if (!isAdmin) return json({ ok: false, error: "Unauthorized" }, 401);
      return handleAdminCategories(request, env);
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

    if (url.pathname === "/api/admin/products/toggle") {
      if (!isAdmin) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
      return handleAdminProductToggle(request, env);
    }

    if (url.pathname === "/api/admin/products/update") {
      if (!isAdmin) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
      return handleAdminProductUpdate(request, env);
    }

    if (url.pathname === "/api/admin/products/image-delete") {
      if (!isAdmin) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
      return handleAdminProductImageDelete(request, env);
    }

    if (url.pathname === "/api/admin/clear-sync-products") {
      if (!isAdmin) return json({ ok: false, error: "Unauthorized" }, 401);
      return handleAdminClearSyncProducts(request, env);
    }

    if (url.pathname === "/api/admin/clear-manual-products") {
      if (!isAdmin) return json({ ok: false, error: "Unauthorized" }, 401);
      return handleAdminClearManualProducts(request, env);
    }

    if (request.method === "GET" && (url.pathname === "/admin" || url.pathname === "/admin.html")) {
      if (!isAdmin) {
        return Response.redirect(new URL("/admin-login.html", request.url), 302);
      }
    }

    // R2 image proxy
    if (url.pathname.startsWith("/api/images/")) {
      const key = url.pathname.slice("/api/images/".length);
      if (!env.IMAGES) return json({ ok: false, error: "R2 not configured" }, 500);
      const object = await env.IMAGES.get(key);
      if (!object) return new Response("Not Found", { status: 404 });
      return new Response(object.body, {
        headers: {
          "content-type": object.httpMetadata?.contentType || "image/webp",
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    }

    // Static files from /public via Wrangler assets binding.
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return json({ ok: false, error: "Not Found" }, 404);
  },
};
