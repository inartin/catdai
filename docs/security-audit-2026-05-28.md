# Security Audit - 2026-05-28

## Scope
- Reviewed app docs, Next.js config, proxy/admin gate, API routes, Supabase access patterns, DB policy files, dependency advisories, live production headers, and one public API response.
- No code changes were made.
- No local app server was started.

## Findings
- **High - Vulnerable Next.js version.** `pnpm audit` reports `next@16.1.6` affected by multiple high/moderate advisories, including middleware/proxy bypass, WebSocket SSRF, RSC/cache poisoning, XSS, and DoS. Upgrade to the patched Next version before treating proxy-based auth as strong.
- **High - Admin auth depends on proxy only.** Fixed for protected `/api/admin/*` data routes by adding route-level `admin_token` verification before cached responses or `SUPABASE_SERVICE_KEY` database reads. ✅
- **High - Admin login has no rate limit.** Fixed with per-IP throttling on `/api/admin/auth`: 5 failed attempts trigger a 15-minute block with `Retry-After`. ✅
- **Medium - Admin session is a static token.** Fixed by replacing the raw `ADMIN_TOKEN` cookie with a signed `admin_token` session containing nonce, issued-at, and 12-hour expiry; `ADMIN_TOKEN` is now only the server-side HMAC secret. ✅
- **Medium - CSP is present but weak.** Live headers include CSP, but `script-src` allows `'unsafe-inline'` and `'unsafe-eval'`. This weakens XSS containment. Prefer nonces/hashes and remove `unsafe-eval` in production if possible.
- **Medium - Production CORS header is malformed.** Live `/api/prices` returns `Access-Control-Allow-Origin: https://catdai.md,3.126.51.101`, which is not a valid single origin. This is more likely to break CORS than open it, but it is still a security-header config bug.
- **Medium - Default tracking salt fallback.** `TRACKING_SALT` is not listed in the local `.env` names inspected, while code falls back to `catdai-default-salt`. IP hashes are weaker if production also lacks a secret salt.
- **Medium - Rate limits are in-memory and trust forwarded IP headers.** Public routes use local process maps and trust `cf-connecting-ip` / `x-forwarded-for`. This is bypassable if the origin is directly reachable or if there are multiple app instances.
- **Medium - Public cadastral endpoint exposes detailed property data.** Fixed by requiring a valid Supabase bearer token on `/api/cadastral` and `/api/cadastru/address`; anonymous UI paths now show the shared auth popup before lookup. ✅
- **Low - Admin query inputs are not allowlisted.** Admin listings accepts arbitrary `sortBy`; admin owners interpolates `search` into a Supabase `.or()` filter. Admin auth limits exposure, but malformed input can cause errors or unexpected filters.
- **Low - Admin APIs can return raw DB error messages.** Fixed for admin listings and owners list routes by logging detailed DB errors server-side and returning generic API errors. ✅
- **Low - `X-Powered-By: Next.js` is exposed in production.** Fixed by disabling Next.js `poweredByHeader`. ✅

## Checks Requested
- **Security headers:** Present: HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, API `X-Robots-Tag`. Issues: weak CSP and malformed CORS origin. Fixed: exposed `X-Powered-By`. ✅
- **OWASP basics:** Main risks found: vulnerable/outdated components, auth/session hardening gaps, weak CSP, rate-limit bypass potential, data exposure/data minimization concerns.
- **SQL injection:** No raw public SQL found. Public valuation uses validated inputs and Supabase RPC parameters. Cadastral external query uses a strict cadastral regex. Admin `.or()` search and arbitrary `sortBy` need hardening.
- **XSS:** React rendering mostly escapes data. `dangerouslySetInnerHTML` is used for JSON-LD and redirect scripts; redirect URL is JSON-stringified. CSP is the bigger weakness because inline/eval scripts are allowed.
- **Auth issues:** User-owned APIs verify Supabase bearer tokens and scope queries by `user_id`. Admin auth is the main concern because it relies on proxy plus static cookie token.
- **`.env` leakage:** `.env*` is ignored and no env files are tracked by git. Static search found env variable names only, not secret values.
- **API sensitive data:** Public `/api/prices` live response contains aggregate market data only. User APIs are scoped. Admin APIs intentionally expose sensitive operational/user data and rely on admin gate.

## Evidence
- Live header checks: `https://catdai.md` and `https://catdai.md/api/prices`.
- Dependency scan: `pnpm audit --audit-level moderate` -> 31 vulnerabilities: 12 high, 16 moderate, 3 low.
- Public API sample: `/api/prices` returned aggregate prices/trend only.
- Env check: `git ls-files '.env*'` returned no tracked env files; only env key names were inspected locally.
- Local runtime note: local shell is Node `v18.12.1`, so no local Next runtime/build validation was attempted.
