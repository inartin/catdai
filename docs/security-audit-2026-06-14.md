# Security Audit - 2026-06-14

## Scope

- Reviewed security-critical app routes, auth/admin gates, payment gates, public data APIs, headers, DB policy files, and production dependency advisories.
- Ran `pnpm audit --audit-level moderate --prod`; no local app server was started.

## Findings

### High

1. **High - Vulnerable Next.js runtime can bypass proxy auth and expose SSRF/DoS paths.** Location: `package.json:22`, `pnpm-lock.yaml` (`next@16.1.6`); `pnpm audit` reports high advisories for proxy bypass, WebSocket SSRF, and Server Component DoS. Fix: upgrade `next` and `eslint-config-next` to at least the patched `16.2.6` line, preferably the current stable patched release.
2. **High - Public duplicate-listing API bypasses the paid `/anunt` lock and returns real listing/owner/address data.** Location: `src/app/api/listing-duplicates/route.js:26-51`, `src/lib/listing-duplicates.js:47-85`, `src/lib/listing-duplicates.js:541-580`. Status: fixed by requiring authenticated `listing_analysis` access for the requested listing id before returning duplicate details.  ✅ Fixed
3. **High - Admin login throttling is bypassable through spoofable forwarded IP headers and per-process memory.** Location: `src/app/api/admin/auth/route.js:6-13`, `src/app/api/admin/auth/route.js:46-76`. Status: fixed by moving production admin login throttling to Redis, failing closed when Redis is unavailable, ignoring `x-forwarded-for`/`x-real-ip`, and only allowing `cf-connecting-ip` when `ADMIN_TRUST_CF_CONNECTING_IP=true` after direct-origin access is blocked. ✅ Fixed

### Medium

1. **Medium - Public price-history API bypasses the paid `/anunt` price-history lock.** Location: `src/app/api/listing-price-history/route.js:32-76`. Fix: gate price-history reads behind the same `listing_analysis` access decision, or only return this data from the protected `/api/estimate` listing-analysis response.
2. **Medium - CSP still allows inline and eval script execution.** Location: `next.config.mjs:44-49`. Fix: remove `'unsafe-eval'` and replace inline script allowances with nonces or hashes for the exact scripts that must run.
3. **Medium - IP hashes fall back to a public default salt.** Location: `src/app/api/ad-source-events/route.js:8`, `src/app/api/estimate/route.js:236`, `src/app/api/estimate-rent/route.js:31`. Fix: require `TRACKING_SALT` in production and fail closed when it is missing.
4. **Medium - Public listing-preview endpoint can be abused for unauthenticated outbound fetch/load amplification.** Location: `src/app/api/listing-preview-images/route.js:24-41`, `src/app/api/listing-preview-images/route.js:45-70`, `src/lib/listing-preview-images.js:44-59`. Status: fixed by accepting only numeric 999.md external IDs with a 5-12 digit cap, applying a 30/min per-IP limit, checking upstream status/content length, and aborting HTML reads above 512 KB. ✅ Fixed
5. **Medium - Transitive dependency advisories remain for PostCSS XSS and `ws` memory disclosure.** Location: `pnpm-lock.yaml:1975-1979`, `pnpm-lock.yaml:2358`, `pnpm-lock.yaml:4418-4424`, `pnpm-lock.yaml:4983`. Fix: upgrade affected parents or add `pnpm.overrides` to force `postcss >=8.5.10` and `ws >=8.20.1`.
