export function parseBrandFilters(raw: string | null | undefined): string[] {
  if (typeof raw !== 'string') {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );
}

type BuildWhereInput = {
  category: string;
  maxBaseJpy: number | null;
  brands: string[];
};

export function buildProductWhereClause(input: BuildWhereInput): {
  whereSql: string;
  params: Array<string | number>;
} {
  const clauses = ['p.is_active = 1'];
  const params: Array<string | number> = [];

  if (input.category.trim()) {
    clauses.push('p.category = ?');
    params.push(input.category.trim());
  }

  if (typeof input.maxBaseJpy === 'number' && Number.isFinite(input.maxBaseJpy)) {
    clauses.push('p.price_jpy_tax_in IS NOT NULL');
    clauses.push('p.price_jpy_tax_in <= ?');
    params.push(input.maxBaseJpy);
  }

  if (Array.isArray(input.brands) && input.brands.length > 0) {
    clauses.push(`p.brand IN (${input.brands.map(() => '?').join(', ')})`);
    params.push(...input.brands);
  }

  return {
    whereSql: `WHERE ${clauses.join(' AND ')}`,
    params,
  };
}
