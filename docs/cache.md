# Shared Cache

## Stage
Backend prepared and active when Redis is reachable.

## Provider
- Uses a standard Redis server through the `redis` package.
- Reads `REDIS_URL`, defaulting to `redis://127.0.0.1:6379`.
- Set `REDIS_CACHE_ENABLED=false` to disable Redis without changing route code.
- If Redis is stopped or calls fail, route code continues without shared-cache data; some routes also keep explicit in-memory fallbacks.

## Cached Routes
- `GET /api/prices`: key `catdai:prices:latest:v1`, 24h TTL.
- `GET /api/market-trends`: key prefix `catdai:market-trends:v5:`, 12h TTL; separate city and district entries for 120-day trends clipped at 1 July 2026. Browser trend storage uses `catdai_market_trends_v5` to discard earlier cached chart data.
- `POST /api/estimate`: key prefix `catdai:estimate:v1:`, 30m TTL for repeated validated estimate inputs.
- `POST /api/estimate-rent`: key prefix `catdai:estimate-rent:v7:`, 12h TTL for repeated validated rent estimate inputs.
- `POST /api/listing-preview-images`: key prefix `catdai:listing-preview-image:v1:`, 24h TTL per listing/language. The route accepts up to 6 unique 5-12 digit numeric ids, applies a 30/min per-IP limit, and refuses upstream HTML above 512 KB before caching.
- `POST /api/cadastral`: key prefix `catdai:cadastru:number:v3:`, 90d Redis retention for successful cadastral-number lookup responses before the long-lived DB store is checked.
- `POST /api/cadastru/address`: key prefix `catdai:cadastru:address:v3:`, 90d Redis retention for successful normalized-address lookup responses before structured address fields in DB are checked.
- `POST /api/cadastru/nearby`: key prefix `catdai:cadastru:nearby:v1:`, 90d Redis retention for complete nearby responses per resolved building address, backed by `cadastru_nearby`.
- `POST /api/cadastru/public-transport`: key prefix `catdai:cadastru:public-transport:v1:`, 30d TTL for complete transport responses per resolved origin, backed by `cadastru_public_transport`.
- `GET /api/admin/ad-tracking`: key prefix `catdai:admin-ad-tracking:v1`, 10m TTL per source, journey limit, and offset; `fresh=1` bypasses the cache.
- `GET /api/admin/payments`: key prefix `catdai:admin-payments:v1:`, 20m TTL per period/currency/page; Today also includes its Chișinău midnight boundary. Admin auth runs before cache reads. Only successful reports are stored; Refresh/Retry use `fresh=1` to replace the cached report. Browser/proxy responses remain `private, no-store`.
- `POST /api/admin/auth`: key prefix `catdai:admin-login:v1:`, 15m TTL per client IP for failed-login throttling. Production admin login requires Redis and fails closed if it is unavailable.

## Live Presence
- `catdai:online-users:v1` is a Redis sorted set of browser IDs scored by the server heartbeat timestamp. `POST /api/online-users` atomically removes entries at least 90 seconds old, updates one browser and returns the current count. Each heartbeat renews a 180-second TTL on the set; reads do not extend it.
- `GET /api/online-users` counts only timestamps newer than the 90-second cutoff and returns uncached plain text. Redis is required: failures return `503`, without a process-local fallback or a misleading zero. Accepted POSTs separately save throttled `visitor_activity` for the dashboard's period totals; database failures do not disable live presence. See [Admin](admin.md#dashboard).
- Check with `pnpm exec node --experimental-vm-modules scripts/test-online-users.mjs` (requires `redis-server`; starts and stops an isolated, non-persistent instance).

## Cadastru Cache
- Blurred map thumbnails use `catdai:cadastru-map-preview:v1:` with a SHA-256 fingerprint of the saved map data and a one-hour TTL. The cache stores only the flattened, downsized, blurred WebP, never an unblurred alternative. Image responses use `private, no-store`; thumbnail rendering does not renew cadastral/nearby snapshot freshness. Map redaction for JSON responses runs after cache/storage reads and cannot be bypassed by a stale snapshot.
- Only successful `200` cadastru payloads are cached; unauthorized, invalid, rate-limited, not-found, and upstream-error responses are not cached.
- Cadastru routes use Redis first; if Redis is unavailable or misses, they check `cadastru_records` before calling official sources.
- `/api/cadastral` caches the cadastral payload without per-request access fields and restores access fields for the current authenticated request.
- Number reads load the saved snapshot alongside the credit check. A previously consumed lookup reuses that request's verified ledger result. Unlocked cached reads do not rewrite the snapshot or address aliases: after the response, the service-only `record_cadastru_lookup_usage` RPC atomically updates only the use count and last-used date. Source dates and expiry stay unchanged; a Redis-only snapshot can still recover its missing DB row in the background. Migration `20261030201034_cadastru_cached_lookup_usage.sql` is applied to production as of 2026-10-30; deploy the app changes to enable this path. Nearby/transport/reports read their saved datasets alongside map-access checks, and return only after access has been resolved. Check: `pnpm exec node --experimental-vm-modules scripts/test-cadastru-cached-loading.mjs`.
- `/api/cadastral` stores the original lookup source (`api` or `local`) with the cached payload so `/cadastru` analytics keep the same source classification on cache hits.
- Successful unmasked cadastru JSON payloads are persisted before preview/credit responses when production or `ENABLE_RUNTIME_PERSISTENCE=true`. Single-property number/address queries share canonical records; full address aggregates and verified spelling aliases live in `cadastru_address_aliases`. Apply `db/cadastru_address_aliases.sql`.
- Source freshness and Redis retention are independent. Property snapshots refresh after 90 days; stable shared building fields after 180 days; registry fields (ownership, transactions, rights, notes and restrictions) retain a 30-day refresh target. Nearby places refresh after 90 days, transport after 30 days and municipal reports after 72 hours. Source fetch dates never advance on reads.
- Normal number/address lookups return saved snapshots immediately, including expired records and land/building aggregates. Redis misses reload DB snapshots, including expired ones. Responses carry `data_freshness` with source dates and stale flags; result cards omit verification dates and retain a saved-data notice when stale. The municipal reports card retains its source and check date. Incomplete unit-list references still cannot satisfy detail lookups. `skipcache=true` bypasses saved snapshots and waits for a new source result.
- Expired snapshots trigger a Next.js `after` refresh after the response. Refreshes use a Redis lease and process-local five-minute cooldown per property/origin; number and single-property address searches share the same number lease. Refresh work does not consume credits or increment lookup/search counters. Failed, malformed, wrong-property or incomplete refreshes retain saved data and its dates. Redis uses a policy marker to ignore older cache envelopes after deployment.
- Nearby places are stored per resolved building address in `cadastru_nearby` and Redis (`catdai:cadastru:nearby:v1:`), shared by apartment and building-address searches. Valid legacy snapshots are copied with their original source dates. Nearby, transport and municipal cards return complete saved snapshots immediately, refreshing expired data after the response; incomplete first-time results may display but are never saved over a complete snapshot.
- Public transport keeps its independent 30-day deadline and server-only `cadastru_public_transport` store. Expired property records may resolve secondary-card origins without renewing property freshness. A missing snapshot still requires a worker lookup; upstream failures remain unavailable rather than showing empty results.
- Address keys normalize diacritics, case, whitespace, punctuation and RO/RU street/apartment abbreviations. Source-verified address aliases handle alternate street spellings; no fuzzy property matching is used. Address aliases resolve current canonical number data, while full address aggregates remain address-scoped. Parcel-number snapshots include their own verified constructions and recover separately saved child construction records on reads, including Redis hits; expired children keep the combined result eligible for refresh. Other parcels and apartments are excluded. For single-property hits, an alias or saved record district fills missing district data in older canonical Redis JSON and updates the number cache.

- Shared apartment-block details use `catdai:cadastru:building:v3:` and `cadastru_buildings`. Unit entries and applicable address aliases hold references, so a building update does not require refreshing every apartment. Building writes invalidate the shared cache; per-field source dates survive partial/failed refreshes. Technical fields use 180 days and registry fields 30 days.
- Geometry-only collector repairs merge building footprints and exact parent-parcel outlines into the shared JSON, invalidating building/number/linked address caches when Redis is configured. App reads compose these fields from shared storage; apartment and registry dates stay unchanged. Valid empty source checks wait 180 days before retrying; failed checks do not gain a success timestamp.
- Municipal reports use `catdai:cadastru:municipal-reports:v1:` and `cadastru_municipal_reports`, with 72-hour freshness measured from the worker snapshot, independent of property freshness. Complete saved results are served immediately and survive failed, malformed, stale or incomplete background refreshes.
- See [Building and apartment storage](cadastral.md#building-and-apartment-storage) for schema, backfill and deployment order.

## Estimate Cache
- Cache keys include the normalized valuation inputs and UI language.
- Rent cache keys use the normalized rent filters and keep successful payloads for 12h because rent filter combinations repeat often.
- Cached data excludes `access_tier`, `locked_sections`, device/session ids, and share context.
- `/api/estimate` still resolves access and logs each estimate request on cache hits.
- Process memory keeps up to 250 recent estimates as a fallback when Redis is unavailable.
- `999.md` preview image scraping is outside the estimate response path and is cached separately.
- `/api/analyze-link` and `/api/listing-duplicates` reuse the 999.md parsed-listing cache, but refresh stale entries that only contain a broad location before exact-address duplicate checks.

## AWS Setup
- Install and run Redis on the same host as the app through the OS service, or point `REDIS_URL` at the host Redis endpoint.
- For same-host Redis, keep Redis bound to `127.0.0.1` and do not expose port `6379` publicly.
- Restart the app after adding or changing env vars.
- The host must have `redis-server` or `redis6-server` installed before running PM2.
- On Amazon Linux with `amazon-linux-extras enable redis6`, the binary is usually `redis6-server`.
- PM2 only starts the Next.js app; Redis is managed by `systemd`.

## AWS Redis Service
```bash
sudo systemctl enable redis6
sudo systemctl start redis6
redis6-cli ping
```

Expected response:

```text
PONG
```

On this Amazon Linux Redis 6 host, both the service and CLI are namespaced as `redis6`.
Only use `redis`/`redis-cli` on hosts where those names actually exist.

## PM2 Start
```bash
pm2 start ecosystem.config.cjs
```

## Related Files
- `src/lib/cache.js`
- `src/app/api/prices/route.js`
- `src/app/api/market-trends/route.js`

The manual `catdai-api` collector writes these same stores and invalidates affected app Redis keys after durable writes. `--partial` fills missing categories without renewing existing complete snapshot dates; known RO/RU address aliases share a collection job. See the worker documentation for its persistent checkpoint and configuration.

Migration `supabase/migrations/20261023170225_cadastru_snapshot_freshness.sql` was applied on 2026-10-23; deploy the app and collector changes to activate background refresh and the new write policy. It derives new deadlines from existing source dates, adds address-alias fetch dates, and aligns collector ingestion with the 90/180/30-day property/building/registry policy. It preserves transport and municipal deadlines.

- Legacy apartment results with `geodata_wms_derived`, `geodata_wfs_building_derived`, or `geodata_wfs_parcel_derived` sources are ineligible for number/address reuse, including expired fallback. A fresh address lookup must verify the unit; derived responses are rejected before persistence. This is a read-time quarantine, not deletion of historical database rows.
