import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const imageEditRoute = readFileSync(new URL("../src/routes/admin/image-edit.ts", import.meta.url), "utf8");
const storeInfoRoute = readFileSync(new URL("../src/routes/admin/store-info.ts", import.meta.url), "utf8");
const adminProductsJs = readFileSync(new URL("../public/assets/app-admin-products.js", import.meta.url), "utf8");
const adminRecognizeJs = readFileSync(new URL("../public/assets/app-admin-recognize.js", import.meta.url), "utf8");
const adminHtml = readFileSync(new URL("../public/admin.html", import.meta.url), "utf8");

test("AI image-edit route returns image data for client-side WebP conversion instead of storing to R2", () => {
  assert.ok(imageEditRoute.includes("imageDataUrl"), "Expected image edit route to return imageDataUrl");
  assert.ok(!imageEditRoute.includes("/ai-edit/"), "Expected image edit route to stop writing ai-edit assets to R2");
});

test("AI banner generation returns image data for client-side WebP upload instead of storing generated files to R2", () => {
  assert.ok(storeInfoRoute.includes("imageDataUrl"), "Expected banner generation route to return imageDataUrl");
  assert.ok(!storeInfoRoute.includes("banner_gen_preview"), "Expected no preview asset R2 storage path");
});

test("admin frontends consume imageDataUrl for WebP conversion", () => {
  assert.ok(adminProductsJs.includes("data.imageDataUrl"), "Expected product admin AI edit flow to use imageDataUrl");
  assert.ok(adminRecognizeJs.includes("data.imageDataUrl"), "Expected recognize AI edit flow to use imageDataUrl");
  assert.ok(adminHtml.includes("d.imageDataUrl"), "Expected admin banner AI flow to use imageDataUrl");
});
