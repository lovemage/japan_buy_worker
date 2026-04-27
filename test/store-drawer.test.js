import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const storeHtml = readFileSync(new URL("../public/store.html", import.meta.url), "utf8");
const stylesCss = readFileSync(new URL("../public/assets/styles.css", import.meta.url), "utf8");

test("mobile storefront drawer panels keep hidden state when collapsed", () => {
  assert.ok(
    storeHtml.includes('data-drawer-panel hidden'),
    "Expected store drawer to mark the brand panel as initially hidden"
  );

  assert.ok(
    stylesCss.includes('.drawer-filter-list[hidden]') || stylesCss.includes('[data-drawer-panel][hidden]'),
    "Expected drawer styles to explicitly hide collapsed panels"
  );
});
