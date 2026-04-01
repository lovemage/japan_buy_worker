# Frontend MPA (List + Request + Success) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立純靜態 MPA 前端，完成商品展示、需求單提交、成功頁三段流程，並串接既有 Worker API。

**Architecture:** 前端由三個 HTML 頁面與共用 JS 模組組成，商品資料透過 `GET /api/products` 取得，需求單以 `POST /api/requirements` 提交。需求單草稿在瀏覽器端用 `localStorage` 保存，跨頁共享狀態。API 端先補 public requirement route，寫入 D1 的 `requirement_forms` 與 `requirement_items`。

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Cloudflare Workers (TypeScript), D1 (SQLite), Playwright

---

### Task 1: 建立前端靜態頁骨架

**Files:**
- Create: `workers/public/index.html`
- Create: `workers/public/request.html`
- Create: `workers/public/success.html`
- Create: `workers/public/assets/styles.css`
- Create: `workers/public/assets/app-list.js`
- Create: `workers/public/assets/app-request.js`
- Create: `workers/public/assets/app-success.js`
- Create: `workers/public/assets/draft-store.js`

**Step 1: Write the failing test**

```ts
// workers/tests/frontend-smoke.spec.ts
import { test, expect } from "@playwright/test";

test("index/request/success pages should load", async ({ page }) => {
  await page.goto("http://127.0.0.1:8787/index.html");
  await expect(page.locator("h1")).toBeVisible();
  await page.goto("http://127.0.0.1:8787/request.html");
  await expect(page.locator("form")).toBeVisible();
  await page.goto("http://127.0.0.1:8787/success.html?id=1");
  await expect(page.getByText("需求單已建立")).toBeVisible();
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers && npx playwright test workers/tests/frontend-smoke.spec.ts -v`
Expected: FAIL（頁面檔案不存在）

**Step 3: Write minimal implementation**

- 建立 3 頁 HTML 基本結構
- 建立共用 CSS 與 JS 載入點
- `success.html` 支援讀取 `id` query 顯示

**Step 4: Run test to verify it passes**

Run: `cd workers && npx playwright test workers/tests/frontend-smoke.spec.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
cd workers
git add public workers/tests/frontend-smoke.spec.ts
git commit -m "feat: scaffold static mpa pages for storefront flow"
```

### Task 2: 串接商品列表 API 與卡片渲染

**Files:**
- Modify: `workers/public/assets/app-list.js`
- Modify: `workers/public/index.html`
- Modify: `workers/public/assets/styles.css`
- Test: `workers/tests/list-render.spec.ts`

**Step 1: Write the failing test**

```ts
import { test, expect } from "@playwright/test";

test("product cards render from /api/products", async ({ page }) => {
  await page.route("**/api/products**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        products: [
          {
            id: 1,
            code: "J000001",
            nameJa: "測試商品",
            nameZhTw: null,
            brand: "BREEZE",
            category: "短袖T恤",
            priceJpyTaxIn: 990,
            colorCount: 3,
            imageUrl: "https://example.com/a.jpg",
            lastCrawledAt: "2026-03-13T00:00:00.000Z"
          }
        ]
      })
    });
  });

  await page.goto("http://127.0.0.1:8787/index.html");
  await expect(page.locator("[data-product-card]")).toHaveCount(1);
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers && npx playwright test workers/tests/list-render.spec.ts -v`
Expected: FAIL（未實作 fetch/render）

**Step 3: Write minimal implementation**

- `app-list.js` 呼叫 `/api/products?limit=20&offset=0`
- 渲染卡片：圖片、名稱、品牌、價格、分類、顏色數
- 圖片直接用 `imageUrl`
- 不渲染來源站 URL

**Step 4: Run test to verify it passes**

Run: `cd workers && npx playwright test workers/tests/list-render.spec.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
cd workers
git add public/assets/app-list.js public/index.html public/assets/styles.css workers/tests/list-render.spec.ts
git commit -m "feat: render product list from worker api"
```

### Task 3: 實作需求單草稿儲存與跨頁

**Files:**
- Modify: `workers/public/assets/draft-store.js`
- Modify: `workers/public/assets/app-list.js`
- Modify: `workers/public/assets/app-request.js`
- Test: `workers/tests/draft-flow.spec.ts`

**Step 1: Write the failing test**

```ts
import { test, expect } from "@playwright/test";

test("add item on index then visible on request page", async ({ page }) => {
  // mock product list
  // click "加入需求單"
  // navigate request page
  // assert draft item row exists
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers && npx playwright test workers/tests/draft-flow.spec.ts -v`
Expected: FAIL

**Step 3: Write minimal implementation**

- `draft-store.js` 提供 `getDraft/setDraft/addItem/clearDraft`
- `app-list.js` CTA 寫入 draft 後更新計數
- `app-request.js` 讀 draft 並渲染明細表

**Step 4: Run test to verify it passes**

Run: `cd workers && npx playwright test workers/tests/draft-flow.spec.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
cd workers
git add public/assets/draft-store.js public/assets/app-list.js public/assets/app-request.js workers/tests/draft-flow.spec.ts
git commit -m "feat: implement requirement draft cart flow"
```

### Task 4: 新增需求單 API（Worker）

**Files:**
- Create: `workers/src/routes/public/requirements.ts`
- Modify: `workers/src/index.ts`
- Test: `workers/tests/api-requirements.spec.ts`

**Step 1: Write the failing test**

```ts
import { test, expect } from "@playwright/test";

test("POST /api/requirements returns requirementId", async ({ request }) => {
  const res = await request.post("http://127.0.0.1:8787/api/requirements", {
    data: {
      customerName: "王小明",
      contact: "line:abc",
      notes: "",
      items: [
        {
          productId: 1,
          productNameSnapshot: "測試商品",
          quantity: 1,
          desiredSize: "",
          desiredColor: "",
          note: ""
        }
      ]
    }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBeTruthy();
  expect(body.requirementId).toBeTruthy();
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers && npx playwright test workers/tests/api-requirements.spec.ts -v`
Expected: FAIL（route 不存在）

**Step 3: Write minimal implementation**

- 驗證 `customerName/contact/items`
- insert `requirement_forms`
- insert `requirement_items`
- 回傳 `{ ok: true, requirementId }`

**Step 4: Run test to verify it passes**

Run: `cd workers && npx playwright test workers/tests/api-requirements.spec.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
cd workers
git add src/routes/public/requirements.ts src/index.ts workers/tests/api-requirements.spec.ts
git commit -m "feat: add public requirement submission api"
```

### Task 5: 串接 request/success 頁面提交流程

**Files:**
- Modify: `workers/public/assets/app-request.js`
- Modify: `workers/public/request.html`
- Modify: `workers/public/success.html`
- Modify: `workers/public/assets/app-success.js`
- Test: `workers/tests/submit-flow.spec.ts`

**Step 1: Write the failing test**

```ts
import { test, expect } from "@playwright/test";

test("submit request then redirect to success with id", async ({ page }) => {
  // preload localStorage draft
  // mock /api/requirements response {ok:true, requirementId: 88}
  // submit form
  // expect url contains success.html?id=88
});
```

**Step 2: Run test to verify it fails**

Run: `cd workers && npx playwright test workers/tests/submit-flow.spec.ts -v`
Expected: FAIL

**Step 3: Write minimal implementation**

- 送出前前端驗證必填與數量
- 成功後清空 draft
- 導向 `success.html?id=<requirementId>`

**Step 4: Run test to verify it passes**

Run: `cd workers && npx playwright test workers/tests/submit-flow.spec.ts -v`
Expected: PASS

**Step 5: Commit**

```bash
cd workers
git add public/assets/app-request.js public/request.html public/success.html public/assets/app-success.js workers/tests/submit-flow.spec.ts
git commit -m "feat: complete request submit and success redirect flow"
```

### Task 6: 最終驗證與文件更新

**Files:**
- Modify: `workers/README.md`

**Step 1: Write the failing test**

- 不新增新測試；改為整體測試命令驗證（屬整合驗證）

**Step 2: Run test to verify it fails**

Run: `cd workers && npx playwright test -v`
Expected: 若前面未完成會 FAIL

**Step 3: Write minimal implementation**

- README 增加前端頁面路徑與手動驗證步驟：
  - `/index.html`
  - `/request.html`
  - `/success.html?id=...`

**Step 4: Run test to verify it passes**

Run:

1. `cd workers && npm install`
2. `npm run d1:migrate:local`
3. `npm run dev`
4. `npx playwright test -v`

Expected: 全部 PASS

**Step 5: Commit**

```bash
cd workers
git add README.md
git commit -m "docs: add mpa storefront usage and verification"
```

