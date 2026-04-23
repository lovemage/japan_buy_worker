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

const { addItem, clearDraft, getDraft } = await import('../public/assets/draft-store.js');

test.beforeEach(() => {
  store = new Map();
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
