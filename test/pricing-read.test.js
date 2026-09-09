import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = stripTypeScriptTypes(readFileSync(new URL('../src/routes/pricing.ts', import.meta.url), 'utf8')).replace(/^export /gm, '');
async function readPricing(rows, storeId = 47) {
  const calls = [];
  const db = { prepare(sql) {
    assert.match(sql, /^SELECT/);
    calls.push(sql);
    return { bind(id) { assert.equal(id, storeId); return this; }, all: async () => ({ results: rows }) };
  } };
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const result = await context.getPricingConfig(db, storeId);
  assert.equal(calls.length, 1);
  return JSON.parse(JSON.stringify(result));
}

test('pricing reads once without schema/default writes and preserves new-store defaults', async () => {
  assert.deepEqual(await readPricing([]), {
    markupJpy: 1000, markupMode: 'flat', markupPercent: 25, jpyToTwd: 1,
    internationalShippingTwd: 350, domesticShippingTwd: 60, promoTagMaxTwd: 500,
    limitedProxyShippingTwd: 80, shippingOptionsEnabled: true, pricingMode: 'manual',
  });
});

test('pricing keeps configured zero values, exchange rate, shipping and automatic mode', async () => {
  const values = { markup_jpy: '0', markup_mode: 'percent', markup_percent: '15', jpy_to_twd: '0.21', international_shipping_twd: '0', domestic_shipping_twd: '80', promo_tag_max_twd: '0', limited_proxy_shipping_twd: '0', shipping_options_enabled: '0', pricing_mode: 'auto' };
  assert.deepEqual(await readPricing(Object.entries(values).map(([key, value]) => ({ key, value }))), {
    markupJpy: 0, markupMode: 'percent', markupPercent: 15, jpyToTwd: 0.21,
    internationalShippingTwd: 0, domesticShippingTwd: 80, promoTagMaxTwd: 0,
    limitedProxyShippingTwd: 0, shippingOptionsEnabled: false, pricingMode: 'auto',
  });
});

test('missing TWD shipping retains the former seeded default for legacy stores', async () => {
  const pricing = await readPricing([{ key: 'international_shipping_jpy', value: '999' }]);
  assert.equal(pricing.internationalShippingTwd, 350);
});
