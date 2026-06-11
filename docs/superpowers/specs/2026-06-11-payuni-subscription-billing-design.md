# PAYUNi 訂閱方案線上付款 — Design Spec

日期：2026-06-11
狀態：已與業主確認方向

## 目標

把定價卡的「聯繫客服開啟方案」換成線上付款：賣家選方案（Plus / Pro / Pro+）與期數（1 / 6 / 12 個月），透過 PAYUNi 統一金流 UPP 整合式支付頁以**信用卡**或 **ATM 虛擬帳號**單次付款，付款成功後自動開通方案。不做定期定額自動續扣。

## 決策記錄

| 決策 | 結果 |
|---|---|
| 金流商 | PAYUNi 統一金流（不用 ECPay；repo 內原本就沒有 ECPay 程式碼） |
| 串接環節 | SaaS 訂閱方案付款（買家端結帳不在範圍） |
| 付款模式 | 單次付款買 1/6/12 個月 |
| 付款方式 | 信用卡＋ATM 虛擬帳號（不開超商代碼） |
| 串接方式 | UPP 整合式支付頁（跳轉託管頁；卡號不經過我們，無 PCI 負擔） |
| 帳號 | 業主已有正式商店代號與 Hash Key/IV；程式保留 sandbox 切換，先測試再切正式 |

## PAYUNi 協議（依官方 PHP SDK 確認）

- 端點：正式 `https://api.payuni.com.tw/api/`、測試 `https://sandbox-api.payuni.com.tw/api/`
- UPP：瀏覽器以 form POST 至 `{base}/upp`，欄位 `MerID`、`Version`（"1.0"）、`EncryptInfo`、`HashInfo`
- `EncryptInfo` 加密格式（須與 PHP SDK 相容）：
  1. 參數物件序列化為 query string（`MerID`、`MerTradeNo`、`TradeAmt`、`Timestamp`、`ReturnURL`、`NotifyURL`、`ProdDesc`、`UsrMail` 等）
  2. AES-256-GCM 加密，key=Hash Key（32 bytes）、iv=Hash IV（16 bytes）
  3. 組合 `base64(ciphertext) + ":::" + base64(tag)` 後整串 hex 編碼
- `HashInfo = UPPER(SHA256(HashKey + EncryptInfo + HashIV))`
- Notify / Return 回傳同樣是 `EncryptInfo`＋`HashInfo`：先驗 hash 再解密，解密結果為 query string，parse 後取 `TradeStatus`（1=成功）、`TradeNo`、`MerTradeNo`、`PaymentType`、ATM 取號欄位等
- 交易查詢：伺服器 POST `{base}/trade/query`（帶 `MerTradeNo`）

## 架構與資料流

```
賣家在首頁/後台點「立即開通」並選 方案+期數
  → POST /api/admin/billing/checkout（需登入 session）
      以 src/shared/plan-offers.js 在伺服器端決定金額（不信任前端價格）
      建立 payment_orders（status=pending，MerTradeNo=唯一含隨機碼）
      回傳 { action: UPP URL, fields: {MerID, Version, EncryptInfo, HashInfo} }
  → 前端動態建 form auto-submit 跳轉 PAYUNi 託管頁
  → 信用卡：當場扣款｜ATM：取得虛擬帳號（訂單維持 pending）
  → PAYUNi 伺服器通知 POST /api/billing/notify（公開、無 session）
      驗 HashInfo → 解密 → 冪等更新 payment_orders
      TradeStatus=1 → 開通方案（更新 stores.plan / plan_expires_at / plan_paid_amount / plan_started_at）
  → 瀏覽器經 ReturnURL POST /api/billing/return → 自助驗證後 302 到結果頁
```

NotifyURL / ReturnURL 一律用主網域：`https://vovosnap.com/api/billing/...`（APP_URL）。多租戶子網域不參與金流回呼。

## 新增 / 修改檔案

### `migrations/0021_payment_orders.sql`

```sql
CREATE TABLE payment_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  mer_trade_no TEXT NOT NULL UNIQUE,   -- 例 VS{storeId}T{ts}R{rand4}，<=20 字
  plan TEXT NOT NULL,                  -- plus | pro | proplus
  months INTEGER NOT NULL,             -- 1 | 6 | 12
  days INTEGER NOT NULL,               -- 含贈送天數，取自 plan-offers
  amount INTEGER NOT NULL,             -- TWD
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed | expired
  pay_type TEXT,                       -- credit | atm（由 notify 回填）
  payuni_trade_no TEXT,                -- PAYUNi uni 序號
  atm_bank_code TEXT, atm_account TEXT, atm_expire_at TEXT, -- ATM 取號資訊
  raw_notify TEXT,                     -- 最後一次 notify 解密後 JSON（除錯用）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT
);
CREATE INDEX idx_payment_orders_store ON payment_orders(store_id);
```

### `src/services/payuni.ts`

純函式模組（可單測、不碰 D1）：

- `encryptInfo(params, key, iv): Promise<string>` — WebCrypto AES-GCM。注意 WebCrypto 輸出為 ciphertext‖tag 連體，須切出最後 16 bytes 當 tag，再組 PHP 相容格式
- `decryptInfo(hex, key, iv): Promise<Record<string,string>>` — 反向流程＋query string parse；tag 驗證失敗即 throw
- `hashInfo(encryptStr, key, iv): Promise<string>`
- `buildUppRequest({merId, key, iv, sandbox, tradeNo, amount, prodDesc, email, returnUrl, notifyUrl})` → `{ action, fields }`
- `verifyAndDecrypt(body, key, iv)` — notify/return 共用：驗 hash → 解密 → 回傳物件，hash 不符 throw

### `src/routes/billing.ts`

- `POST /api/admin/billing/checkout`（router 既有 admin 區段，自帶 auth）：body `{ plan, months }`；查 `getPlanOfferByMonths` 不存在即 400；free 方案不可購買；建立訂單、回 UPP 欄位
- `POST /api/billing/notify`（公開）：驗證解密失敗回 400；以 `MerTradeNo` 查訂單，查無回 404；**冪等**——訂單已是 paid 直接回 200 OK 不重複開通；`TradeStatus=1` → 標記 paid＋開通；ATM 取號通知（未入帳）→ 回填 atm_* 欄位、維持 pending；回應純文字 `OK`（PAYUNi 要求）
- `POST /api/billing/return`：同樣驗證，302 至 `/billing-result.html?status=...&order=...`
- `GET /api/admin/billing/orders`：本店訂單列表（後台顯示用）
- `GET /api/admin/billing/order-status?merTradeNo=`：結果頁輪詢用（ATM pending / paid）

### 方案開通邏輯（notify 內）

```
同方案續購：新到期日 = max(now, 現有 plan_expires_at) + days
跨方案購買：plan = 新方案，plan_started_at = now，plan_expires_at = now + days
            （v1 不自動折算舊方案餘額；platform-admin 人工 proration 仍可用）
plan_paid_amount = amount
```

### Router 掛載（`src/router.ts`）

- admin 區段加 `/api/admin/billing/checkout`、`/api/admin/billing/orders`、`/api/admin/billing/order-status`
- 公開區段（主網域）加 `/api/billing/notify`、`/api/billing/return`

### 前端

- `public/index.html` 定價卡 CTA：未登入 → 導註冊；已登入 → 開期數選擇 → checkout → auto-submit（此頁由首頁 redesign spec 一併處理）
- `public/billing-result.html`（新增）：付款結果頁。信用卡顯示成功/失敗；ATM 顯示虛擬帳號、銀行代碼、繳費期限，並輪詢 order-status，入帳後顯示已開通

### 設定

- Secrets（`wrangler secret put`）：`PAYUNI_MER_ID`、`PAYUNI_HASH_KEY`、`PAYUNI_HASH_IV`
- Var：`PAYUNI_SANDBOX = "1" | "0"`（wrangler.toml；先 1 驗流程，切正式改 0 並換正式金鑰）
- `.dev.vars` 放 sandbox 測試金鑰

## 錯誤處理

| 情境 | 行為 |
|---|---|
| notify hash 不符 / 解密失敗 | 400，不動任何資料 |
| notify 重複送達 | 冪等：已 paid 訂單直接 200 |
| 金額不符（notify TradeAmt ≠ 訂單 amount） | 標記 failed＋記 raw_notify，不開通（人工追查） |
| 使用者中途關閉付款頁 | 訂單留 pending；不影響現有方案 |
| ATM 過期未繳 | 訂單由排程外人工檢視（v1 不做自動 expired 掃描） |

## 測試

`test/payuni.test.js`、`test/billing-notify.test.js`（沿用現有 node test 形式）：

- encrypt → decrypt round-trip；對照 PHP SDK 格式（`hex(base64(cipher):::base64(tag))`）
- hashInfo 已知向量
- notify：偽造 hash 被拒、重放冪等、成功開通（同方案續購延長 / 跨方案重設）、金額不符標 failed
- checkout：未知方案/期數 400、金額來自 plan-offers

## 不在範圍（v1）

- 定期定額自動續扣、退款 API、發票開立、買家端結帳金流、升級自動折算、ATM 過期自動標記
