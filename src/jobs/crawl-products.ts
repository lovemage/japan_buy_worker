import type { CrawlResult, RawProduct } from "./types";

const RANKING_URL =
  "https://fo-online.jp/ranking?bc=J&gc=1&lcc=001001001&scc=001001001002";

type CrawlEnv = {
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  CRAWL_MAX_PAGES?: string;
  CRAWL_TIMEOUT_MS?: string;
};

function assertEnv(env: Partial<CrawlEnv>): asserts env is CrawlEnv {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw new Error(
      "Missing env: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required."
    );
  }
}

function baseHeaders(env: CrawlEnv): HeadersInit {
  return {
    Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function crawlBaseUrl(accountId: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/crawl`;
}

async function createCrawlJob(env: CrawlEnv): Promise<string> {
  const body = {
    url: RANKING_URL,
    maxPages: Number(env.CRAWL_MAX_PAGES || 3),
    outputFormats: ["html"],
  };

  const res = await fetch(crawlBaseUrl(env.CLOUDFLARE_ACCOUNT_ID), {
    method: "POST",
    headers: baseHeaders(env),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create crawl job: ${res.status} ${text}`);
  }

  const json = (await res.json()) as {
    success: boolean;
    result?: { id?: string };
    errors?: unknown[];
  };
  const jobId = json.result?.id;
  if (!json.success || !jobId) {
    throw new Error(`Invalid crawl create response: ${JSON.stringify(json)}`);
  }
  return jobId;
}

async function getCrawlJob(env: CrawlEnv, jobId: string): Promise<CrawlResult> {
  const res = await fetch(`${crawlBaseUrl(env.CLOUDFLARE_ACCOUNT_ID)}/${jobId}`, {
    method: "GET",
    headers: baseHeaders(env),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch crawl job: ${res.status} ${text}`);
  }

  const json = (await res.json()) as {
    success: boolean;
    result?: CrawlResult;
  };
  if (!json.success || !json.result) {
    throw new Error(`Invalid crawl status response: ${JSON.stringify(json)}`);
  }
  return json.result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePriceFromText(priceText: string): number | null {
  const digits = priceText.replace(/[^\d]/g, "");
  if (!digits) {
    return null;
  }
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseProductsFromHtml(html: string): RawProduct[] {
  const cards = html.match(
    /<div class="c-item-card[\s\S]*?data-web-tracking-v2-data-item="[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g
  );

  if (!cards || cards.length === 0) {
    return [];
  }

  return cards
    .map((card) => {
      const attr = card.match(/data-web-tracking-v2-data-item="([^"]+)"/)?.[1];
      if (!attr) {
        return null;
      }
      const decoded = attr
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");

      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(decoded) as Record<string, unknown>;
      } catch {
        data = {};
      }

      const priceText =
        card.match(/<div class="c-item-card__price">([\s\S]*?)<\/div>/)?.[1]
          ?.replace(/<[^>]+>/g, " ")
          ?.replace(/\s+/g, " ")
          ?.trim() || "";
      const colorsText =
        card
          .match(/<div class="c-item-card__colors--text">([\s\S]*?)<\/div>/)?.[1]
          ?.replace(/<[^>]+>/g, " ")
          ?.replace(/\s+/g, " ")
          ?.trim() || "";
      const image =
        card.match(/<img[^>]+src="([^"]+)"/)?.[1] ||
        card.match(/<img[^>]+data-src="([^"]+)"/)?.[1] ||
        "";
      const url = card.match(/<a href="(https:\/\/fo-online\.jp\/items\/[^"]+)"/)?.[1] || "";
      const rank =
        card.match(/c-item-card__ranking--text">\s*([\d]+)\s*</)?.[1] || undefined;

      const badges = Array.from(card.matchAll(/c-badge-list__badge-[^"]+">([^<]+)/g))
        .map((m) => m[1].trim())
        .filter(Boolean);

      const code = String(data.code || "").trim();
      const name = String(data.name || "").trim();

      if (!code || !name) {
        return null;
      }

      return {
        rank,
        code,
        brand: String(data.brandName || "").trim() || undefined,
        name,
        priceJPYTaxIn:
          typeof data.taxExcludedSalePrice === "number" &&
          typeof data.salePriceTax === "number"
            ? data.taxExcludedSalePrice + data.salePriceTax
            : parsePriceFromText(priceText),
        priceText,
        colorsText,
        categorySmallName:
          String(data.smallCategoryName || "").trim() || undefined,
        colorName: String(data.colorName || "").trim() || undefined,
        image,
        url,
        badges,
      } satisfies RawProduct;
    })
    .filter((v): v is RawProduct => Boolean(v));
}

async function fallbackWithAgentBrowser(): Promise<RawProduct[]> {
  const processObj = (globalThis as { process?: { versions?: { node?: string } } })
    .process;
  if (!processObj?.versions?.node) {
    throw new Error(
      "Fallback parser requires Node runtime because it executes agent-browser CLI."
    );
  }

  const { execSync } = await import("node:child_process");
  const session = "fo_fallback";
  execSync(
    `agent-browser --session-name ${session} open "${RANKING_URL}" && agent-browser --session-name ${session} wait 5000`,
    { stdio: "ignore" }
  );
  const output = execSync(
    `agent-browser --session-name ${session} eval '(() => { const cards=[...document.querySelectorAll(".p-ranking-list .c-item-card")]; const parseJson=(s)=>{try{return JSON.parse(s||"{}")}catch(e){return {}}}; return cards.map((card, idx) => { const data=parseJson(card.getAttribute("data-web-tracking-v2-data-item")); const rank=(card.querySelector(".c-item-card__ranking--text")?.textContent||String(idx+1)).trim(); const priceText=(card.querySelector(".c-item-card__price")?.textContent||"").replace(/\\s+/g," ").trim(); const colorsText=(card.querySelector(".c-item-card__colors--text")?.textContent||"").replace(/\\s+/g," ").trim(); const badges=[...card.querySelectorAll(".c-badge-list *")].map(e=>e.textContent.trim()).filter(Boolean); const a=card.querySelector("a[href*=\\"/items/\\"]"); return { rank, code:String(data.code||""), brand:String(data.brandName||""), name:String(data.name||""), priceJPYTaxIn:(typeof data.taxExcludedSalePrice==="number" && typeof data.salePriceTax==="number") ? (data.taxExcludedSalePrice + data.salePriceTax) : null, priceText, colorsText, categorySmallName:String(data.smallCategoryName||""), colorName:String(data.colorName||""), image:card.querySelector("img")?.getAttribute("src")||"", url:a?.href||"", badges }; }).filter(item => item.code && item.name); })()'`
  )
    .toString()
    .trim();

  const parsed = JSON.parse(output) as RawProduct[];
  if (!Array.isArray(parsed)) {
    throw new Error("Fallback output is not an array.");
  }
  return parsed;
}

export async function crawlProducts(
  envInput: Partial<CrawlEnv>
): Promise<{ jobId: string; products: RawProduct[]; source: "crawl" | "fallback" }> {
  assertEnv(envInput);
  const env = envInput;

  const jobId = await createCrawlJob(env);
  const timeoutMs = Number(env.CRAWL_TIMEOUT_MS || 120000);
  const startedAt = Date.now();

  let latest: CrawlResult | null = null;
  while (Date.now() - startedAt < timeoutMs) {
    latest = await getCrawlJob(env, jobId);
    if (latest.status === "completed" || latest.status === "failed") {
      break;
    }
    await sleep(2000);
  }

  if (!latest) {
    throw new Error(`Crawl job ${jobId} returned no status payload.`);
  }

  if (latest.status !== "completed") {
    const fallback = await fallbackWithAgentBrowser();
    return { jobId, products: fallback, source: "fallback" };
  }

  const htmlRecords = latest.records
    .map((record) => record.html || "")
    .filter(Boolean);
  const products = htmlRecords.flatMap((html) => parseProductsFromHtml(html));

  if (products.length > 0) {
    return { jobId, products, source: "crawl" };
  }

  const fallback = await fallbackWithAgentBrowser();
  return { jobId, products: fallback, source: "fallback" };
}
