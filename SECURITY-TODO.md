# Security TODO

## High Priority

- [x] IP whitelist on admin routes (proxy)
- [x] Rate limiting on `/api/estimate` — 30 req/min per IP, in-memory sliding window
- [x] Verify & enforce Supabase RLS — all tables have RLS enabled, no permissive policies for anon role
- [x] Security headers — added in `next.config.mjs` on all routes

## Medium Priority

- [x] Admin authentication — cookie-based password login on top of IP whitelist (two layers)
- [x] CORS on API routes — `Access-Control-Allow-Origin` restricted to `APP_URL` env var

## Lower Priority

- [x] Logging/alerting on 403s — console.warn with IP and path on blocked requests
- [x] CSP (Content Security Policy) header — restricts scripts, styles, connections, frames
