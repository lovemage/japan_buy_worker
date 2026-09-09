import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const item = (code = 'test') => ({ productId: code, code, productNameSnapshot: '測試商品', quantity: 1, unitPriceTwd: 100, priceJpyTaxIn: 100 });

function cartHarness(fetchStoreJson, items = [item()]) {
  let draft = { items };
  const nodes = new Map();
  for (const id of ['request-items', 'next-step-btn', 'cart-load-status', 'cart-review-summary']) {
    nodes.set(id, { innerHTML: '', textContent: '', disabled: false, querySelectorAll: () => [], addEventListener(type, cb) { this[type] = cb; } });
  }
  const context = vm.createContext({
    window: { scrollTo() {} },
    document: { getElementById: (id) => nodes.get(id) || null, querySelectorAll: () => [] },
    MutationObserver: class { observe() {} },
    fetchStoreJson,
    getDraft: () => structuredClone(draft),
    setDraft: (value) => { draft = structuredClone(value); },
    withProductImageFallback: () => '/placeholder.svg',
    applyProductImageFallback() {},
  });
  vm.runInContext(read('../public/assets/app-request.js').replace(/^import .*;$/gm, '').replace(/bootstrap\(\);\s*$/, ''), context);
  for (const name of ['renderTotals', 'renderShippingOptions', 'applyShippingOptionsVisibility', 'bindCvsSearch']) context[name] = () => {};
  return { context, nodes, get draft() { return draft; }, set draft(value) { draft = value; } };
}

test('cart renders saved items before pricing resolves; failure offers retry without clearing cart', async () => {
  const pending = deferred();
  const h = cartHarness(() => pending.promise);
  h.context.bootstrap();
  assert.match(h.nodes.get('request-items').innerHTML, /測試商品/);
  assert.equal(h.nodes.get('next-step-btn').disabled, true);
  pending.reject(new Error('offline'));
  await new Promise(setImmediate);
  assert.match(h.nodes.get('request-items').innerHTML, /測試商品/);
  assert.equal(h.nodes.get('next-step-btn').textContent, '重試載入');
  assert.equal(vm.runInContext('checkoutReady', h.context), false);
  h.context.fetchStoreJson = async (path) => path === '/api/pricing'
    ? { pricing: { pricingMode: 'manual', jpyToTwd: 1 } }
    : { product: { priceJpyTaxIn: 100, variants: [], sizeOptions: [], colorOptions: [] } };
  h.nodes.get('next-step-btn').click();
  await new Promise(setImmediate);
  assert.equal(h.nodes.get('next-step-btn').textContent, '下一步');
  assert.equal(vm.runInContext('checkoutReady', h.context), true);
});

test('cart hydrates distinct products concurrently and preserves edits/removals during loading', async () => {
  const pending = deferred();
  const calls = [];
  const h = cartHarness(async (path) => { calls.push(path); await pending.promise; return { product: { sizeOptions: ['M'], colorOptions: ['黑'] } }; }, [item('a'), item('a'), item('b')]);
  const task = h.context.hydrateDraftWithOptions();
  assert.equal(calls.length, 2);
  h.draft = { items: [{ ...item('a'), quantity: 4, note: '保留備註' }] };
  pending.resolve();
  await task;
  assert.equal(h.draft.items.length, 1);
  assert.equal(h.draft.items[0].quantity, 4);
  assert.equal(h.draft.items[0].note, '保留備註');
  assert.deepEqual(h.draft.items[0].sizeOptions, ['M']);
});

test('one failed product preserves successful hydration and retries only missing data', async () => {
  let fail = true;
  const calls = [];
  const h = cartHarness(async (path) => {
    calls.push(path);
    if (fail && path.endsWith('b')) throw new Error('offline');
    return { product: { variants: [], sizeOptions: [], colorOptions: [] } };
  }, [item('a'), item('b')]);
  await assert.rejects(h.context.hydrateDraftWithOptions());
  assert.equal(h.draft.items.length, 2);
  assert.equal(h.draft.items[0].optionsHydrated, true);
  fail = false;
  await h.context.hydrateDraftWithOptions();
  assert.equal(calls.length, 3);
  assert.equal(h.draft.items[1].optionsHydrated, true);
});

test('store requests time out and reject HTTP/JSON errors instead of hanging', async () => {
  const context = vm.createContext({ AbortController, setTimeout, clearTimeout, window: {} });
  vm.runInContext(read('../public/assets/storefront-data.js').replace('export ', ''), context);
  context.window.apiFetch = (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  await assert.rejects(context.fetchStoreJson('/api/pricing', { timeoutMs: 5 }), /aborted/);
  context.window.apiFetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(context.fetchStoreJson('/api/pricing'), /503/);
  context.window.apiFetch = async () => ({ ok: true, json: async () => { throw new Error('invalid JSON'); } });
  await assert.rejects(context.fetchStoreJson('/api/pricing'), /invalid JSON/);
});

test('product list starts pricing/products together and renders without waiting for filters', async () => {
  const pending = deferred();
  const calls = [];
  let rendered = false;
  const context = vm.createContext({ window: {}, document: { getElementById: () => null }, fetchStoreJson(path) {
    calls.push(path);
    if (path.includes('categories') || path.includes('brands')) return new Promise(() => {});
    return pending.promise.then(() => path === '/api/pricing' ? { pricing: {} } : { products: [] });
  }, buildListQueryParams: () => new URLSearchParams() });
  vm.runInContext(read('../public/assets/app-list.js').replace(/^import .*;$/gm, '').replace(/bootstrap\(\);\s*initFloatingButtonsAutoHide\(\);\s*$/, ''), context);
  for (const name of ['renderDraftCount', 'initDrawerSections', 'initPromoModal', 'initViewSwitch', 'renderQuickFilterControls', 'initPromoSwitch', 'initProductCardGalleries', 'initOverlayToggle', 'renderPagination', 'renderFloatingPagination', 'dismissLoading']) context[name] = () => {};
  context.getCategory = () => '';
  context.getQuickSort = () => '';
  context.getPage = () => 1;
  context.getSelectedBrands = () => [];
  context.consumeListScrollState = () => null;
  context.renderProducts = () => { rendered = true; };
  const task = context.bootstrap();
  assert.equal(calls.length, 4);
  assert.ok(calls.includes('/api/pricing'));
  assert.ok(calls.some((path) => path.startsWith('/api/products?')));
  pending.resolve();
  await task;
  assert.equal(rendered, true);
});

test('product details request pricing and product together before rendering', async () => {
  const pending = deferred();
  const calls = [];
  let rendered = false;
  const context = vm.createContext({ window: {}, URL, location: { href: 'https://shop.test/product?code=abc' }, fetchStoreJson(path) {
    calls.push(path);
    return pending.promise.then(() => path === '/api/pricing' ? { pricing: {} } : { ok: true, product: { code: 'abc' } });
  } });
  vm.runInContext(read('../public/assets/app-product.js').replace(/^import .*;$/gm, '').replace(/bootstrap\(\)\.catch\([^\n]+\);\s*$/, ''), context);
  context.renderDraftCount = () => {};
  context.renderProduct = async () => { rendered = true; };
  context.loadRecommendations = async () => {};
  const task = context.bootstrap();
  assert.deepEqual(calls, ['/api/pricing', '/api/product?code=abc']);
  pending.resolve();
  await task;
  assert.equal(rendered, true);
});
