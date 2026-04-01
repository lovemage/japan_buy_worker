# Brand Filter Design

**Goal:** 在商品列表頁的分類篩選上方加入品牌多選篩選，並讓篩選條件反映到 API、URL 與分頁。

## Decision
- 品牌篩選使用多選 pill。
- 品牌篩選放在分類篩選上方。
- 邏輯為：分類與品牌是 `AND`；多品牌之間是 `OR`。
- 篩選條件寫入 URL `brands=`，以逗號分隔。

## Backend
- `GET /api/products` 支援 `brands` 查詢參數。
- `brands` 解析後做去重、trim、過濾空值。
- SQL 以 `brand IN (...)` 進行過濾，並與 `category` / `promoMaxTwd` 一起作用。
- 新增 `GET /api/product-brands`，回傳 `{ name, total }[]` 給前端 render pills。
- 品牌清單會受當前 `category` 影響，讓使用者先看該分類下有哪些品牌可選。

## Frontend
- `index.html` 新增 `#brand-filters` 區塊。
- `app-list.js` 讀取 `brands` URL 參數，支援多選切換。
- 點品牌時重設到第 1 頁，保留 `category` 與 `promoMaxTwd`。
- 切換分類時保留目前選中的品牌，讓 API 回傳該分類下仍有效的品牌數量。
- 若 URL 中有品牌但新資料源不再提供，前端仍保留選中狀態，直到使用者取消。

## Testing
- 為品牌參數解析與 SQL 條件組裝補 Node 原生測試。
- 驗證多品牌、空字串、重複值與分類組合。
- 驗證 brand 聚合 endpoint 的 SQL 條件組裝。
