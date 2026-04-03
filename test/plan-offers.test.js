import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PLAN_OFFERS, getPlanOffers, getPlanOfferByMonths } from "../src/shared/plan-offers.js";

test("default offers include starter and pro 12-month bonus days", () => {
  const starter = getPlanOfferByMonths("starter", 12, DEFAULT_PLAN_OFFERS);
  const pro = getPlanOfferByMonths("pro", 12, DEFAULT_PLAN_OFFERS);

  assert.equal(starter?.days, 390);
  assert.equal(pro?.days, 390);
});

test("getPlanOffers returns sorted options by months", () => {
  const starter = getPlanOffers("starter", DEFAULT_PLAN_OFFERS);
  assert.deepEqual(starter.map((x) => x.months), [1, 6, 12]);
});

test("getPlanOfferByMonths returns null for unknown plan/months", () => {
  assert.equal(getPlanOfferByMonths("free", 1, DEFAULT_PLAN_OFFERS), null);
  assert.equal(getPlanOfferByMonths("starter", 3, DEFAULT_PLAN_OFFERS), null);
});
