/**
 * Server-side mirror of calcAdjustedPrices() in public/assets/app-product.js,
 * returning the retail TWD price shoppers actually see, so structured-data
 * prices never contradict the page (Google penalises price mismatches).
 */
export function calcRetailTwd(baseJpy, pricing) {
  const base = Number(baseJpy);
  if (!Number.isFinite(base)) return null;
  // Manual mode: the stored base price is already the TWD selling price.
  if (pricing.pricingMode === "manual") return Math.round(base);
  const rate = pricing.jpyToTwd;
  if (pricing.markupMode === "percent") {
    return Math.round(base * rate * (1 + pricing.markupPercent / 100));
  }
  const src = Math.round(base + pricing.markupJpy);
  return Math.round(src * rate);
}
