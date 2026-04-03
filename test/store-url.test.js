import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStorePublicBaseUrl,
  buildStoreReturnToPath,
  buildProductShareUrl,
  buildStorePublicDisplayText,
} from "../public/assets/store-url.js";

test("buildStorePublicBaseUrl uses subdomain for pro plan", () => {
  const url = buildStorePublicBaseUrl({
    plan: "pro",
    slug: "xiaomei",
    mainDomain: "vovosnap.com",
    protocol: "https:",
    origin: "https://vovosnap.com",
    apiBase: "/s/xiaomei",
  });

  assert.equal(url, "https://xiaomei.vovosnap.com");
});

test("buildStorePublicBaseUrl uses path route for free/starter plans", () => {
  const url = buildStorePublicBaseUrl({
    plan: "starter",
    slug: "xiaomei",
    mainDomain: "vovosnap.com",
    protocol: "https:",
    origin: "https://xiaomei.vovosnap.com",
    apiBase: "",
  });

  assert.equal(url, "https://vovosnap.com/s/xiaomei");
});

test("buildStorePublicBaseUrl falls back to current origin and apiBase", () => {
  const url = buildStorePublicBaseUrl({
    plan: "free",
    slug: "",
    mainDomain: "",
    protocol: "http:",
    origin: "http://localhost:8787",
    apiBase: "/s/demo",
  });

  assert.equal(url, "http://localhost:8787/s/demo");
});

test("buildStoreReturnToPath matches plan routing", () => {
  assert.equal(buildStoreReturnToPath({ plan: "pro", slug: "xiaomei", apiBase: "" }), "/");
  assert.equal(buildStoreReturnToPath({ plan: "free", slug: "xiaomei", apiBase: "/s/xiaomei" }), "/s/xiaomei/");
});

test("buildProductShareUrl builds canonical product URL", () => {
  const url = buildProductShareUrl("AA-123", {
    plan: "starter",
    slug: "xiaomei",
    mainDomain: "vovosnap.com",
    protocol: "https:",
    origin: "https://vovosnap.com",
    apiBase: "/s/xiaomei",
  });

  assert.equal(
    url,
    "https://vovosnap.com/s/xiaomei/product?code=AA-123&returnTo=%2Fs%2Fxiaomei%2F"
  );
});

test("buildStorePublicDisplayText strips protocol for admin display", () => {
  const text = buildStorePublicDisplayText({
    plan: "pro",
    slug: "xiaomei",
    mainDomain: "vovosnap.com",
    protocol: "https:",
    origin: "https://vovosnap.com",
    apiBase: "/s/xiaomei",
  });

  assert.equal(text, "xiaomei.vovosnap.com/");
});
