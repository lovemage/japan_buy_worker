import { test } from "node:test";
import assert from "node:assert/strict";
import { getStoreProductLimit } from "../src/shared/product-limits.js";

// Fake D1 answering the platform plan_limits query getStoreProductLimit makes.
function makeDb({ planLimits = null } = {}) {
  return {
    prepare(sql) {
      const run = () => {
        if (sql.includes("FROM app_settings")) {
          return planLimits === null ? null : { value: JSON.stringify(planLimits) };
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

test("each plan gets its default limit", async () => {
  for (const [plan, expected] of [["free", 10], ["plus", 25], ["pro", 60], ["proplus", null]]) {
    const state = await getStoreProductLimit(makeDb(), 1, plan);
    assert.equal(state.limit, expected, `${plan} should keep its plan limit`);
    assert.equal(state.planLimit, expected);
  }
});

test("a custom plan_limits row wins", async () => {
  const state = await getStoreProductLimit(makeDb({ planLimits: { free: 3 } }), 1, "free");
  assert.equal(state.limit, 3);
});

test("a negative plan limit means unlimited", async () => {
  const state = await getStoreProductLimit(makeDb({ planLimits: { free: -1 } }), 1, "free");
  assert.equal(state.limit, null);
});
