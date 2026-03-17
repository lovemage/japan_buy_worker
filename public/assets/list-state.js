const PROMO_FILTER_VALUES = ['all', 350, 450, 550];
const DEFAULT_PROMO_FILTER = 'all';

export function getNormalizedPromoMax(raw) {
  const input = String(raw ?? '').trim();
  if (!input || input === 'all') {
    return DEFAULT_PROMO_FILTER;
  }
  const value = Number(input);
  return PROMO_FILTER_VALUES.includes(value) ? value : DEFAULT_PROMO_FILTER;
}

export function nextSingleBrandSelection(currentBrands, clickedBrand) {
  const brand = String(clickedBrand || '').trim();
  const selected = Array.isArray(currentBrands) ? currentBrands.filter(Boolean) : [];
  if (!brand) {
    return [];
  }
  return selected[0] === brand ? [] : [brand];
}
