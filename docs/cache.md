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
- `GET /api/market-trends`: key `catdai:market-trends:v1`, 12h TTL.
- `POST /api/estimate`: key prefix `catdai:estimate:v1:`, 30m TTL for repeated validated estimate inputs.
- `POST /api/estimate-rent`: key prefix `catdai:estimate-rent:v7:`, 12h TTL for repeated validated rent estimate inputs.
- `POST /api/listing-preview-images`: key prefix `catdai:listing-preview-image:v1:`, 24h TTL per listing/language. The route accepts up to 6 unique 5-12 digit numeric ids, applies a 30/min per-IP limit, and refuses upstream HTML above 512 KB before caching.
- `POST /api/cadastral`: key prefix `catdai:cadastru:number:v2:`, 30d TTL for successful cadastral-number lookup responses before the long-lived DB store is checked.
- `POST /api/cadastru/address`: key prefix `catdai:cadastru:address:v2:`, 30d TTL for successful normalized-address lookup responses before structured address fields in DB are checked.
- `POST /api/cadastru/nearby`: key prefix `catdai:cadastru:nearby:v1:`, 30d TTL for complete nearby responses per resolved building address, backed by `cadastru_nearby`.
- `POST /api/cadastru/public-transport`: key prefix `catdai:cadastru:public-transport:v1:`, 30d TTL for complete transport responses per resolved origin, backed by `cadastru_public_transport`.
- `GET /api/admin/ad-tracking`: key prefix `catdai:admin-ad-tracking:v1`, 10m TTL per source, journey limit, and offset; `fresh=1` bypasses the cache.
- `POST /api/admin/auth`: key prefix `catdai:admin-login:v1:`, 15m TTL per client IP for failed-login throttling. Production admin login requires Redis and fails closed if it is unavailable.

## Cadastru Cache
- Only successful `200` cadastru payloads are cached; unauthorized, invalid, rate-limited, not-found, and upstream-error responses are not cached.
- Cadastru routes use Redis first; if Redis is unavailable or misses, they check `cadastru_records` before calling official sources.
- `/api/cadastral` caches the cadastral payload without per-request access fields and restores access fields for the current authenticated request.
- `/api/cadastral` stores the original lookup source (`api` or `local`) with the cached payload so `/cadastru` analytics keep the same source classification on cache hits.
- Successful unmasked cadastru JSON payloads are persisted before preview/credit responses when production or `ENABLE_RUNTIME_PERSISTENCE=true`. Single-property number/address queries share canonical records; full address aggregates and verified spelling aliases live in `cadastru_address_aliases`. Apply `db/cadastru_address_aliases.sql`.
- Redis and DB share an absolute 30-day freshness deadline. Cache/DB hits do not reset it or trigger live cadastral-detail enrichment. Expired rows remain stored but are not served. Old v1 Redis keys are no longer read.
- Nearby places are stored separately per resolved building address in `cadastru_nearby` (`db/cadastru_nearby.sql`) and Redis (`catdai:cadastru:nearby:v1:`). They use the same independent 30-day freshness, retained expired DB snapshots, and stale fallback on failed/malformed/incomplete refresh as transport. Apartments and building-address searches share the result; the worker currently requires a house address. New responses are not appended to individual property or aggregate payloads. Valid legacy nearby data is lazily copied to the shared store with its original property deadline; obsolete data missing `food` is refreshed. The result page always requests the shared nearby route after the main result paints, so embedded legacy data cannot bypass freshness checks.
- Public transport has an independent 30-day deadline. Complete responses are saved in the server-only `cadastru_public_transport` table (`db/cadastru_public_transport.sql`); expired rows are retained. Redis misses reload fresh DB data with only its remaining TTL. After expiry the route refreshes from the worker, falling back to the last complete DB snapshot with a stale-data notice on failure, malformed data, or incomplete sources. Incomplete responses never overwrite a complete snapshot. Transport can use expired stored property data only to resolve its origin; normal Cadastru freshness rules are unchanged.
- Address keys normalize diacritics, case, whitespace, punctuation and RO/RU street/apartment abbreviations. Source-verified address aliases handle alternate street spellings; no fuzzy property matching is used. Address aliases resolve current canonical number data, while land/building aggregates remain address-scoped. For single-property hits, an alias or saved record district fills missing district data in older canonical Redis JSON and updates the number cache.

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
