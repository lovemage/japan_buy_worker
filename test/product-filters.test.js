import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProductWhereClause,
  parseBrandFilters,
} from '../src/routes/public/product-filters.ts';

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
