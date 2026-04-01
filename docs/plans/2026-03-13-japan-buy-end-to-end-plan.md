# Japan Buy 代購平台（抓取 + 前台 + 需求單 + Admin）Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 自動抓取 `fo-online.jp` 指定類別商品，提供前端繁中商品展示與需求單，並在 admin 後台管理需求單與代購下單流程（前端不顯示原站網址）。

**Architecture:** 使用 Cloudflare Workers（API）+ D1（資料庫）+ R2（圖片快取，可選）+ 前端 Web App。爬蟲採「定時全量 + 手動增量」策略，先嘗試 Browser Rendering `/crawl`；若受限則 fallback 到 Playwright/agent-browser 擷取。需求單與 admin 共用同一組 API 權限模型（user/admin）。

**Tech Stack:** Cloudflare Workers, Cloudflare D1, Cloudflare KV/R2 (optional), TypeScript, React/Next.js (frontend/admin), Playwright (驗證)

---

### Task 1: 定義資料模型與流程狀態

**Files:**
- Create: `docs/schema/er-diagram.md`
- Create: `workers/schema.sql`

**Step 1: 設計核心資料表**

- `products`：`id`, `source_site`, `source_product_code`, `title_ja`, `title_zh_tw`, `brand`, `category`, `price_jpy_tax_in`, `color_count`, `image_url`, `is_active`, `last_crawled_at`
- `product_snapshots`：保留每次抓取的原始欄位（價格、活動、可購狀態）
- `requirement_forms`：`id`, `customer_name`, `contact`, `notes`, `status`, `created_at`
- `requirement_items`：需求單明細（商品、數量、尺寸、顏色、備註）
- `admin_orders`：admin 實際代購處理紀錄（下單時間、代購人員、外部訂單編號）

**Step 2: 狀態機定義**

- 需求單狀態：`new -> reviewing -> quoted -> ordered -> shipped -> closed`
- 每個狀態都需保留 `updated_by` 與 `updated_at`

**Step 3: Commit**

```bash
git add docs/schema workers/schema.sql
git commit -m "docs: define data model and requirement workflow state machine"
```

### Task 2: 建立商品抓取管線（優先 /crawl，保留 fallback）

**Files:**
- Create: `workers/src/jobs/crawl-products.ts`
- Create: `workers/src/jobs/normalize-products.ts`
- Create: `workers/src/jobs/upsert-products.ts`
- Create: `workers/src/routes/admin/crawl.ts`

**Step 1: 寫 failing test（抓取結果結構）**

- 驗證輸出必含：`source_product_code`, `title_ja`, `price_jpy_tax_in`, `image_url`, `category`
- 驗證至少 20 筆（對 ranking 類別）

**Step 2: 實作 `/crawl` 版本**

- Worker 呼叫 Browser Rendering `/crawl`，入口 URL：
  - `https://fo-online.jp/ranking?bc=J&gc=1&lcc=001001001&scc=001001001002`
- 解析每張商品卡（rank 卡片）後寫入 `products` / `product_snapshots`
- 記錄 job log（成功數/失敗數/耗時）

**Step 3: 實作 fallback 抓取器**

- 若 `/crawl` 回傳阻擋/空內容，切換 Playwright 抓取器
- fallback 也輸出同一 normalize schema，避免後段分叉

**Step 4: Commit**

```bash
git add workers/src/jobs workers/src/routes/admin/crawl.ts
git commit -m "feat: add crawl pipeline with browser-rendering and fallback"
```

### Task 3: 建立前端商品展示（不顯示原網頁網址）

**Files:**
- Create: `frontend/src/pages/products.tsx`
- Create: `frontend/src/components/ProductCard.tsx`
- Create: `frontend/src/lib/format.ts`

**Step 1: 寫 failing test（UI 欄位）**

- 每張卡至少顯示：圖片、商品名（繁中/日文）、價格、規格（顏色數、分類）
- 不應顯示 `fo-online.jp` 原始連結

**Step 2: 實作卡片渲染**

- 使用內部 `product_id` 導向站內詳情頁
- 價格固定顯示 `JPY` 與最後更新時間

**Step 3: Commit**

```bash
git add frontend/src/pages/products.tsx frontend/src/components/ProductCard.tsx
git commit -m "feat: build storefront product list without source links"
```

### Task 4: 建立需求單流程

**Files:**
- Create: `frontend/src/pages/request.tsx`
- Create: `workers/src/routes/public/requirement-form.ts`
- Create: `frontend/src/components/RequirementForm.tsx`

**Step 1: 寫 failing test（送單）**

- 成功送出後建立 `requirement_forms` + `requirement_items`
- 欄位驗證：聯絡方式、至少一項商品、數量 > 0

**Step 2: 實作 API + 前端表單**

- 支援從商品頁加入需求單明細
- 支援自填「其他需求」文字（尺寸/顏色偏好）

**Step 3: Commit**

```bash
git add frontend/src/pages/request.tsx workers/src/routes/public/requirement-form.ts
git commit -m "feat: add requirement form flow"
```

### Task 5: 建立 Admin 需求單與代購處理台

**Files:**
- Create: `admin/src/pages/requests.tsx`
- Create: `admin/src/pages/requests/[id].tsx`
- Create: `workers/src/routes/admin/requests.ts`
- Create: `workers/src/routes/admin/orders.ts`

**Step 1: 寫 failing test（admin 流程）**

- admin 可查看新需求單列表
- admin 可更新狀態、填入代購備註與外部訂單號

**Step 2: 實作後台頁面與 API**

- 列表：依 `status`、日期篩選
- 詳情：顯示需求單明細 + 商品快照（避免後續商品變價造成資訊流失）

**Step 3: Commit**

```bash
git add admin/src workers/src/routes/admin
git commit -m "feat: add admin request management and order tracking"
```

### Task 6: 排程與監控

**Files:**
- Create: `workers/src/cron/crawl.ts`
- Create: `workers/src/lib/logger.ts`
- Create: `docs/ops/crawl-runbook.md`

**Step 1: 寫 failing test（排程執行）**

- cron 觸發可執行 crawl job 並寫入 log

**Step 2: 實作**

- 每日固定時間爬取（例如 UTC 01:00）
- admin 手動重跑按鈕
- 失敗告警（email/webhook）

**Step 3: Commit**

```bash
git add workers/src/cron workers/src/lib/logger.ts docs/ops/crawl-runbook.md
git commit -m "chore: add scheduled crawl and operational runbook"
```

### Task 7: 法務與合規檢查

**Files:**
- Create: `docs/compliance/source-site-policy.md`

**Step 1: 確認 robots 與站點使用條款**

- `fo-online.jp/robots.txt` 目前未封鎖 ranking 路徑
- 仍需人工確認該站 Terms 是否允許資料再展示與商業使用

**Step 2: 設計風險控管**

- 價格頁面顯示「最後更新時間」
- 若抓取失敗不覆蓋舊資料，避免前台空白

**Step 3: Commit**

```bash
git add docs/compliance/source-site-policy.md
git commit -m "docs: add crawling compliance checklist and risk controls"
```

