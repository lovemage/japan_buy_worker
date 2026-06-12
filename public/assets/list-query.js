export function buildListQueryParams({
  limit,
  offset,
  sort,
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
  if (typeof sort === 'string' && sort.trim() && sort !== 'latest') {
    params.set('sort', sort.trim());
  }
  if (typeof category === 'string' && category.trim()) {
    params.set('category', category.trim());
  }
  if (Array.isArray(brands) && brands.length > 0) {
    params.set('brands', brands.join(','));
  }
  return params;
}
