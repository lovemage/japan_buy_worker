import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStorePublicBaseUrl,
  buildStoreReturnToPath,
  buildProductShareUrl,
  buildStorePublicDisplayText,
  buildStoreDomainChangeMessage,
} from "../public/assets/store-url.js";

test("buildStorePublicBaseUrl uses subdomain for proplus plan", () => {
  const url = buildStorePublicBaseUrl({
    plan: "proplus",
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
  assert.equal(buildStoreReturnToPath({ plan: "proplus", slug: "xiaomei", apiBase: "" }), "/");
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
    plan: "proplus",
    slug: "xiaomei",
    mainDomain: "vovosnap.com",
    protocol: "https:",
    origin: "https://vovosnap.com",
    apiBase: "/s/xiaomei",
  });

  assert.equal(text, "xiaomei.vovosnap.com/");
});

test("buildStoreDomainChangeMessage tells proplus users to wait for subdomain updates", () => {
  const message = buildStoreDomainChangeMessage({
    plan: "proplus",
    slug: "xiaomei",
    mainDomain: "vovosnap.com",
    protocol: "https:",
    origin: "https://vovosnap.com",
    apiBase: "/s/xiaomei",
  });

  assert.match(message, /xiaomei\.vovosnap\.com/);
  assert.match(message, /等待/);
});

test("buildStoreDomainChangeMessage tells path-based stores to wait for route updates", () => {
  const message = buildStoreDomainChangeMessage({
    plan: "starter",
    slug: "newshop",
    mainDomain: "vovosnap.com",
    protocol: "https:",
    origin: "https://vovosnap.com",
    apiBase: "/s/oldshop",
  });

  assert.match(message, /vovosnap\.com\/s\/newshop/);
  assert.match(message, /等待/);
});
