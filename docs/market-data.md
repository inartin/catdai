# Market Data

## Stage
Implemented, depends on external parser and Supabase snapshots.

## Listings Data
- Main DB tables are `listing`, `owner`, and `listing_price_history`.
- Data is consumed by estimates, relevant listings, admin views, market stats, and duplicate-candidate detection.
- Exact-address coverage is partial. A read-only sale-listing check on 2026-10-24 found `address_text` and `attributes.sourceStreet` on 19,595 of 78,441 rows; imported structured street/house values live in `attributes.sourceStreet` and `attributes.sourceBuildingNumber`. Older/unmatched rows still require parsed/cached 999.md addresses. Listing coordinates may be absent, so nearby distances cannot be inferred from house numbers.
- `/anunt` reads `listing_price_history` through `/api/listing-price-history` to show analyzed-listing total-price changes when available.
- Parser/importer code is outside this app repo. Its daily cleanup deletes price-history rows for deleted sale/rent listings; inactive listing rows can retain a last asking price without a retained change history.
- Valuation evidence aggregates `last_seen_at` over the exact final comparable sample. These are collector observation dates, not publication/update dates. A 2026-10-31 read-only check found `last_seen_at` populated for all 14,403 eligible active sale listings in the supported cities, but no `source_created_at` or `source_updated_at`; do not describe these listings as recently published.

## Cadastru result card

`/api/cadastru/market` supplies real building/same-street sale listings, retained price histories and optional sector trends after the other result cards finish loading. EUR prices are compared separately from the all-currency collected-ad count. Exact parsed addresses are required; unmatched addresses are not guessed. Missing listings fall back to sector trends, and no data hides the card. Locked number-search previews receive sector trends only until the property lookup is unlocked, keeping the exact address behind the paywall. Successful payloads are cached for one hour with separate restricted/full keys. See [cadastral lookup](cadastral.md#building-listing-market-card).

## Live Prices API
- App route: `GET /api/prices`.
- It proxies parser route `/api/prices/latest?city=Chișinău` so the landing market card uses only Chișinău rows, even if the parser has imported other cities.
- Requires `CATDAI_API_TOKEN`.
- Uses a Chișinău-specific Redis shared cache for 24h when reachable, with in-memory stale fallback.

## Market Trends
- App route: `GET /api/market-trends`.
- Reads `daily_price_snapshot`.
- Returns up to four months (120 days) of city trends for new builds and secondary market, starting no earlier than 1 July 2026 to exclude the earlier city-classification discontinuity. District trends use the same cutoff.
- Accepts an optional validated `district` query parameter, for example `GET /api/market-trends?district=Botanica`, and returns district-scoped trends for both building types without city fallback when district data is insufficient.
- Unsupported district values return HTTP 400 with `{"error":"invalid_district"}`; accepted aliases and diacritic variants are normalized to the canonical Chișinău district name.
- Estimate API also returns a 30-day district trend when enough points exist, with city fallback.
- Uses separate versioned Redis and in-memory cache entries for city-wide data and each validated district for 12h when reachable, with same-scope in-memory stale fallback.
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
