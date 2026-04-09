# Japan Buy Workers

## Endpoints

1. `GET /healthz`
2. `POST /admin/crawl`
3. `GET /api/products?limit=20&offset=0`
4. `POST /api/requirements`

`/api/products` intentionally excludes source site URL fields.

## Frontend Pages

1. `/index.html` 商品列表
2. `/request.html` 需求單
3. `/success.html?id=<requirementId>` 送單成功
4. `/product?code=<product_code>` 商品詳情

## Setup

1. Set `database_id` in `wrangler.toml`.
2. Set secrets:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`

## Run

1. `npm install`
2. `npm run d1:migrate:local`
3. `npm run dev`

## Documentation

- [Pixel Octopus Loading Animations](docs/animate.md) — AI 功能 loading 動畫角色設計說明

## Manual Check

1. Call `POST /admin/crawl` once to populate products.
2. Open `/index.html` and add products.
3. Open `/request.html`, fill contact info, submit form.
4. Confirm redirect to `/success.html?id=...`.
