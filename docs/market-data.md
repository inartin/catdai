# Market Data

## Stage
Implemented, depends on external parser and Supabase snapshots.

## Listings Data
- Main DB tables are `listing`, `owner`, and `listing_price_history`.
- Data is consumed by estimates, relevant listings, admin views, market stats, and duplicate-candidate detection.
- Current imported sale/rent listing rows have empty exact-address fields (`address_text`, `sector`, `latitude`, `longitude`), so address-aware duplicate checks depend on parsed/cached 999.md page data. The parser reads embedded street and house fields when available until the importer starts storing address data.
- `/anunt` reads `listing_price_history` through `/api/listing-price-history` to show analyzed-listing total-price changes when available.
- Parser/importer code is outside this app repo.

## Live Prices API
- App route: `GET /api/prices`.
- It proxies parser route `/api/prices/latest`.
- Requires `CATDAI_API_TOKEN`.
- Uses Redis shared cache for 24h when reachable, with in-memory stale fallback.

## Market Trends
- App route: `GET /api/market-trends`.
- Reads `daily_price_snapshot`.
- Returns 60-day city trends for new builds and secondary market.
- Estimate API also returns a 30-day district trend when enough points exist, with city fallback.
- Uses Redis shared cache for 12h when reachable, with in-memory stale fallback.
- Landing-page price and trend hooks may show localStorage data immediately, but still revalidate `/api/prices` and `/api/market-trends` on mount so the browser cache does not freeze the visible market card.

## Known External Dependencies
- Parser API base: `CATDAI_API_URL` or `http://localhost:3100`.
- Shared cache env: optional `REDIS_URL`, optional `REDIS_CACHE_ENABLED=false`.
- `daily_price_snapshot` table must be populated outside this repo.
- `price_change_stats` RPC is expected by admin stats.

## Related Files
- `src/app/api/prices/route.js`
- `src/lib/cache.js`
- `src/lib/useLivePrices.js`
- `src/app/api/market-trends/route.js`
- `src/app/api/estimate/route.js`
- `src/app/api/listing-duplicates/route.js`
- `src/lib/listing-duplicates.js`
- `db/supabase_schema.sql`
