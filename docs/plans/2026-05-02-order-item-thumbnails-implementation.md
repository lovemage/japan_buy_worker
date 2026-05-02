# Order Item Thumbnails Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add clickable product thumbnails to member order history and the admin order stats helper.

**Architecture:** Use existing order item data already returned by the public and admin requirement APIs: `selectedImageUrl` and `code`. Frontend renderers will build in-store product links with `/product?code=...`; rows without `code` remain visible but not clickable.

**Tech Stack:** Plain browser JavaScript, Cloudflare Worker route responses, Node test runner.

---

### Task 1: Member Order History Thumbnails

**Files:**
- Modify: `test/order-history.test.js`
- Modify: `public/assets/app-order-history.js`

**Step 1: Write the failing test**

Add assertions to the member order history test that require:

```js
assert.ok(js.includes("selectedImageUrl"), "Expected order history to render saved item thumbnails");
assert.ok(js.includes("/product?code="), "Expected order history items to link to in-store product detail pages");
assert.ok(js.includes("order-item-thumb"), "Expected order history to style item thumbnails");
```

**Step 2: Run test to verify it fails**

Run: `node --test test/order-history.test.js`

Expected: FAIL because `app-order-history.js` does not yet render item thumbnails or internal product links.

**Step 3: Write minimal implementation**

In `public/assets/app-order-history.js`:

- Add a helper to build internal product detail URLs from `item.code`.
- For each item row, render a left thumbnail using `item.selectedImageUrl`.
- Wrap the thumbnail and product name in an anchor when a product detail URL exists.
- Keep the row readable when no code exists.

**Step 4: Run test to verify it passes**

Run: `node --test test/order-history.test.js`

Expected: PASS.

### Task 2: Admin Stats Helper Metadata

**Files:**
- Modify: `test/order-history.test.js`
- Modify: `public/assets/app-admin-orders.js`

**Step 1: Write the failing test**

Add assertions requiring stats aggregation to keep image/code metadata:

```js
assert.ok(adminOrdersJs.includes("selectedImageUrl"), "Expected stats helper to retain item image URLs");
assert.ok(adminOrdersJs.includes("code"), "Expected stats helper to retain product codes");
assert.ok(adminOrdersJs.includes("stats-thumb"), "Expected stats helper to render thumbnails");
assert.ok(adminOrdersJs.includes("/product?code="), "Expected stats helper rows to link to in-store product details");
```

**Step 2: Run test to verify it fails**

Run: `node --test test/order-history.test.js`

Expected: FAIL because `computeStats` currently returns `[name, qty]` only and the stats table has no thumbnails.

**Step 3: Write minimal implementation**

In `public/assets/app-admin-orders.js`:

- Change `computeStats` to return objects with `name`, `qty`, `imageUrl`, and `code`.
- Keep aggregation by product name.
- Retain the first non-empty image URL and product code seen for each aggregate product.
- Update `formatStatsText` so copy output remains `商品 x 數量`.
- Update `buildStatsHtml` to render a thumbnail and in-store product link.

**Step 4: Run test to verify it passes**

Run: `node --test test/order-history.test.js`

Expected: PASS.

### Task 3: Styling And Full Verification

**Files:**
- Modify: `public/assets/styles.css`

**Step 1: Add minimal styles**

Add compact thumbnail styles for:

```css
.order-item-thumb
.order-item-product-link
.stats-thumb
.stats-product-cell
.stats-product-link
```

**Step 2: Run focused tests**

Run: `node --test test/order-history.test.js`

Expected: PASS.

**Step 3: Run full tests**

Run: `node --test test/*.test.js`

Expected: all tests pass.

**Step 4: Inspect git diff**

Run: `git diff --check`

Expected: no whitespace errors.
