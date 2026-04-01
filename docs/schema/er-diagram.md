# Japan Buy ER + Workflow

## Entities

1. `products`
2. `product_snapshots`
3. `requirement_forms`
4. `requirement_items`
5. `admin_orders`

## Relationships

1. `products (1) -> (n) product_snapshots`
2. `requirement_forms (1) -> (n) requirement_items`
3. `products (1) -> (n) requirement_items` (optional in case product is later removed)
4. `requirement_forms (1) -> (n) admin_orders`

## Workflow States

Requirement form status:

1. `new`
2. `reviewing`
3. `quoted`
4. `ordered`
5. `shipped`
6. `closed`

Each status change should update:

1. `requirement_forms.status`
2. `requirement_forms.updated_at`
3. `requirement_forms.status_updated_by`

## Notes

1. Frontend never shows source website URL.
2. Admin uses product snapshot data to avoid order mistakes when source prices change.
3. Crawl output should upsert `products`, then append `product_snapshots`.

