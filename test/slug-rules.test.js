import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeSlug,
  getSlugValidationError,
  getSlugChangeLimit,
  getSlugChangeUsage,
  canChangeSlug,
} from "../src/shared/slug-rules.js";

test("normalizeSlug lowercases and trims", () => {
  assert.equal(normalizeSlug("  My-Shop  "), "my-shop");
});

test("getSlugValidationError rejects reserved slugs", () => {
  assert.equal(getSlugValidationError("admin"), "This slug is reserved");
});

test("getSlugValidationError accepts valid slug", () => {
  assert.equal(getSlugValidationError("my-shop-2"), "");
});

test("slug change limit allows pro once and proplus three times", () => {
  assert.equal(getSlugChangeLimit("free"), 0);
  assert.equal(getSlugChangeLimit("plus"), 0);
  assert.equal(getSlugChangeLimit("pro"), 1);
  assert.equal(getSlugChangeLimit("proplus"), 3);

  assert.equal(canChangeSlug({ effectivePlan: "pro", slugChangeUsed: 0 }), true);
  assert.equal(canChangeSlug({ effectivePlan: "pro", slugChangeUsed: 1 }), false);
  assert.equal(canChangeSlug({ effectivePlan: "proplus", slugChangeUsed: 2 }), true);
  assert.equal(canChangeSlug({ effectivePlan: "proplus", slugChangeUsed: 3 }), false);
  assert.equal(canChangeSlug({ effectivePlan: "free", slugChangeUsed: 0 }), false);
});

test("slug change usage reports used limit and remaining", () => {
  assert.deepEqual(
    getSlugChangeUsage({ effectivePlan: "proplus", slugChangeUsed: 1 }),
    { limit: 3, used: 1, remaining: 2 }
  );
});
