import test from "node:test";
import assert from "node:assert/strict";

import { getStorefrontFaviconHref } from "../public/assets/favicon.js";

test("getStorefrontFaviconHref uses store logo when present", () => {
  const href = getStorefrontFaviconHref({
    displaySettings: { storeLogo: "12/popup-ads/abc.webp" },
    apiBase: "/s/demo",
    fallbackHref: "/assets/images/logo-3.png",
  });

  assert.equal(href, "/s/demo/api/images/12/popup-ads/abc.webp");
});

test("getStorefrontFaviconHref falls back to default when store logo missing", () => {
  const href = getStorefrontFaviconHref({
    displaySettings: {},
    apiBase: "/s/demo",
    fallbackHref: "/assets/images/logo-3.png",
  });

  assert.equal(href, "/assets/images/logo-3.png");
});
