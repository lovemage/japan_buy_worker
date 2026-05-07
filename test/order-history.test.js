import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const storeHtml = readFileSync(new URL("../public/store.html", import.meta.url), "utf8");
const routerTs = readFileSync(new URL("../src/router.ts", import.meta.url), "utf8");
const requirementsTs = readFileSync(new URL("../src/routes/public/requirements.ts", import.meta.url), "utf8");
const adminRequirementsTs = readFileSync(new URL("../src/routes/admin/requirements.ts", import.meta.url), "utf8");
const adminOrdersJs = readFileSync(new URL("../public/assets/app-admin-orders.js", import.meta.url), "utf8");

test("store drawer exposes order history before filter sections", () => {
  const historyIndex = storeHtml.indexOf('href="/order-history.html"');
  const filterIndex = storeHtml.indexOf('id="promo-drawer-section"');

  assert.notEqual(historyIndex, -1, "Expected hamburger drawer to link to order history");
  assert.ok(historyIndex < filterIndex, "Expected order history link at the top of the drawer");
  assert.match(storeHtml, />\s*歷史訂單\s*</, "Expected the drawer link label to be 歷史訂單");
});

test("tenant router serves order history page and phone lookup API", () => {
  assert.ok(
    routerTs.includes('subPath === "/api/requirement-history"'),
    "Expected public API route for phone-based order history lookup"
  );
  assert.ok(
    routerTs.includes('subPath === "/order-history.html"') || routerTs.includes('subPath === "/order-history"'),
    "Expected tenant route for order-history.html"
  );
  assert.ok(
    routerTs.includes("order-history.html"),
    "Expected tenant HTML link rewriting for order-history.html"
  );
});

test("public requirements route can query history by member phone", () => {
  assert.ok(
    requirementsTs.includes("handlePublicRequirementHistory"),
    "Expected exported handler for public order history"
  );
  assert.match(
    requirementsTs,
    /WHERE\s+store_id\s*=\s*\?\s+AND\s+member_phone\s*=\s*\?/s,
    "Expected history query scoped by store and exact member phone"
  );
  assert.match(
    requirementsTs,
    /ORDER BY\s+created_at\s+DESC,\s*id\s+DESC/s,
    "Expected newest orders first"
  );
});

test("order history page submits phone number and renders orders", () => {
  const htmlUrl = new URL("../public/order-history.html", import.meta.url);
  const jsUrl = new URL("../public/assets/app-order-history.js", import.meta.url);

  assert.ok(existsSync(htmlUrl), "Expected order-history.html to exist");
  assert.ok(existsSync(jsUrl), "Expected app-order-history.js to exist");

  const html = readFileSync(htmlUrl, "utf8");
  const js = readFileSync(jsUrl, "utf8");

  assert.ok(html.includes('id="history-phone"'), "Expected a phone number input");
  assert.ok(html.includes('id="history-results"'), "Expected a results container");
  assert.ok(js.includes("/api/requirement-history?phone="), "Expected JS to call the history API with phone");
  assert.ok(js.includes("orderCode"), "Expected rendered history to include order codes");
});

test("member order history renders status and adjusted amount label", () => {
  const js = readFileSync(new URL("../public/assets/app-order-history.js", import.meta.url), "utf8");

  assert.ok(js.includes("statusText(order.status)"), "Expected member order history to render current order status");
  assert.ok(js.includes("已調整金額"), "Expected member order history to label adjusted amounts");
  assert.ok(js.includes("amountAdjusted"), "Expected member order history to use adjusted amount flag from API");
});

test("member order history renders product thumbnails linked to store detail pages", () => {
  const js = readFileSync(new URL("../public/assets/app-order-history.js", import.meta.url), "utf8");

  assert.ok(js.includes("selectedImageUrl"), "Expected order history to render saved item thumbnails");
  assert.ok(js.includes("/product?code="), "Expected order history items to link to in-store product detail pages");
  assert.ok(js.includes("order-item-thumb"), "Expected order history to style item thumbnails");
});

test("admin stats helper renders product thumbnails linked to store detail pages", () => {
  assert.ok(adminOrdersJs.includes("selectedImageUrl"), "Expected stats helper to retain item image URLs");
  assert.ok(adminOrdersJs.includes("code"), "Expected stats helper to retain product codes");
  assert.ok(adminOrdersJs.includes("stats-thumb"), "Expected stats helper to render thumbnails");
  assert.ok(adminOrdersJs.includes("/product?code="), "Expected stats helper rows to link to in-store product details");
});

test("admin order API and UI support adjusted item and shipping amounts", () => {
  assert.ok(adminRequirementsTs.includes("adjusted_items_total_twd"), "Expected admin API to persist adjusted item total");
  assert.ok(adminRequirementsTs.includes("adjusted_shipping_total_twd"), "Expected admin API to persist adjusted shipping total");
  assert.ok(adminRequirementsTs.includes("adjustedItemsTotalTwd"), "Expected admin API to expose adjusted item total");
  assert.ok(adminRequirementsTs.includes("adjustedShippingTotalTwd"), "Expected admin API to expose adjusted shipping total");

  assert.ok(adminOrdersJs.includes("js-adjusted-items-total"), "Expected admin UI input for adjusted item total");
  assert.ok(adminOrdersJs.includes("js-adjusted-shipping-total"), "Expected admin UI input for adjusted shipping total");
  assert.ok(adminOrdersJs.includes("已調整金額"), "Expected admin UI to show adjusted amount label");
});

test("public order history API returns adjusted totals to members", () => {
  assert.ok(requirementsTs.includes("adjusted_items_total_twd"), "Expected public API to read adjusted item total");
  assert.ok(requirementsTs.includes("adjusted_shipping_total_twd"), "Expected public API to read adjusted shipping total");
  assert.ok(requirementsTs.includes("amountAdjusted"), "Expected public API to expose adjusted amount flag");
  assert.ok(requirementsTs.includes("originalItemsTotalTwd"), "Expected public API to expose original item total");
});

test("admin can update per-order-item status and members can see it", () => {
  const migration = readFileSync(new URL("../migrations/0019_requirement_item_status.sql", import.meta.url), "utf8");
  const publicHistoryJs = readFileSync(new URL("../public/assets/app-order-history.js", import.meta.url), "utf8");

  assert.match(migration, /ALTER TABLE requirement_items ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'/);
  assert.ok(adminRequirementsTs.includes("VALID_ITEM_STATUSES"), "Expected admin API to define item status options");
  assert.ok(adminRequirementsTs.includes("itemId"), "Expected admin API to accept an item id");
  assert.match(adminRequirementsTs, /UPDATE requirement_items\s+SET status = \?/s, "Expected admin API to update item status");
  assert.ok(adminOrdersJs.includes("js-item-status-select"), "Expected admin UI to render an item status selector");
  assert.ok(adminOrdersJs.includes("itemStatusSelectHtml"), "Expected admin UI to render item status options");
  assert.ok(requirementsTs.includes("ri.status AS item_status"), "Expected member history API to read item status");
  assert.ok(requirementsTs.includes("itemStatus"), "Expected member history API to expose item status");
  assert.ok(publicHistoryJs.includes("itemStatusText(item.itemStatus)"), "Expected member order history to display item status");
});
