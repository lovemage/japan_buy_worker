import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PLAN_OFFERS, getPlanOffers, getPlanOfferByMonths } from "../src/shared/plan-offers.js";

test("plus plan has only 1-month offer", () => {
  const plus = getPlanOffers("plus", DEFAULT_PLAN_OFFERS);
  assert.deepEqual(plus.map((x) => x.months), [1]);
  assert.equal(plus[0].amount, 490);
});

test("pro plan 12-month includes 30-day bonus", () => {
  const pro = getPlanOfferByMonths("pro", 12, DEFAULT_PLAN_OFFERS);
  assert.equal(pro?.days, 390);
  assert.equal(pro?.bonusDays, 30);
});

test("proplus plan bonus days: 6-month +30, 12-month +60", () => {
  const pp6 = getPlanOfferByMonths("proplus", 6, DEFAULT_PLAN_OFFERS);
  const pp12 = getPlanOfferByMonths("proplus", 12, DEFAULT_PLAN_OFFERS);
  assert.equal(pp6?.days, 210);
  assert.equal(pp6?.bonusDays, 30);
  assert.equal(pp12?.days, 420);
  assert.equal(pp12?.bonusDays, 60);
});

test("proplus monthly price stays 1280 across all tiers", () => {
  const offers = getPlanOffers("proplus", DEFAULT_PLAN_OFFERS);
  for (const offer of offers) {
    assert.equal(offer.monthlyPrice, 1280);
  }
});

test("getPlanOffers returns sorted options by months", () => {
  const pro = getPlanOffers("pro", DEFAULT_PLAN_OFFERS);
  assert.deepEqual(pro.map((x) => x.months), [1, 6, 12]);
  const proplus = getPlanOffers("proplus", DEFAULT_PLAN_OFFERS);
  assert.deepEqual(proplus.map((x) => x.months), [1, 6, 12]);
});

test("getPlanOfferByMonths returns null for unknown plan/months", () => {
  assert.equal(getPlanOfferByMonths("free", 1, DEFAULT_PLAN_OFFERS), null);
  assert.equal(getPlanOfferByMonths("plus", 6, DEFAULT_PLAN_OFFERS), null);
  assert.equal(getPlanOfferByMonths("pro", 3, DEFAULT_PLAN_OFFERS), null);
});
