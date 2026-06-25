import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildProductWhereClause,
  parseBrandFilters,
} from '../src/routes/public/product-filters.ts';
import {
  buildVisibleProductLimitClause,
  parsePlanProductLimits,
  productLimitForPlan,
} from '../src/shared/product-limits.js';

const productsRoute = readFileSync(new URL('../src/routes/public/products.ts', import.meta.url), 'utf8');

test('parseBrandFilters trims, deduplicates, and removes empties', () => {
  assert.deepEqual(parseBrandFilters('BREEZE, ALGY,,BREEZE,  ,apres les cours'), [
    'BREEZE',
    'ALGY',
    'apres les cours',
  ]);
});

test('parseBrandFilters returns empty array for blank input', () => {
  assert.deepEqual(parseBrandFilters(' , , '), []);
});

test('buildProductWhereClause composes category, promo, and brand filters', () => {
  const built = buildProductWhereClause({
    storeId: 1,
    category: 'Tシャツ',
    maxBaseJpy: 800,
    brands: ['BREEZE', 'ALGY'],
  });

  assert.equal(
    built.whereSql,
    "WHERE p.store_id = ? AND p.is_active = 1 AND p.category = ? AND p.price_jpy_tax_in IS NOT NULL AND p.price_jpy_tax_in <= ? AND p.brand IN (?, ?)"
  );
  assert.deepEqual(built.params, [1, 'Tシャツ', 800, 'BREEZE', 'ALGY']);
});

test('buildProductWhereClause omits optional clauses when filters are empty', () => {
  const built = buildProductWhereClause({
    storeId: 1,
    category: '',
    maxBaseJpy: null,
    brands: [],
  });

  assert.equal(built.whereSql, 'WHERE p.store_id = ? AND p.is_active = 1');
  assert.deepEqual(built.params, [1]);
});

test('buildProductWhereClause includes promo filtering for brand aggregations', () => {
  const built = buildProductWhereClause({
    storeId: 1,
    category: 'ワンピース',
    maxBaseJpy: 666,
    brands: [],
  });

  assert.equal(
    built.whereSql,
    'WHERE p.store_id = ? AND p.is_active = 1 AND p.category = ? AND p.price_jpy_tax_in IS NOT NULL AND p.price_jpy_tax_in <= ?'
  );
  assert.deepEqual(built.params, [1, 'ワンピース', 666]);
});

test('productLimitForPlan treats proplus as unlimited and falls back safely', () => {
  assert.equal(productLimitForPlan('free'), 10);
  assert.equal(productLimitForPlan('proplus'), null);
  assert.equal(productLimitForPlan('missing'), 10);
  assert.equal(productLimitForPlan('lite'), 10);
  assert.equal(productLimitForPlan('lite', { plus: 25, pro: 60 }), 10);
  assert.equal(productLimitForPlan('free', { free: 'not-a-number' }), 10);
  assert.deepEqual(parsePlanProductLimits('{"plus":30}'), { free: 10, plus: 30, pro: 60, proplus: -1 });
  assert.deepEqual(parsePlanProductLimits('{bad json'), { free: 10, plus: 25, pro: 60, proplus: -1 });
});

test('buildVisibleProductLimitClause limits public products to newest active products', () => {
  const clause = buildVisibleProductLimitClause({ storeId: 42, limit: 10 });
  assert.ok(clause.sql.includes('p.id IN'));
  assert.ok(clause.sql.includes('ORDER BY created_at DESC, id DESC'));
  assert.deepEqual(clause.params, [42, 10]);

  const unlimited = buildVisibleProductLimitClause({ storeId: 42, limit: null });
  assert.equal(unlimited.sql, '');
  assert.deepEqual(unlimited.params, []);
});

test('public product route gates inactive and over-limit bypasses behind owner session checks', () => {
  assert.ok(productsRoute.includes('const ownerRequest = await isStoreOwnerRequest(request, ctx);'));
  assert.ok(productsRoute.includes('const includeInactive = ownerRequest && url.searchParams.get("includeInactive") === "1";'));
  assert.ok(productsRoute.includes('const onlyInactive = ownerRequest && url.searchParams.get("onlyInactive") === "1";'));
  assert.ok(productsRoute.includes('const publicVisibilityLimit = ownerRequest || includeInactive || onlyInactive'));
  assert.ok(productsRoute.includes('const limit = ownerRequest ? null : await getPlanProductLimit(ctx.db, ctx.storePlan);'));
});
