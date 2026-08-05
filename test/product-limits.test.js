import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UNVERIFIED_PHONE_PRODUCT_LIMIT,
  getStoreProductLimit,
} from "../src/shared/product-limits.js";

// Fake D1 answering the two queries getStoreProductLimit makes: the platform
// plan_limits row, and the store's phone_verified flag.
function makeDb({ planLimits = null, phoneVerified = 0 } = {}) {
  return {
    prepare(sql) {
      const run = () => {
        if (sql.includes("FROM app_settings")) {
          return planLimits === null ? null : { value: JSON.stringify(planLimits) };
        }
        if (sql.includes("phone_verified")) {
          return { phone_verified: phoneVerified };
        }
        throw new Error(`unexpected query: ${sql}`);
      };
      return {
        bind() {
          return { async first() { return run(); } };
        },
        async first() { return run(); },
      };
    },
  };
}

test("free store without phone verification is capped at 5", async () => {
  const state = await getStoreProductLimit(makeDb({ phoneVerified: 0 }), 1, "free");
  assert.equal(state.limit, UNVERIFIED_PHONE_PRODUCT_LIMIT);
  assert.equal(state.planLimit, 10);
  assert.equal(state.phoneVerified, false);
  assert.equal(state.cappedByPhone, true);
});

test("verifying restores the free plan's own limit", async () => {
  const state = await getStoreProductLimit(makeDb({ phoneVerified: 1 }), 1, "free");
  assert.equal(state.limit, 10);
  assert.equal(state.cappedByPhone, false);
});

test("paid plans are never capped by phone verification", async () => {
  for (const [plan, expected] of [["plus", 25], ["pro", 60], ["proplus", null]]) {
    const state = await getStoreProductLimit(makeDb({ phoneVerified: 0 }), 1, plan);
    assert.equal(state.limit, expected, `${plan} should keep its plan limit`);
    assert.equal(state.cappedByPhone, false, `${plan} should not be capped`);
    assert.equal(state.phoneVerified, false, `${plan} should report the real flag`);
  }
});

test("upgrading lifts the cap immediately for a store that never verified", async () => {
  const db = makeDb({ phoneVerified: 0 });
  assert.equal((await getStoreProductLimit(db, 1, "free")).limit, 5);
  assert.equal((await getStoreProductLimit(db, 1, "plus")).limit, 25);
});

test("a custom plan_limits row below the cap wins", async () => {
  const state = await getStoreProductLimit(
    makeDb({ planLimits: { free: 3 }, phoneVerified: 0 }),
    1,
    "free"
  );
  assert.equal(state.limit, 3);
  assert.equal(state.cappedByPhone, false, "3 is the plan's own limit, not a phone cap");
});

test("an unlimited free plan still caps unverified stores", async () => {
  const state = await getStoreProductLimit(
    makeDb({ planLimits: { free: -1 }, phoneVerified: 0 }),
    1,
    "free"
  );
  assert.equal(state.planLimit, null);
  assert.equal(state.limit, UNVERIFIED_PHONE_PRODUCT_LIMIT);
  assert.equal(state.cappedByPhone, true);
});
