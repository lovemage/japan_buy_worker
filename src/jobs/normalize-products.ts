import type { NormalizedProduct, RawProduct } from "./types";

const SOURCE_SITE = "fo-online.jp";

function toColorCount(colorsText?: string): number | null {
  if (!colorsText) {
    return null;
  }
  const matched = colorsText.match(/\d+/);
  if (!matched) {
    return null;
  }
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeProducts(
  rawProducts: RawProduct[],
  crawledAt = new Date().toISOString()
): NormalizedProduct[] {
  return rawProducts
    .filter((item) => item.code && item.name)
    .map((item) => {
      return {
        sourceSite: SOURCE_SITE,
        sourceProductCode: item.code.trim(),
        titleJa: item.name.trim(),
        titleZhTw: null,
        brand: item.brand?.trim() || null,
        category: item.categorySmallName?.trim() || null,
        priceJpyTaxIn:
          typeof item.priceJPYTaxIn === "number" ? item.priceJPYTaxIn : null,
        colorCount: toColorCount(item.colorsText),
        imageUrl: item.image?.trim() || null,
        isActive: 1,
        lastCrawledAt: crawledAt,
        sourcePayloadJson: JSON.stringify(item),
        statusBadgesJson:
          item.badges && item.badges.length > 0
            ? JSON.stringify(item.badges)
            : null,
      };
    });
}

