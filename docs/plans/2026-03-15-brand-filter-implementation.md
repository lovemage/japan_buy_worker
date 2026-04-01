# Brand Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add multi-select brand filters above category filters on the product list page, with correct API, URL, and pagination behavior.

**Architecture:** Add a reusable filter parser/builder for public product queries, expose a brand aggregation endpoint, and wire the list page to render multi-select brand pills from API data. Preserve current category and promo filters while extending the URL state.

**Tech Stack:** Cloudflare Workers, TypeScript, vanilla JS, Node test runner

---

### Task 1: Filter query helpers

**Files:**
- Create: `workers/src/routes/public/product-filters.ts`
- Test: `workers/test/product-filters.test.js`

**Step 1: Write the failing test**
- Add tests for parsing `brands=BREEZE, ALGY,,BREEZE` into `['BREEZE', 'ALGY']`.
- Add tests for building SQL clauses for category + promo + multi-brand filters.

**Step 2: Run test to verify it fails**
Run: `node --test workers/test/product-filters.test.js`
Expected: FAIL because helper module does not exist yet.

**Step 3: Write minimal implementation**
- Add parsing and SQL-clause helper functions.

**Step 4: Run test to verify it passes**
Run: `node --test workers/test/product-filters.test.js`
Expected: PASS.

### Task 2: Backend product and brand endpoints

**Files:**
- Modify: `workers/src/routes/public/products.ts`
- Modify: `workers/src/index.ts`
- Test: `workers/test/product-filters.test.js`

**Step 1: Write the failing test**
- Extend tests to cover query parsing outputs used by the route.

**Step 2: Run test to verify it fails**
Run: `node --test workers/test/product-filters.test.js`
Expected: FAIL on missing route helper behavior.

**Step 3: Write minimal implementation**
- Apply shared filters to `/api/products` list, totals, and SKU totals.
- Add `/api/product-brands` endpoint returning counts, optionally narrowed by category.
- Return selected brands in API filter payload.

**Step 4: Run test to verify it passes**
Run: `node --test workers/test/product-filters.test.js`
Expected: PASS.

### Task 3: Frontend brand multi-select UI

**Files:**
- Modify: `workers/public/index.html`
- Modify: `workers/public/assets/app-list.js`
- Modify: `workers/public/assets/styles.css`

**Step 1: Write the failing test**
- No DOM harness exists, so use the backend helper test as the required red step and implement frontend behavior with minimal surface change.

**Step 2: Write minimal implementation**
- Add brand filter container above categories.
- Fetch `/api/product-brands?category=...` during bootstrap.
- Read/write `brands` query param.
- Preserve `brands` through pagination and promo/category updates.

**Step 3: Verify behavior**
Run: `node --test workers/test/product-filters.test.js`
Expected: PASS.
- Then smoke-check the generated request URLs in code review.

### Task 4: Verification

**Files:**
- Verify modified files above

**Step 1: Run tests**
Run: `node --test workers/test/product-filters.test.js`
Expected: PASS.

**Step 2: Sanity-check file diffs**
Run: `git diff -- workers/src/index.ts workers/src/routes/public/products.ts workers/src/routes/public/product-filters.ts workers/public/index.html workers/public/assets/app-list.js workers/public/assets/styles.css workers/test/product-filters.test.js`
Expected: Only brand filter related changes.
