import test from 'node:test';
import assert from 'node:assert/strict';

import { buildListQueryParams } from '../public/assets/list-query.js';

test('buildListQueryParams includes promo, category, and brands consistently', () => {
  const params = buildListQueryParams({
    limit: 20,
    offset: 40,
    promoMaxTwd: 350,
    category: '長袖Tシャツ',
    brands: ['BREEZE', 'algy'],
  });

  assert.equal(
    params.toString(),
    'limit=20&offset=40&promoMaxTwd=350&category=%E9%95%B7%E8%A2%96T%E3%82%B7%E3%83%A3%E3%83%84&brands=BREEZE%2Calgy'
  );
});

test('buildListQueryParams omits empty filters and all-promo mode', () => {
  const params = buildListQueryParams({
    promoMaxTwd: 'all',
    category: '',
    brands: [],
  });

  assert.equal(params.toString(), '');
});
