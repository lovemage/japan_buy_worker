import type { RawProduct } from "./types";

const LIST_PAGE_SIZE = 40;
const LIST_DEFAULT_PAGES = 10;
const LIST_MAX_PAGES = 20;

type CrawlEnv = {
  CRAWL_LIST_PAGES?: string;
};

function listPageUrl(page: number): string {
  if (page <= 1) {
    return `https://fo-online.jp/items?pp=${LIST_PAGE_SIZE}&st=4&du=2`;
  }
  return `https://fo-online.jp/items?cp=${page}&pp=${LIST_PAGE_SIZE}&st=4&du=2`;
}

function decodeHtmlAttr(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parsePriceNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildImageUrl(code: string, colorCode?: string): string {
  if (!code || !colorCode) {
    return "";
  }
  return `https://fo-online.jp/images/item/${code}/${code}_c${colorCode}_a001_pm.jpg`;
}

function stripHtml(text: string): string {
  return text.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
}

function toPmImage(image: string): string {
  return image.replace(/_(ps|ss)(\.\w+)$/i, "_pm$2");
}

function uniq(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

async function fetchListPageProducts(page: number): Promise<RawProduct[]> {
  const url = listPageUrl(page);
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`List page fetch failed: p${page} ${res.status}`);
  }
  const html = await res.text();

  const attrs = Array.from(
    html.matchAll(/data-web-tracking-v2-data-item="([^"]+)"/g)
  ).map((m) => decodeHtmlAttr(m[1]));

  const products: RawProduct[] = [];
  const seen = new Set<string>();

  for (const attr of attrs) {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(attr) as Record<string, unknown>;
    } catch {
      continue;
    }

    const code = String(data.code || "").trim();
    const name = String(data.name || "").trim();
    if (!code || !name) {
      continue;
    }

    const colorCode = String(data.colorCode || "").trim() || undefined;
    const key = `${code}:${colorCode || ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const taxExcluded = parsePriceNumber(data.taxExcludedSalePrice);
    const tax = parsePriceNumber(data.salePriceTax);
    const priceJPYTaxIn =
      taxExcluded !== null && tax !== null ? taxExcluded + tax : null;

    products.push({
      rank: String(products.length + 1),
      code,
      brand: String(data.brandName || "").trim() || undefined,
      name,
      priceJPYTaxIn,
      categorySmallName: String(data.smallCategoryName || "").trim() || undefined,
      colorCode,
      colorName: String(data.colorName || "").trim() || undefined,
      image: buildImageUrl(code, colorCode),
      url: `https://fo-online.jp/items/${code}`,
      badges: [],
    });
  }

  return products;
}

type DetailMeta = {
  sizeOptions: string[];
  colorOptions: string[];
  gallery: string[];
  description: string;
  schema: Record<string, unknown> | null;
};

async function fetchDetailMeta(code: string): Promise<DetailMeta> {
  const url = `https://fo-online.jp/items/${encodeURIComponent(code)}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    return {
      sizeOptions: [],
      colorOptions: [],
      gallery: [],
      description: "",
      schema: null,
    };
  }

  const html = await res.text();
  const scriptMatch = html.match(
    /<script type="application\/ld\+json" data-seo-structured-data-type="Product">\s*([\s\S]*?)\s*<\/script>/i
  );
  if (!scriptMatch?.[1]) {
    return {
      sizeOptions: [],
      colorOptions: [],
      gallery: [],
      description: "",
      schema: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(scriptMatch[1]);
  } catch {
    return {
      sizeOptions: [],
      colorOptions: [],
      gallery: [],
      description: "",
      schema: null,
    };
  }

  const root = (Array.isArray(parsed) ? parsed[0] : parsed) as
    | {
        name?: string;
        description?: string;
        url?: string;
        productGroupID?: string;
        brand?: unknown;
        hasVariant?: Array<{
          sku?: unknown;
          name?: unknown;
          image?: unknown;
          offers?: unknown;
        }>;
      }
    | undefined;
  const variants = Array.isArray(root?.hasVariant) ? root.hasVariant : [];

  const sizes: string[] = [];
  const colors: string[] = [];
  const gallery: string[] = [];

  for (const v of variants) {
    const name = String(v.name || "");
    const parts = name.split(",").map((s) => s.trim());
    if (parts[1]) {
      colors.push(parts[1]);
    }
    if (parts[2]) {
      sizes.push(parts[2]);
    }
    const image = String(v.image || "");
    if (image) {
      gallery.push(toPmImage(image));
    }
  }

  const schema: Record<string, unknown> | null = root
    ? {
        "@type": "ProductGroup",
        name: root.name || "",
        description: stripHtml(String(root.description || "")),
        url: root.url || "",
        productGroupID: root.productGroupID || code,
        brand: root.brand || null,
        hasVariant: variants.map((v) => ({
          sku: v.sku ?? null,
          name: v.name ?? "",
          image: typeof v.image === "string" ? toPmImage(v.image) : "",
          offers: v.offers ?? null,
        })),
      }
    : null;

  return {
    sizeOptions: uniq(sizes),
    colorOptions: uniq(colors),
    gallery: uniq(gallery),
    description: stripHtml(String(root?.description || "")),
    schema,
  };
}

async function enrichProductsWithDetail(products: RawProduct[]): Promise<RawProduct[]> {
  const byCode = new Map<string, DetailMeta>();
  const codes = Array.from(new Set(products.map((p) => p.code)));
  const concurrency = 8;
  let cursor = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < codes.length) {
      const i = cursor;
      cursor += 1;
      const code = codes[i];
      if (!code || byCode.has(code)) {
        continue;
      }
      const detail = await fetchDetailMeta(code);
      byCode.set(code, detail);
    }
  });
  await Promise.all(workers);

  return products.map((item) => {
    const detail = byCode.get(item.code);
    if (!detail) {
      return item;
    }
    return {
      ...item,
      sizeOptions: detail.sizeOptions,
      colorOptions: detail.colorOptions,
      gallery: detail.gallery,
      description: detail.description,
      image: item.image || detail.gallery[0] || "",
      schema: detail.schema || undefined,
    };
  });
}

function dedupeByCode(products: RawProduct[]): RawProduct[] {
  const map = new Map<string, RawProduct>();
  for (const item of products) {
    if (!map.has(item.code)) {
      map.set(item.code, item);
    }
  }
  return Array.from(map.values());
}

async function fallbackWithAgentBrowser(): Promise<RawProduct[]> {
  const processObj = (globalThis as { process?: { versions?: { node?: string } } })
    .process;
  if (!processObj?.versions?.node) {
    throw new Error("Fallback requires Node runtime.");
  }

  const { execSync } = await import("node:child_process");
  const session = "fo_fallback";
  const output = execSync(
    `agent-browser --session-name ${session} open "https://fo-online.jp/items?pp=${LIST_PAGE_SIZE}&st=4&du=2" && agent-browser --session-name ${session} wait 5000 && agent-browser --session-name ${session} eval '(() => { const cards=[...document.querySelectorAll(".c-item-card[data-web-tracking-v2-data-item]")]; const parse=(s)=>{try{return JSON.parse(s||"{}")}catch(e){return {}}}; return cards.map((card,idx)=>{ const data=parse(card.getAttribute("data-web-tracking-v2-data-item")); const code=String(data.code||""); const colorCode=String(data.colorCode||""); if(!code){ return null; } const image=(code&&colorCode)?(\"https://fo-online.jp/images/item/\"+code+\"/\"+code+\"_c\"+colorCode+\"_a001_pm.jpg\"):\"\"; return { rank:String(idx+1), code, brand:String(data.brandName||\"\"), name:String(data.name||\"\"), priceJPYTaxIn:(typeof data.taxExcludedSalePrice===\"number\" && typeof data.salePriceTax===\"number\") ? (data.taxExcludedSalePrice+data.salePriceTax):null, categorySmallName:String(data.smallCategoryName||\"\"), colorCode, colorName:String(data.colorName||\"\"), image, url:\"https://fo-online.jp/items/\"+code, badges:[] }; }).filter(Boolean); })()'`
  )
    .toString()
    .trim();

  const parsed = JSON.parse(output) as RawProduct[];
  return Array.isArray(parsed) ? parsed : [];
}

export async function crawlProducts(
  envInput: Partial<CrawlEnv>
): Promise<{ jobId: string; products: RawProduct[]; source: "crawl" | "fallback" }> {
  const pages = Math.max(
    1,
    Math.min(
      Number(envInput.CRAWL_LIST_PAGES || LIST_DEFAULT_PAGES),
      LIST_MAX_PAGES
    )
  );
  const jobId = `list-${Date.now()}`;

  const crawled: RawProduct[] = [];
  for (let page = 1; page <= pages; page += 1) {
    const pageProducts = await fetchListPageProducts(page);
    crawled.push(...pageProducts);
  }

  const deduped = dedupeByCode(crawled);
  if (deduped.length === 0) {
    const fallback = dedupeByCode(await fallbackWithAgentBrowser());
    const enrichedFallback = await enrichProductsWithDetail(fallback);
    return { jobId, products: enrichedFallback, source: "fallback" };
  }

  const enriched = await enrichProductsWithDetail(deduped);
  return { jobId, products: enriched, source: "crawl" };
}
