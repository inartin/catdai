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
- `POST /api/listing-preview-images`: key prefix `catdai:listing-preview-image:v1:`, 24h TTL per listing/language.
- `POST /api/cadastral`: key prefix `catdai:cadastral:v1:`, 7d TTL for successful cadastral-number lookup responses before the long-lived DB store is checked.
- `POST /api/cadastru/address`: key prefix `catdai:cadastru-address:v1:`, 7d TTL for successful normalized-address lookup responses before structured address fields in DB are checked.
- `GET /api/admin/ad-tracking`: key prefix `catdai:admin-ad-tracking:v1`, 10m TTL per source, journey limit, and offset; `fresh=1` bypasses the cache.

## Cadastru Cache
- Only successful `200` cadastru payloads are cached; unauthorized, invalid, rate-limited, not-found, and upstream-error responses are not cached.
- Cadastru routes use Redis first; if Redis is unavailable or misses, they check `cadastru_records` before calling official sources.
- `/api/cadastral` caches the cadastral payload without per-request access fields and restores access fields for the current authenticated request.
- `/api/cadastral` stores the original lookup source (`api` or `local`) with the cached payload so `/cadastru` analytics keep the same source classification on cache hits.
- Successful official cadastru payloads are also persisted in Supabase through `src/lib/cadastru-records.js` only in production. This DB store is long-lived because official cadastru data changes rarely.

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
