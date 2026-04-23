import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProductUpsertPayload,
  parseStoredProductPayload,
} from '../src/jobs/product-records.ts';

test('parseStoredProductPayload returns gallery and schema from products.source_payload_json', () => {
  const parsed = parseStoredProductPayload(JSON.stringify({
    gallery: ['a.jpg', 'b.jpg'],
    schema: { hasVariant: [{ sku: 'A' }, { sku: 'B' }] },
    description: 'desc',
    variants: [
      { name: '大包', stock: 10, price: 1200 },
      { name: '小包', stock: 5, price: 900 },
    ],
  }));

  assert.deepEqual(parsed.gallery, ['a.jpg', 'b.jpg']);
  assert.equal(parsed.description, 'desc');
  assert.deepEqual(parsed.schema, { hasVariant: [{ sku: 'A' }, { sku: 'B' }] });
  assert.deepEqual(parsed.variants, [
    { name: '大包', stock: 10, price: 1200 },
    { name: '小包', stock: 5, price: 900 },
  ]);
});

test('parseStoredProductPayload is resilient to invalid json', () => {
  const parsed = parseStoredProductPayload('{bad json');
  assert.deepEqual(parsed.gallery, []);
  assert.equal(parsed.description, '');
  assert.equal(parsed.schema, null);
  assert.deepEqual(parsed.variants, []);
});

test('buildProductUpsertPayload includes payload and status badges on products row', () => {
  const built = buildProductUpsertPayload({
    sourceSite: 'fo-online.jp',
    sourceProductCode: 'P1',
    titleJa: '商品',
    titleZhTw: null,
    brand: 'BREEZE',
    category: 'Tシャツ',
    priceJpyTaxIn: 1000,
    colorCount: 3,
    imageUrl: 'img.jpg',
    isActive: 1,
    lastCrawledAt: '2026-03-15T00:00:00.000Z',
    sourcePayloadJson: '{"gallery":["a.jpg"]}',
    statusBadgesJson: '["SALE"]',
  });

  assert.equal(built.columns.includes('source_payload_json'), true);
  assert.equal(built.columns.includes('status_badges_json'), true);
  assert.equal(built.values.at(-2), '{"gallery":["a.jpg"]}');
  assert.equal(built.values.at(-1), '["SALE"]');
});
