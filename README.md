# Japan Buy Workers

## Endpoints

1. `GET /healthz`
2. `POST /admin/crawl`
3. `GET /api/products?limit=20&offset=0`

`/api/products` intentionally excludes source site URL fields.

## Setup

1. Set `database_id` in `wrangler.toml`.
2. Set secrets:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`

## Run

1. `npm install`
2. `npm run d1:migrate:local`
3. `npm run dev`

