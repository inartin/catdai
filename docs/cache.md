# Shared Cache

## Stage
Backend prepared and active when Redis is reachable.

## Provider
- Uses a standard Redis server through the `redis` package.
- Reads `REDIS_URL`, defaulting to `redis://127.0.0.1:6379`.
- Set `REDIS_CACHE_ENABLED=false` to disable Redis without changing route code.
- If Redis is stopped or calls fail, routes keep their in-memory fallback.

## Cached Routes
- `GET /api/prices`: key `catdai:prices:latest:v1`, 24h TTL.
- `GET /api/market-trends`: key `catdai:market-trends:v1`, 12h TTL.
- `POST /api/estimate`: key prefix `catdai:estimate:v1:`, 30m TTL for repeated validated estimate inputs.

## Estimate Cache
- Cache keys include the normalized valuation inputs and UI language.
- Cached data excludes `access_tier`, `locked_sections`, device/session ids, and share context.
- `/api/estimate` still resolves access and logs each estimate request on cache hits.
- Process memory keeps up to 250 recent estimates as a fallback when Redis is unavailable.

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
