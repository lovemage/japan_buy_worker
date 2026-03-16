export function buildListQueryParams({
  limit,
  offset,
  promoMaxTwd,
  category,
  brands,
} = {}) {
  const params = new URLSearchParams();
  if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
    params.set('limit', String(Number(limit)));
  }
  if (Number.isFinite(Number(offset)) && Number(offset) >= 0) {
    params.set('offset', String(Number(offset)));
  }
  if (promoMaxTwd !== 'all' && Number.isFinite(Number(promoMaxTwd)) && Number(promoMaxTwd) > 0) {
    params.set('promoMaxTwd', String(Number(promoMaxTwd)));
  }
  if (typeof category === 'string' && category.trim()) {
    params.set('category', category.trim());
  }
  if (Array.isArray(brands) && brands.length > 0) {
    params.set('brands', brands.join(','));
  }
  return params;
}
