import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getNormalizedQuickSort,
  nextSingleBrandSelection,
} from '../public/assets/list-state.js';

test('getNormalizedQuickSort defaults missing sort to latest', () => {
  assert.equal(getNormalizedQuickSort(null), 'latest');
  assert.equal(getNormalizedQuickSort(''), 'latest');
});

test('getNormalizedQuickSort keeps supported sort filters', () => {
  assert.equal(getNormalizedQuickSort('price_desc'), 'price_desc');
  assert.equal(getNormalizedQuickSort('price_asc'), 'price_asc');
  assert.equal(getNormalizedQuickSort('unknown'), 'latest');
});

test('nextSingleBrandSelection selects one brand at a time', () => {
  assert.deepEqual(nextSingleBrandSelection([], 'BREEZE'), ['BREEZE']);
  assert.deepEqual(nextSingleBrandSelection(['BREEZE'], 'algy'), ['algy']);
});

test('nextSingleBrandSelection clears when clicking the selected brand again', () => {
  assert.deepEqual(nextSingleBrandSelection(['BREEZE'], 'BREEZE'), []);
  assert.deepEqual(nextSingleBrandSelection(['algy'], ''), []);
});
