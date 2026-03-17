import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getNormalizedPromoMax,
  nextSingleBrandSelection,
} from '../public/assets/list-state.js';

test('getNormalizedPromoMax defaults missing promo to all', () => {
  assert.equal(getNormalizedPromoMax(null), 'all');
  assert.equal(getNormalizedPromoMax(''), 'all');
});

test('getNormalizedPromoMax keeps supported numeric promo filters', () => {
  assert.equal(getNormalizedPromoMax('350'), 350);
  assert.equal(getNormalizedPromoMax('450'), 450);
});

test('nextSingleBrandSelection selects one brand at a time', () => {
  assert.deepEqual(nextSingleBrandSelection([], 'BREEZE'), ['BREEZE']);
  assert.deepEqual(nextSingleBrandSelection(['BREEZE'], 'algy'), ['algy']);
});

test('nextSingleBrandSelection clears when clicking the selected brand again', () => {
  assert.deepEqual(nextSingleBrandSelection(['BREEZE'], 'BREEZE'), []);
  assert.deepEqual(nextSingleBrandSelection(['algy'], ''), []);
});
