import { crawlProducts } from "../../jobs/crawl-products";
import { normalizeProducts } from "../../jobs/normalize-products";
import { upsertProducts } from "../../jobs/upsert-products";
import type { RequestContext } from "../../context";
import { getStoreProductLimit } from "../../shared/product-limits.js";

type CrawlEnv = {
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  CRAWL_LIST_PAGES?: string;
  CRAWL_MAX_PAGES?: string;
  CRAWL_TIMEOUT_MS?: string;
};

export async function handleAdminCrawl(request: Request, ctx: RequestContext, crawlEnv: CrawlEnv): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    let maxProducts: number | null = null;
    const crawlLimits: Record<string, number> = { free: 10, plus: 25, pro: 60, proplus: -1 };
    const crawlLimit = crawlLimits[ctx.storePlan] ?? 10;
    if (crawlLimit > 0) {
      maxProducts = crawlLimit;
    }

    // A free store that skipped phone verification is capped lower, and bulk
    // import must respect it too — otherwise the cap is one crawl away from
    // being bypassed.
    const limitState = await getStoreProductLimit(ctx.db, ctx.storeId, ctx.storePlan);
    if (limitState.limit !== null && limitState.limit > 0) {
      maxProducts = maxProducts === null ? limitState.limit : Math.min(maxProducts, limitState.limit);
    }

    const crawled = await crawlProducts({
      CLOUDFLARE_ACCOUNT_ID: crawlEnv.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: crawlEnv.CLOUDFLARE_API_TOKEN,
      CRAWL_LIST_PAGES: crawlEnv.CRAWL_LIST_PAGES,
      CRAWL_MAX_PAGES: crawlEnv.CRAWL_MAX_PAGES,
      CRAWL_TIMEOUT_MS: crawlEnv.CRAWL_TIMEOUT_MS,
    });

    const normalized = normalizeProducts(crawled.products);
    const writeResult = await upsertProducts(ctx.db, normalized, ctx.storeId, maxProducts);

    return new Response(
      JSON.stringify({
        ok: true,
        jobId: crawled.jobId,
        source: crawled.source,
        crawledCount: crawled.products.length,
        upserted: writeResult.upserted,
        skippedByLimit: writeResult.skippedByLimit,
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
