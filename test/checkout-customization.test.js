import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const admin = readFileSync(new URL("../public/admin.html", import.meta.url), "utf8");
const success = readFileSync(new URL("../public/success.html", import.meta.url), "utf8");
const payResult = readFileSync(new URL("../public/pay-result.html", import.meta.url), "utf8");
const router = readFileSync(new URL("../src/router.ts", import.meta.url), "utf8");
const storeInfo = readFileSync(new URL("../src/routes/admin/store-info.ts", import.meta.url), "utf8");

test("admin exposes all checkout completion copy and one social destination", () => {
  for (const id of [
    "checkout-title-input", "checkout-message-title-input", "checkout-message-input",
    "checkout-screenshot-toggle", "checkout-screenshot-title-input", "checkout-screenshot-message-input",
    "checkout-order-summary-title-input",
    "checkout-paid-title-input", "checkout-paid-message-input", "checkout-social-toggle",
    "checkout-social-platform", "checkout-social-title-input", "checkout-social-message-input",
    "checkout-social-url-input", "checkout-social-image-upload", "checkout-preview-button",
  ]) assert.match(admin, new RegExp(`id=["']${id}["']`));
  assert.match(admin, /LINE 社群/);
  assert.match(admin, /Facebook 粉絲團/);
  assert.match(admin, /Threads/);
  assert.match(admin, /Instagram/);
  assert.match(admin, /openCheckoutSocialCropper/);
  assert.match(admin, /openCheckoutPreview/);
  assert.doesNotMatch(admin, /id=["']checkout-(?:copy-button|back-button|social-button)-input["']/);
});

test("customer completion pages load the public customization endpoint safely", () => {
  assert.match(success, /\/api\/checkout-settings/);
  assert.doesNotMatch(success, /checkoutMessage\.replace\([^)]*\).*innerHTML/s);
  assert.match(success, /checkout-social-card/);
  assert.match(success, /checkoutPreview/);
  assert.match(success, /vovosnap_checkout_preview/);
  assert.match(payResult, /\/api\/checkout-settings/);
  assert.match(payResult, /checkout-social-card/);
});

test("router exposes public checkout settings and owner-only social image operations", () => {
  assert.match(router, /subPath === "\/api\/checkout-settings"/);
  assert.match(router, /subPath === "\/api\/admin\/checkout-social\/upload"/);
  assert.match(router, /subPath === "\/api\/admin\/checkout-social\/delete"/);
  assert.match(storeInfo, /checkout-social/);
  assert.match(storeInfo, /ctx\.r2\.put/);
  assert.match(storeInfo, /ctx\.r2\.delete/);
});