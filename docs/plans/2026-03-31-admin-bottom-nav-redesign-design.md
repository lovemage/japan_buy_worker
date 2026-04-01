# Admin 底部導航 SPA 重構設計

## Goal

將 Admin 管理介面從單頁長表單重構為底部導航 SPA，5 個 Tab 分頁，手機優先設計。同時新增分類管理、帳號密碼管理、R2 圖片儲存、WebP 轉換等功能。

## Architecture

單一 HTML 檔 + Tab 切換（`data-tab` 屬性切換 `<section>` display），每個 Tab 有獨立 JS 模組。底部導航固定在畫面底部，iOS tab bar 風格（SVG icon + 文字）。

## 底部導航 5 個 Tab

| Tab | SVG Icon | 內容 |
|-----|----------|------|
| 新增商品 | package | 子分頁：手動上架表單 / 分類管理 CRUD |
| 拍照上架 | camera | 拍照辨識 → Gemini API → 草稿 → 上架 |
| 網站同步 | refresh-cw | Loading bar + 同步結果卡片 |
| 訂單列表 | clipboard-list | 需求單列表（狀態管理、刪除） |
| 網站設定 | settings | 子分頁：匯率設定 / API Key / 帳號密碼 |

## 新增功能

### 1. 分類管理

- `GET /api/admin/categories` — 列出所有分類 + 商品數量
- `POST /api/admin/categories` — 新增分類
- `PATCH /api/admin/categories` — 重新命名（批次更新 products.category）
- `DELETE /api/admin/categories` — 刪除（商品歸「未分類」）

### 2. 帳號密碼管理

- 密碼從 hardcode 改存 `app_settings`（key: `admin_password`）
- `POST /api/admin/change-password` — 驗證舊密碼 → 存新密碼
- 首次啟動 fallback 到 hardcode 預設值
- 前端：舊密碼 / 新密碼 / 確認密碼表單

### 3. 網站同步改進

- Loading bar（非 spinner）：0% → 30%（快速）→ 80%（緩慢）→ 100%（完成）
- CSS transition 驅動
- 完成後顯示結果卡片（來源、抓取筆數、寫入筆數）

### 4. 圖片 WebP + R2

- 前端 canvas 轉 `image/webp` 0.8 品質
- 拍照上架支援多張照片全部導入
- 後端接收 base64 → decode → PUT R2
- R2 路徑：`products/{code}/{index}.webp`
- `products.image_url` = 第一張 R2 URL
- `source_payload_json.gallery` = 所有 R2 URL

## R2 設定

- `wrangler r2 bucket create japan-buy-images`
- `wrangler.toml` 加 R2 binding：`IMAGES`

## 檔案結構

```
public/
  admin.html                  ← 重寫（底部導航 + 5 個 tab section）
  assets/
    app-admin.js              ← 重寫（tab 切換 + 模組初始化）
    app-admin-recognize.js    ← 修改（適配新 DOM + webp 輸出 + 多圖）
    app-admin-sync.js         ← 新增（同步 + loading bar + 結果卡片）
    app-admin-orders.js       ← 新增（訂單列表）
    app-admin-products.js     ← 新增（手動上架 + 分類管理）
    app-admin-settings.js     ← 新增（匯率 + API Key + 帳號密碼）
    styles.css                ← 修改（底部導航 + tab + loading bar 樣式）
src/
  routes/admin/
    auth.ts                   ← 修改（密碼改讀 app_settings）
    categories.ts             ← 新增（分類 CRUD）
    password.ts               ← 新增（更改密碼）
    products.ts               ← 修改（多圖 + R2 上傳）
    recognize.ts              ← 不動
    settings.ts               ← 不動
  index.ts                    ← 修改（註冊新 route）
wrangler.toml                 ← 加 R2 binding
```

## 底部導航 CSS

- `position: fixed; bottom: 0; left: 0; right: 0`
- `padding-bottom: env(safe-area-inset-bottom)`
- `body` 加 `padding-bottom: 64px`
- Active: `--brand` 色，Inactive: `--muted`
- SVG 24x24，label 11px
- Tab 切換即時（無動畫）
