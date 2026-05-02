# Order Item Thumbnails Design

## Goal

Show product thumbnails in two order-facing views so members and admins can identify items faster:

- Member order history item rows.
- Admin order stats helper rows.

## Approved Behavior

- Use each order item's saved `selectedImageUrl` for the thumbnail.
- Link the thumbnail and product name to the in-store product detail page: `/product?code=...`.
- If an item has no product code, render the thumbnail/name without a link.
- If an item has no image URL, use the existing product image fallback behavior.
- Do not add or change database columns.

## Approach

Use the data already returned by the existing APIs. Member order history already receives item `selectedImageUrl` and `code`. Admin orders already receives the same fields for each form item. The stats helper will keep aggregating by product name, but each aggregate row will also retain the first available image URL and product code for that product.

## Testing

- Add/extend tests for member order history rendering thumbnails and internal links.
- Add/extend tests for stats helper aggregation retaining image/code metadata.
- Run the existing Node test suite.
