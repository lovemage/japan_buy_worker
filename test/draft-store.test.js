import test from 'node:test';
import assert from 'node:assert/strict';

let store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
};

globalThis.window = { __STORE_SLUG: 'default', __API_BASE: '' };

const { addItem, clearDraft, getDraft } = await import('../public/assets/draft-store.js');

test.beforeEach(() => {
  store = new Map();
  globalThis.window.__STORE_SLUG = 'default';
  globalThis.window.__API_BASE = '';
  clearDraft();
});

test('addItem stores selected variant and variant price in draft', () => {
  addItem({
    productId: 9,
    code: 'P9',
    productNameSnapshot: '抹茶餅乾',
    quantity: 2,
    imageUrl: 'cover.jpg',
    selectedImageUrl: 'cover.jpg',
    priceJpyTaxIn: 1000,
    unitPriceTwd: 250,
    variantName: '12入禮盒',
    variantPriceJpyTaxIn: 1350,
    variantUnitPriceTwd: 338,
  });

  assert.deepEqual(getDraft().items, [
    {
      productId: 9,
      code: 'P9',
      productNameSnapshot: '抹茶餅乾',
      quantity: 2,
      desiredSize: '',
      desiredColor: '',
      note: '',
      imageUrl: 'cover.jpg',
      selectedImageUrl: 'cover.jpg',
      priceJpyTaxIn: 1350,
      unitPriceTwd: 338,
      sizeOptions: [],
      colorOptions: [],
      variantOptions: [],
      variantName: '12入禮盒',
      variantPriceJpyTaxIn: 1350,
      variantUnitPriceTwd: 338,
    },
  ]);
});

test('addItem keeps variants as separate draft lines', () => {
  addItem({
    productId: 9,
    code: 'P9',
    productNameSnapshot: '抹茶餅乾',
    quantity: 1,
    imageUrl: 'cover.jpg',
    selectedImageUrl: 'cover.jpg',
    variantName: '6入',
    variantPriceJpyTaxIn: 800,
    variantUnitPriceTwd: 200,
  });
  addItem({
    productId: 9,
    code: 'P9',
    productNameSnapshot: '抹茶餅乾',
    quantity: 1,
    imageUrl: 'cover.jpg',
    selectedImageUrl: 'cover.jpg',
    variantName: '12入',
    variantPriceJpyTaxIn: 1400,
    variantUnitPriceTwd: 350,
  });

  assert.equal(getDraft().items.length, 2);
  assert.deepEqual(
    getDraft().items.map((item) => item.variantName),
    ['6入', '12入']
  );
});

test('drafts are isolated by storefront and discard the legacy shared draft', () => {
  store.set('requirementDraft', JSON.stringify({ items: [{ productId: 99, code: 'legacy' }] }));
  globalThis.window.__STORE_SLUG = 'japan';

  assert.deepEqual(getDraft().items, []);
  assert.equal(store.has('requirementDraft'), false);

  addItem({ productId: 1, code: 'JP-1', productNameSnapshot: 'Japan item', quantity: 1 });

  globalThis.window.__STORE_SLUG = 'chixu';
  assert.deepEqual(getDraft().items, []);
  addItem({ productId: 2, code: 'CX-1', productNameSnapshot: 'Chixu item', quantity: 1 });
  assert.deepEqual(getDraft().items.map((item) => item.code), ['CX-1']);

  globalThis.window.__STORE_SLUG = 'japan';
  assert.deepEqual(getDraft().items.map((item) => item.code), ['JP-1']);
});
