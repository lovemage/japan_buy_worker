# 匯款回報查帳 + 依電話合併訂單 — 實作計畫

- 日期：2026-09-08
- 範圍：買家訂單（`requirement_forms`）的離線匯款回報／店家後台核帳，以及店家後台依電話合併同客戶訂單
- 已定案決策：
  1. 合併方式 = **併入主訂單**（被併單保留、標記 `merged`、可追溯）
  2. 匯款回報驗證 = **訂單編號 + 電話比對**（不發簡訊 OTP）
  3. 合併後運費 = **店家手動調整**（沿用現有「調整訂單金額」欄位）

---

## 現況摘要

| 項目 | 現況 |
|---|---|
| 買家訂單 | `requirement_forms` + `requirement_items`，狀態 `pending/paid/preparing/ordered/shipped/completed/cancelled` |
| 收款 | 只有 PAYUNi BYO（`store_payment_orders`），店家按「產生收款連結」；**無離線匯款流程** |
| 店家收款帳戶 | **不存在**，`store_payment_configs` 只有 PAYUNi 加密憑證 |
| 買家查訂單 | `/order-history.html` → `GET /api/requirement-history?phone=`，純列表 |
| 後台訂單 | `app-admin-orders.js`，可搜尋電話，**無分群、無合併**，列表 `LIMIT 100` 無分頁 |

---

## Phase 1：匯款回報 + 後台查帳

### 1.1 Migration `migrations/0026_remittance_report.sql`

```sql
-- 買家匯款回報（離線銀行轉帳），與 PAYUNi 線上金流並行
ALTER TABLE requirement_forms ADD COLUMN remittance_status TEXT
  CHECK (remittance_status IN ('reported','verified','rejected') OR remittance_status IS NULL);
ALTER TABLE requirement_forms ADD COLUMN remittance_last5 TEXT;      -- 帳號後五碼，僅數字
ALTER TABLE requirement_forms ADD COLUMN remittance_amount INTEGER;  -- 買家自報匯款金額 TWD
ALTER TABLE requirement_forms ADD COLUMN remittance_paid_date TEXT;  -- YYYY-MM-DD
ALTER TABLE requirement_forms ADD COLUMN remittance_note TEXT;
ALTER TABLE requirement_forms ADD COLUMN remittance_reported_at TEXT;
ALTER TABLE requirement_forms ADD COLUMN remittance_verified_at TEXT;

CREATE INDEX IF NOT EXISTS idx_requirement_forms_remittance
  ON requirement_forms(store_id, remittance_status)
  WHERE remittance_status IS NOT NULL;
```

`remittance_status` 語意：`NULL` 未回報 → `reported` 買家已回報待核 → `verified` 店家已核銷 → `rejected` 店家駁回（買家可重報）。

### 1.2 店家收款帳戶設定

存 `app_settings`，`key = 'remittance_accounts'`，沿用 `display_settings` / `popup_ads` / `banner_settings` 的既有慣例，不開新表。

```json
{
  "enabled": true,
  "instruction": "匯款後請回報帳號後五碼，我們會在 1 個工作天內核對",
  "accounts": [
    { "bankName": "國泰世華", "bankCode": "013", "accountNo": "1234567890123", "accountName": "王小明" }
  ]
}
```

> 這是店家對外公開的收款資訊（買家必須看得到），與 PAYUNi 商店密鑰性質不同，明文存 `app_settings` 即可，**不要**走 `secret-box.js`。

### 1.3 純邏輯模組 `src/shared/remittance-logic.js`

抽成純函式以便單元測試（沿用 `billing-logic.js` / `store-payment-logic.js` 的作法）：

- `normalizeLast5(input)` → 去空白，必須恰好 5 位數字，否則回 `null`
- `normalizePaidDate(input)` → `YYYY-MM-DD`，不可未來日期、不可早於訂單建立日
- `validateRemittanceReport({ last5, amount, paidDate, orderCreatedAt })` → `{ ok, error }`
- `canReportRemittance(form)` → 拒絕條件：`status` 為 `cancelled`／`shipped`／`completed`、`remittance_status === 'verified'`、已被合併（`merged_into_id` 不為 null）
- `parseRemittanceAccounts(rawValue)` / `sanitizeRemittanceAccountsPatch(input)` → 對齊 `display-settings.js` 的 parse/sanitize 模式

### 1.4 API

**新增 `src/routes/public/remittance.ts`**

| 端點 | 方法 | 說明 |
|---|---|---|
| `/api/remittance-info` | GET | 回傳店家收款帳戶（`enabled` 為 false 時回 `{ ok: true, enabled: false }`） |
| `/api/remittance-report` | POST | 買家回報 |

`POST /api/remittance-report` body：`{ orderCode, phone, last5, amount, paidDate, note }`

後端流程：
1. `SELECT id, status, created_at, remittance_status, merged_into_id FROM requirement_forms WHERE store_id = ? AND order_code = ? AND member_phone = ?`
2. 查無 → 回 `400`，**錯誤訊息不區分「訂單不存在」與「電話不符」**（避免變成訂單編號探測器）
3. `canReportRemittance` + `validateRemittanceReport` 檢查
4. `UPDATE ... SET remittance_status='reported', remittance_last5=?, ..., remittance_reported_at=datetime('now')`
5. 觸發店家通知（`src/services/email-notifications.ts` 既有管道）

在 `src/router.ts` 的「Public API routes (no auth)」區塊註冊（約 `src/router.ts:625` 附近）。

**擴充 `src/routes/admin/requirements.ts` 的 PATCH**

新增分支 `body.remittanceStatus`：
- `'verified'` → 設 `remittance_verified_at`，**同時** `status = 'paid'`（一個動作完成核帳）
- `'rejected'` → 清 `remittance_verified_at`，`status` 不動

GET 列表 SQL（`src/routes/admin/requirements.ts:277`）SELECT 加上 7 個 `remittance_*` 欄位並輸出到 JSON。

### 1.5 前端

- **`public/success.html`**：訂單明細下方加「我已完成匯款」摺疊區塊 — 先 `GET /api/remittance-info` 顯示收款帳戶（含一鍵複製帳號），下方為後五碼／金額／匯款日期表單。`enabled` 為 false 時整個區塊不渲染。
- **`public/order-history.html` + `public/assets/app-order-history.js`**：每張可回報的訂單加「回報匯款」按鈕，開同一個表單元件；已回報顯示「待核帳（後五碼 12345）」，已核銷顯示「已核帳」。
- **`public/assets/app-admin-orders.js`**：
  - `FILTER_TABS` 加「待核帳」（`remittance_status === 'reported'`），與現有狀態 tab 並列
  - 訂單卡片在有回報時顯示回報區塊：後五碼／自報金額／匯款日期／回報時間，以及自報金額與訂單總額**不符時的紅字提示**
  - 加「核銷」「駁回」按鈕 → `PATCH /api/admin/requirements`
  - `matchesSearch` 的 `fields` 加入 `remittanceLast5`，讓店家能用後五碼反查訂單
- **`public/admin.html`**：設定分頁新增「匯款收款帳戶」設定區（銀行名稱／代號／帳號／戶名，可多筆＋啟用開關＋匯款說明文字）

---

## Phase 2：依電話合併訂單

### 2.1 Migration `migrations/0027_order_merge.sql`

```sql
ALTER TABLE requirement_forms ADD COLUMN merged_into_id INTEGER
  REFERENCES requirement_forms(id) ON DELETE SET NULL;
ALTER TABLE requirement_forms ADD COLUMN merged_at TEXT;

-- 商品搬到主單後，仍記得原本屬於哪張訂單（買家查歷史要顯示，且支援拆回）
ALTER TABLE requirement_items ADD COLUMN origin_form_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_requirement_forms_merged_into
  ON requirement_forms(merged_into_id) WHERE merged_into_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_requirement_items_origin
  ON requirement_items(origin_form_id) WHERE origin_form_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_requirement_forms_store_phone
  ON requirement_forms(store_id, member_phone);
```

`origin_form_id` 是本階段的關鍵：商品 `requirement_form_id` 搬到主單後，被併訂單在買家歷史頁會變成空殼；有了 `origin_form_id` 才能還原「這張單原本買了什麼」，也才拆得回去。

`requirement_forms.status` 新增 `'merged'`，DB 端無 CHECK，只需在 `VALID_STATUSES`（`src/routes/admin/requirements.ts:3`）加入。

### 2.2 純邏輯模組 `src/shared/order-merge-logic.js`

- `canBeMergePrimary(form)` → 必須 `merged_into_id` 為 null、`status` 為 `pending`／`paid`／`preparing`
- `canBeMerged(form)` → 拒絕條件：
  - `status` 為 `shipped`／`completed`／`cancelled`／`merged`
  - `merged_into_id` 不為 null（**不可鏈式合併**）
  - `remittance_status` 為 `reported` 或 `verified`（已在對帳中，併走會對不上）
  - 已有 `store_payment_orders.status = 'paid'` 的收款單
- `validateMerge(primary, others)` → 檢查全部同 `store_id`、同 `member_phone`、`others` 不含 `primary`、至少一張
- `computeMergedShipping(primary, others)` → 回傳 `{ primaryShippingKept, zeroedFormIds }`（依決策：保留主單運費、其餘歸零，店家再手動調）
- `buildMergeNote(primary, others)` → 產生 `[已合併] #05075678, #05063344` 附加到主單 `notes`

### 2.3 API（`src/routes/admin/requirements.ts`）

**`GET /api/admin/requirements?mergeCandidates=<formId>`**
回傳同 `store_id` + 同 `member_phone` 且 `canBeMerged` 為真的其他訂單（含金額、建檔時間、商品數），供合併面板勾選。

**`POST /api/admin/requirements/merge`**
body：`{ primaryId, mergeIds: [] }`

用 `db.batch()` 包成單一交易：
1. 重查 primary 與 mergeIds 全部 row（**不信任前端傳來的狀態**），跑 `validateMerge`
2. `UPDATE requirement_items SET requirement_form_id = :primaryId, origin_form_id = COALESCE(origin_form_id, requirement_form_id) WHERE requirement_form_id IN (:mergeIds)`
3. `UPDATE requirement_forms SET status='merged', merged_into_id=:primaryId, merged_at=datetime('now'), shipping_international_jpy=0, shipping_domestic_twd=0, shipping_total_twd=0 WHERE id IN (:mergeIds) AND store_id=?`
4. `UPDATE requirement_forms SET notes = :mergedNote, adjusted_items_total_twd = NULL, updated_at=datetime('now') WHERE id = :primaryId`
   （清掉主單既有的金額調整，因為品項變了，舊的調整值已失效）
5. 回傳合併後的主單

**`POST /api/admin/requirements/unmerge`**（拆回，同批做掉）
body：`{ formId }` — 依 `origin_form_id` 把商品搬回、還原 `status='pending'`、清 `merged_into_id`。誤操作無法用 SQL 手動救，這個端點與合併同時交付，不延後。

### 2.4 前端

- **`public/assets/app-admin-orders.js`**
  - 訂單卡片在偵測到同電話還有可併訂單時，顯示「此客戶還有 N 張訂單可合併」
  - 點開合併面板：列出候選訂單（訂單編號／日期／金額／品項數）＋ checkbox ＋「合併到本單」
  - 合併前跳確認：列出將被併入的訂單編號與合併後總金額，並提示「運費需自行調整」
  - 主單卡片顯示「已合併 #xxx, #yyy」與「拆回」按鈕
  - `merged` 狀態的訂單預設**不出現在列表**（避免重複顯示），可由「已合併」tab 查看
- **`public/assets/app-order-history.js`**：被併訂單顯示「已併入訂單 #05081234」，商品清單改由 `origin_form_id` 還原，價格照舊顯示。
- **`src/routes/public/requirements.ts:629`（`handlePublicRequirementHistory`）**：SELECT 加 `merged_into_id`，並把主單的 `order_code` 一併帶出；items 查詢改為 `WHERE ri.requirement_form_id IN (...) OR ri.origin_form_id IN (...)`。

---

## Phase 3：前提修補（與上述兩項功能直接相依）

1. **後台訂單分頁**（`src/routes/admin/requirements.ts:277`）
   目前硬寫 `LIMIT 100` 且無分頁。合併功能要找「同電話的舊訂單」，超過 100 筆的店家根本撈不到候選。改為 `?limit=&offset=` 或 cursor 分頁，前端加「載入更多」。**這是 Phase 2 的必要前置。**

2. **`/api/requirement-history` 的資料暴露面**（`src/routes/public/requirements.ts:641`）
   只憑一支電話就能取得姓名、完整地址、Line ID。本次已決定不加 OTP，但既然要把這頁擴充成「查帳入口」，至少：
   - 收件地址在回應中遮罩（保留縣市 + 前 6 字，其餘以 `⋯` 取代）
   - Line ID 不回傳（頁面上並不需要）
   - 加簡易頻率限制（同 IP 每分鐘 10 次，用 `app_settings` 或 KV 計數）

---

## 測試（`npm test`，`node:test`）

沿用專案既有兩種測試風格：純函式單元測試 + 讀原始碼字串斷言的接線測試。

- **`test/remittance-logic.test.js`** — `normalizeLast5`（`"12345"` 過、`"1234"` 擋、`"abcde"` 擋、`" 12345 "` 過）、`normalizePaidDate`（未來日期擋、早於建單日擋）、`canReportRemittance` 各拒絕條件
- **`test/order-merge-logic.test.js`** — `canBeMerged` 逐條拒絕（已出貨／已取消／已被併／已回報匯款／已付款收款單）、`validateMerge` 跨店與跨電話擋、`computeMergedShipping` 運費歸零、鏈式合併擋
- **`test/remittance-flow.test.js`** — 路由已註冊、PATCH 有 `remittanceStatus` 分支、`success.html` 與 `order-history.html` 有回報入口、後台有「待核帳」tab
- **`test/order-merge-flow.test.js`** — merge/unmerge 端點已註冊、migration 檔存在且含 `origin_form_id`、`VALID_STATUSES` 含 `merged`、買家歷史頁會顯示併入提示

---

## 交付順序與相依

```
Phase 1 匯款回報（獨立，可先上）
  └─ Phase 3.1 訂單分頁（Phase 2 前置）
       └─ Phase 2 合併訂單（合併規則要讀 Phase 1 的 remittance_status）
            └─ Phase 3.2 查詢頁資料遮罩
```

Phase 1 與 Phase 2 是兩次獨立部署。Migration 依 `npm run d1:migrate:remote` 套用，**只改 `migrations/`，不要動 `workers/migrations/`**（見 `migrations/0022_store_payment.sql` 開頭註記）。

部署後若改動公開 HTML（`success.html`、`order-history.html`），記得清 Cloudflare 邊緣快取才會即時生效。

## 未涵蓋（明確排除）

- 銀行 API 自動對帳（本計畫是人工核銷）
- 簡訊 OTP 會員登入（本輪已決定不做，若之後要做，`phone_verification_codes` 表與 `src/services/every8d.ts` 已就緒）
- 合併後自動重算運費（依決策由店家手動調整）
- 跨店家合併訂單（`store_id` 一律隔離）

---

## 實作結果（2026-09-08）

Phase 1 / 2 / 3 全數完成。`npm test` 269 項通過，`wrangler deploy --dry-run` 編譯通過，
兩個 migration 已在本地 D1 套用並實測（CHECK 約束、核銷、合併、拆回、索引命中）。

### 與原計畫的四處偏離

1. **合併不歸零被併單運費**（原計畫要歸零）
   歸零會讓運費值永久遺失，拆回時救不回來。改為完全不動被併單的金額欄位，
   改在買家端把 merged 訂單的合計換成「已併入訂單 #xxx，款項以該訂單為準」。
   結果是 unmerge 可以 100% 還原，且買家不會誤以為同一筆錢要付兩次。
   連帶移除了原計畫的 `computeMergedShipping()`。

2. **`status` 不開放手動設成 `merged`**（原計畫要加進 `VALID_STATUSES`）
   `merged` 只由合併端點寫入。若讓店家能從下拉選單設定，`status` 會和
   `merged_into_id` 脫鉤，產生一張標記為已合併但沒有主單的孤兒訂單。
   後台改為對 merged 訂單隱藏狀態下拉，只顯示「已合併」標記與「拆回」按鈕。

3. **匯款回報不發店家通知**（原計畫寫「觸發既有管道」）
   查證後 `src/services/email-notifications.ts` 只處理方案到期／開通，
   專案沒有任何「訂單事件通知店家」的既有管道。硬加會是這次範圍外的新子系統。
   店家目前靠訂單分頁的「待核帳」tab 計數看到新回報。

4. **Phase 3.2 改為移除欄位，未做遮罩與頻率限制**
   查證後 `order-history.html` 只讀 `memberName`、金額與品項，
   `recipientAddress` / `recipientCity` / `lineId` / `memberPhone` 從未被前端使用。
   直接從回應移除比遮罩更徹底，且對現有畫面零影響。
   **頻率限制未實作** — 需要 KV 或 D1 計數，且有誤擋正常買家的風險，留給業主決定。

### 已知待辦

- `/api/requirement-history` 仍是「知道電話就能查到姓名與訂單」。本輪已決定不加 OTP，
  若之後要收緊，`phone_verification_codes` 表與 `src/services/every8d.ts` 已就緒。
- 匯款回報沒有頻率限制。
