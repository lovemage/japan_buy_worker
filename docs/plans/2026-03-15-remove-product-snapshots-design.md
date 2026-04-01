# Remove Product Snapshots Design

**Goal:** 停止保留商品同步快照，改由 `products` 表直接承接商品 payload，同時移除 D1 舊快照資料，不影響需求單與 orders。

## Scope
- 停止同步時寫入 `product_snapshots`
- `products` 新增並承接 `source_payload_json`、`status_badges_json`
- 前台列表與商品詳情只讀 `products`
- 移除 D1 中既有 `product_snapshots` 與相關 index
- 不修改 `requirement_forms`、`requirement_items`、`admin_orders`

## Data Migration
- 先在 `products` 加上 `source_payload_json`、`status_badges_json`
- 以每個 `product_id` 最新一筆 snapshot 回填到 `products`
- 回填完成後刪除 `product_snapshots` table 與 index

## Runtime Changes
- `upsertProducts()` 改成單次 upsert 到 `products`
- `/api/products` 的 gallery / totalSku 計算改從 `products.source_payload_json`
- `/api/product` 的 detail payload 改從 `products.source_payload_json`

## Safety
- 舊快照移除只動 `product_snapshots`
- 需求單與 orders 的 FK 都指向 `products` / `requirement_forms`，不會受影響
