import type { D1DatabaseLike } from "../types/d1";
import { getEffectivePlan, type StoreRow } from "../context";
import { parsePlanProductLimits, productLimitForPlan, buildVisibleProductLimitClause } from "../shared/product-limits.js";
import { parseStoredProductPayload } from "../jobs/product-records";
import { getPricingConfig } from "../routes/pricing";
import { calcRetailTwd } from "../shared/retail-price.js";
import { isIndexableProduct, isSensitiveProduct } from "../shared/site-policy.js";

type SitemapProduct = {
  source_product_code: string | null;
  title_zh_tw: string | null;
  title_ja: string | null;
  category: string | null;
  source_payload_json: string | null;
  image_url: string | null;
  price_jpy_tax_in: number | null;
  updated_at: string;
};

export async function storefrontSitemap(db: D1DatabaseLike, hostname: string, mainDomain: string) {
  const [storesResult, limitsRow] = await Promise.all([
    db.prepare("SELECT id, slug, subdomain, plan, plan_expires_at, description, updated_at FROM stores WHERE is_active = 1")
      .all<StoreRow & { description: string; updated_at: string }>(),
    db.prepare("SELECT value FROM app_settings WHERE store_id = 0 AND key = 'plan_limits'").first<{ value: string }>(),
  ]);
  const limits = parsePlanProductLimits(limitsRow?.value);
  const entries: Array<{ loc: string; updated: string }> = [];
  for (const store of storesResult.results || []) {
    const plan = getEffectivePlan(store);
    const storeHost = plan === "proplus" ? `${store.subdomain || store.slug}.${mainDomain}` : mainDomain;
    if (storeHost !== hostname) continue;
    const base = `https://${storeHost}${plan === "proplus" ? "" : `/s/${store.slug}`}`;
    const visible = buildVisibleProductLimitClause({ storeId: store.id, limit: productLimitForPlan(plan, limits) });
    const [result, pricing] = await Promise.all([
      db.prepare(`SELECT source_product_code, title_zh_tw, title_ja, category, source_payload_json, image_url, price_jpy_tax_in, updated_at
        FROM products p WHERE store_id = ? AND is_active = 1 AND source_product_code IS NOT NULL${visible.sql} ORDER BY created_at DESC, id DESC LIMIT 1000`)
        .bind(store.id, ...visible.params).all<SitemapProduct>(),
      getPricingConfig(db, store.id),
    ]);
    const products = (result.results || []).map(row => {
      const payload = parseStoredProductPayload(row.source_payload_json);
      return { ...row, description: payload.description, image_url: payload.gallery[0] || row.image_url };
    });
    const eligible = products.filter(product => product.source_product_code && isIndexableProduct(product,
      product.price_jpy_tax_in == null ? null : calcRetailTwd(Number(product.price_jpy_tax_in), pricing)));
    if (eligible.length && products.length < 1000 && store.description?.trim() && !products.some(isSensitiveProduct)) {
      entries.push({ loc: `${base}/`, updated: store.updated_at });
    }
    for (const product of eligible) {
      entries.push({ loc: `${base}/product?code=${encodeURIComponent(product.source_product_code)}`, updated: product.updated_at });
    }
  }
  return entries;
}
