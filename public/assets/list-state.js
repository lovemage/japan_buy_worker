const QUICK_SORT_VALUES = ['latest', 'price_desc', 'price_asc'];
const DEFAULT_QUICK_SORT = 'latest';

export function getNormalizedQuickSort(raw) {
  const input = String(raw ?? '').trim();
  return QUICK_SORT_VALUES.includes(input) ? input : DEFAULT_QUICK_SORT;
}

export function nextSingleBrandSelection(currentBrands, clickedBrand) {
  const brand = String(clickedBrand || '').trim();
  const selected = Array.isArray(currentBrands) ? currentBrands.filter(Boolean) : [];
  if (!brand) {
    return [];
  }
  return selected[0] === brand ? [] : [brand];
}
