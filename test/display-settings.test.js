import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_DISPLAY_SETTINGS,
  canManageStoreLogo,
  parseDisplaySettings,
  sanitizeDisplaySettingsPatch,
} from "../src/shared/display-settings.js";

test("canManageStoreLogo allows plus and above plans", () => {
  assert.equal(canManageStoreLogo("free"), false);
  assert.equal(canManageStoreLogo("plus"), true);
  assert.equal(canManageStoreLogo("pro"), true);
  assert.equal(canManageStoreLogo("proplus"), true);
});

test("parseDisplaySettings falls back to defaults on invalid input", () => {
  assert.deepEqual(parseDisplaySettings(null), DEFAULT_DISPLAY_SETTINGS);
  assert.deepEqual(parseDisplaySettings("{"), DEFAULT_DISPLAY_SETTINGS);
});

test("sanitizeDisplaySettingsPatch keeps storeLogo for plus but still strips tagNames", () => {
  const sanitized = sanitizeDisplaySettingsPatch(
    {
      storeLogo: "logos/store.webp",
      tagNames: { hot: "人氣商品" },
      promoEnabled: false,
    },
    "plus"
  );

  assert.deepEqual(sanitized, {
    storeLogo: "logos/store.webp",
    promoEnabled: false,
  });
});

test("sanitizeDisplaySettingsPatch strips storeLogo for free plan", () => {
  const sanitized = sanitizeDisplaySettingsPatch(
    {
      storeLogo: "logos/store.webp",
      promoEnabled: true,
    },
    "free"
  );

  assert.deepEqual(sanitized, {
    promoEnabled: true,
  });
});
