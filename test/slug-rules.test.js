import test from "node:test";
import assert from "node:assert/strict";

import { normalizeSlug, getSlugValidationError, canChangeSlugOnceForPro } from "../src/shared/slug-rules.js";

test("normalizeSlug lowercases and trims", () => {
  assert.equal(normalizeSlug("  My-Shop  "), "my-shop");
});

test("getSlugValidationError rejects reserved slugs", () => {
  assert.equal(getSlugValidationError("admin"), "This slug is reserved");
});

test("getSlugValidationError accepts valid slug", () => {
  assert.equal(getSlugValidationError("my-shop-2"), "");
});

test("canChangeSlugOnceForPro allows only first change on pro", () => {
  assert.equal(canChangeSlugOnceForPro({ effectivePlan: "pro", slugChangeUsed: 0 }), true);
  assert.equal(canChangeSlugOnceForPro({ effectivePlan: "pro", slugChangeUsed: 1 }), false);
  assert.equal(canChangeSlugOnceForPro({ effectivePlan: "free", slugChangeUsed: 0 }), false);
});
