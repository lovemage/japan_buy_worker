import { isAdminAuthorized } from "./auth";
import { crawlProducts } from "../../jobs/crawl-products";
import { normalizeProducts } from "../../jobs/normalize-products";
import { upsertProducts } from "../../jobs/upsert-products";
import type { D1DatabaseLike } from "../../types/d1";

type Env = {
  DB: D1DatabaseLike;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  CRAWL_LIST_PAGES?: string;
  CRAWL_MAX_PAGES?: string;
  CRAWL_TIMEOUT_MS?: string;
};

export async function handleAdminCrawl(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }
  if (!isAdminAuthorized(request)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const crawled = await crawlProducts({
      CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
      CRAWL_LIST_PAGES: env.CRAWL_LIST_PAGES,
      CRAWL_MAX_PAGES: env.CRAWL_MAX_PAGES,
      CRAWL_TIMEOUT_MS: env.CRAWL_TIMEOUT_MS,
    });

    const normalized = normalizeProducts(crawled.products);
    const writeResult = await upsertProducts(env.DB, normalized);

    return new Response(
      JSON.stringify({
        ok: true,
        jobId: crawled.jobId,
        source: crawled.source,
        crawledCount: crawled.products.length,
        upserted: writeResult.upserted,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
