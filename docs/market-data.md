# Market Data

## Stage
Implemented, depends on external parser and Supabase snapshots.

## Listings Data
- Main DB tables are `listing`, `owner`, and `listing_price_history`.
- Data is consumed by estimates, relevant listings, admin views, and market stats.
- Parser/importer code is outside this app repo.

## Live Prices API
- App route: `GET /api/prices`.
- It proxies parser route `/api/prices/latest`.
- Requires `CATDAI_API_TOKEN`.
- Uses 24h in-memory cache and stale fallback.

## Market Trends
- App route: `GET /api/market-trends`.
- Reads `daily_price_snapshot`.
- Returns 60-day city trends for new builds and secondary market.
- Estimate API also returns a 30-day district trend when enough points exist, with city fallback.

## Known External Dependencies
- Parser API base: `CATDAI_API_URL` or `http://localhost:3100`.
- `daily_price_snapshot` table must be populated outside this repo.
- `price_change_stats` RPC is expected by admin stats.

## Related Files
- `src/app/api/prices/route.js`
- `src/lib/useLivePrices.js`
- `src/app/api/market-trends/route.js`
- `src/app/api/estimate/route.js`
- `db/supabase_schema.sql`
