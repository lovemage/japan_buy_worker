import test from "node:test";
import assert from "node:assert/strict";

import { calculateAdminFormTotals } from "../public/assets/admin-totals.js";

test("calculateAdminFormTotals sums item subtotals and shipping total", () => {
  const totals = calculateAdminFormTotals({
    shippingTotalTwd: 200,
    items: [
      { subtotalJpy: 1500, subtotalTwd: 320 },
      { subtotalJpy: 2000, subtotalTwd: 430 },
    ],
  });

  assert.deepEqual(totals, {
    itemsTotalJpy: 3500,
    itemsTotalTwd: 750,
    grandTotalTwd: 950,
  });
});

test("calculateAdminFormTotals handles missing values safely", () => {
  const totals = calculateAdminFormTotals({
    shippingTotalTwd: null,
    items: [{ subtotalJpy: null, subtotalTwd: undefined }, {}],
  });

  assert.deepEqual(totals, {
    itemsTotalJpy: 0,
    itemsTotalTwd: 0,
    grandTotalTwd: 0,
  });
});

test("calculateAdminFormTotals uses adjusted TWD totals when admin changes amount", () => {
  const totals = calculateAdminFormTotals({
    shippingTotalTwd: 200,
    adjustedItemsTotalTwd: 820,
    adjustedShippingTotalTwd: 160,
    items: [
      { subtotalJpy: 1500, subtotalTwd: 320 },
      { subtotalJpy: 2000, subtotalTwd: 430 },
    ],
  });

  assert.deepEqual(totals, {
    itemsTotalJpy: 3500,
    itemsTotalTwd: 820,
    originalItemsTotalTwd: 750,
    shippingTotalTwd: 160,
    originalShippingTotalTwd: 200,
    grandTotalTwd: 980,
    originalGrandTotalTwd: 950,
    amountAdjusted: true,
  });
});
