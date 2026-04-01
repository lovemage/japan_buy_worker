# Remove Product Snapshots Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop storing product snapshot history, move the latest payload onto `products`, and delete old D1 snapshot data without touching requirement/order data.

**Architecture:** Add payload columns directly to `products`, route all public reads to those columns, and replace snapshot inserts with direct product updates. Use a migration to backfill from the latest snapshot per product, then drop the obsolete snapshot table.

**Tech Stack:** Cloudflare Workers, TypeScript, SQLite/D1, Node test runner

---

### Task 1: Add failing tests for payload-on-products behavior

**Files:**
- Create: `workers/test/product-records.test.js`
- Create: `workers/src/jobs/product-records.ts`

**Step 1: Write the failing test**
- Assert payload parsing works from `products.source_payload_json`
- Assert product upsert columns include `source_payload_json` and `status_badges_json`

**Step 2: Run test to verify it fails**
Run: `node --test workers/test/product-records.test.js`
Expected: FAIL because helper does not exist yet.

**Step 3: Write minimal implementation**
- Add helpers for payload parsing and product record serialization.

**Step 4: Run test to verify it passes**
Run: `node --test workers/test/product-records.test.js`
Expected: PASS.

### Task 2: Switch runtime reads/writes away from snapshots

**Files:**
- Modify: `workers/src/jobs/upsert-products.ts`
- Modify: `workers/src/jobs/types.ts`
- Modify: `workers/src/routes/public/products.ts`
- Test: `workers/test/product-records.test.js`
- Test: `workers/test/product-filters.test.js`

**Step 1: Extend tests if needed**
- Cover route payload parsing helpers.

**Step 2: Run tests to verify red state**
Run: `node --test workers/test/product-records.test.js workers/test/product-filters.test.js`

**Step 3: Implement minimal code**
- Upsert payload JSON directly onto `products`
- Remove all runtime joins/selects against `product_snapshots`

**Step 4: Run tests to verify green state**
Run: `node --test workers/test/product-records.test.js workers/test/product-filters.test.js`

### Task 3: Migrate schema and delete old snapshot data

**Files:**
- Modify: `workers/schema.sql`
- Modify: `workers/migrations/0001_init.sql`
- Create: `workers/migrations/0002_remove_product_snapshots.sql`

**Step 1: Write migration**
- Add payload columns to `products`
- Backfill latest snapshot payload
- Drop snapshot index/table

**Step 2: Verify migration text**
- Review SQL carefully for order of operations and no references to requirement/order tables.

### Task 4: Verify and apply

**Files:**
- Verify files above

**Step 1: Run tests**
Run: `node --test workers/test/product-records.test.js workers/test/product-filters.test.js`
Expected: PASS.

**Step 2: Build dry run**
Run: `npx wrangler deploy --dry-run --outdir /tmp/japan-buy-workers-dry`
Expected: Worker bundles successfully.

**Step 3: Apply D1 migration**
Run: `npx wrangler d1 migrations apply japan_buy --remote`
Expected: `product_snapshots` removed, requirement/order tables unchanged.
