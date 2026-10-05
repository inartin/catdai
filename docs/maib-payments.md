# MAIB payments

## Scope and configuration
New purchases use MAIB hosted checkout; card data stays on MAIB. Paddle checkout, records, webhooks, refunds, renewals, and cancellation remain available. Layout/paywalls are unchanged. MAIB purchases never create subscriptions.

Server-only settings:
```env
PAYMENT_PROVIDER=maib
MAIB_ENVIRONMENT=sandbox
MAIB_CLIENT_ID=
MAIB_CLIENT_SECRET=
MAIB_SIGNATURE_KEY=
MAIB_PUBLIC_URL=https://dev.catdai.md
```
`PAYMENT_PROVIDER` defaults to `maib`; `MAIB_ENVIRONMENT` defaults to `sandbox`. Explicit invalid values fail. `MAIB_PUBLIC_URL` must be the reachable HTTPS application origin (defaults to the canonical site URL); callback and return URLs are derived from it. Keep all three credentials out of public env variables and logs. Production activation and production credentials are a separate rollout.

The fixed server catalog is `src/lib/maib/products.mjs`. Standard costs 99 MDL and grants 2 uses per feature; Pro 199/10; Extra 499/50. All are non-expiring, one-time, additive purchases. Sale/rent singles cost 20 MDL each, listing analysis 29, cadastru 19, yield calculator/PDF 29 each, with one corresponding use. Orders snapshot grants and integer minor units; MAIB receives major MDL units. Browser prices/grants are ignored.

## Migration and deployment order
1. Existing shared `db/paynet_payments.sql` and `db/paddle_payments.sql` must already be applied. Do not rerun old migrations over the new credit functions.
2. Apply `db/maib_payments.sql` as an administrative SQL migration. It is transactional/idempotent, adds four RLS-protected tables and service-only functions/views, and replaces credit consumption with an atomic dual-source implementation. Check RLS and revoked anon/authenticated permissions.
3. Deploy the application with sandbox settings and a reachable callback URL. Preserve all Paddle settings. New Paddle create calls return 409 while MAIB is selected; existing servicing remains enabled.
4. Start `catdai-maib-reconciliation` from `ecosystem.config.cjs` with the same env and repository working directory. Use `pnpm exec node scripts/reconcile-maib.mjs --once` for a bounded recovery check. The PM2 worker runs independently of the active checkout provider.
5. Verify a dedicated test account, signed callback, payment status, credit use, full refund, and worker recovery. Do not expose sandbox purchases to ordinary customers. Production credentials/environment activation require a separate deployment decision.

## Checkout and verification
`/payment/checkout` selects the processor server-side, retaining product, RO/RU language, and safe local return destination. Login stays in the checkout flow. MAIB checkout requires an explicit continue action and shows a test banner in sandbox. `/api/payments/create` is the common API; `/api/payments/maib/create` and `/status` require Supabase authentication, validate ownership, and are rate-limited. A per-user request UUID prevents repeated order creation. Unknown creation is recovered by order lookup; never blindly POST again.

`/api/maib/callback` is public, but requires MAIB's Base64 HMAC-SHA256 over the exact raw body plus `.` and millisecond timestamp. Constant-time comparison and a five-minute tolerance reject forgery/replay outside the window. Store only a hash and minimal verification fields in the audit table, never card/payer data. Signed callbacks and owner status requests fetch authoritative bank status, verify checkout/order/payment IDs, environment, amount, and currency, then share `apply_maib_payment`. Redirect parameters never grant credits. Duplicate/late events cannot grant twice or reactivate a refunded order. Bank requests validate HTTP status and `ok`; access tokens are cached until 30 seconds before expiry.

MAIB rejects bodyless GET requests carrying `Content-Type: application/json`; only JSON POSTs send that header. Hosted checkout uses `checkout.maib.md` or `checkout-sandbox.maib.md`.

## Credits and reporting
`maib_credit_grants` keeps one row per order/feature. `user_feature_credit_balances` aggregates legacy and MAIB balances. Consumption is transactional and idempotent, taking legacy balances first, then oldest MAIB grants. The existing paid-before-free rule remains: an exhausted paid feature does not regain the free monthly allowance. Paddle resets/cancellation affect only legacy balances. Explicit admin package resets/balance overrides use `override_payment_credits` to replace both sources atomically; bulk overrides retain consumed counts.

`payment_orders_all` unifies histories with provider identity and sandbox labels. Profile pagination uses timestamp (including microseconds), id, and provider. `reporting_payment_orders` and `reporting_feature_credit_balances` exclude MAIB sandbox records from paid-user/advertising reports. Checkout analytics keep Paddle references and separate MAIB order references.

## Refunds and recovery
The existing admin user transaction list provides full refund, reason/amount confirmation, and status refresh. The endpoint requires the existing admin session and same-origin protection. It reads the refundable amount from the server/bank and reserves a unique active attempt before submitting once.

- Created/Requested are pending and retain credits.
- Accepted or a fully refunded payment revokes only that order's unused credits. Consumed usage remains recorded.
- Rejected is shown explicitly and permits a deliberate new request.
- Manual and unknown submissions block retries. Review the payment/refund in MAIB before any manual resolution. Never clear an unresolved reservation solely because a timeout elapsed.
- External partial refunds update the refunded amount without changing credits. Full reimbursement revokes the remainder.

The worker claims one leased order at a time, at most ten per pass; leases expire after five minutes if a process stops. Pending orders/refunds are scheduled every minute; paid/partially refunded orders every 15 minutes to detect external refunds. Failures retain a retryable error. Check `last_error`, `next_check_at`, callback audit failures, refund attempts, and PM2 logs when diagnosing. A missing payment after an ambiguous create or refund response is not proof that the request failed.

## Verification and rollback
Run targeted tests without `pnpm test` (that command starts the development tunnel):
```sh
pnpm exec node --experimental-vm-modules scripts/test-maib.mjs
pnpm exec node scripts/test-maib-database.mjs
pnpm lint
pnpm build
```
The database suite uses PGlite and applies the migration twice. It covers atomic grants, duplicates, stacking, consumption/idempotency, partial/full refunds, delayed payment events, Paddle reset isolation, admin overrides, reporting, leases, and role privileges. Client/route tests cover the catalog, signature/timestamp/amount validation, ownership, admin/origin checks, safe return links, cursor validation, token cache, and provider selection. Sandbox bank testing is separate from mocked tests.

Rollback new checkout by setting `PAYMENT_PROVIDER=paddle` and restarting the application. Original Paddle Extra subscription behavior returns. Keep MAIB secrets, tables, callbacks, and reconciliation running for existing orders/refunds. Do not delete either provider's data or reverse the shared credit migration.

## Sandbox verification — 2 October 2026
The migration was applied to CatDai Supabase and RLS/service-only access verified. Dedicated sandbox order `eceb6174-9b3b-4b19-8f01-6205bdeec166` charged 99 MDL using the supplied MAIB test card. The real signed callback was processed, six two-use grants were verified, and one sale credit was consumed. CatDai admin submitted a 99 MDL refund; MAIB confirmed Accepted, the order became refunded, unused credits became zero, and the consumed use remained recorded. A duplicate refund submission was blocked. The reconciliation worker completed a bounded recovery pass and released its lease.

RO/RU anonymous checkout, authenticated profile/admin history, status ownership, unsigned callback rejection, same-origin refund protection, server price/grant selection, and inactive Paddle creation were checked. Provider rollback, refund failure/manual/pending states, and event ordering are covered by automated tests; a new live Paddle purchase and a fresh Google/Telegram OAuth login were not performed. Focused tests and the production build passed. Repository-wide lint reports 12 pre-existing `react-hooks/set-state-in-effect` errors; the payment changes add no lint errors. The application/PM2 worker have not been deployed, and production MAIB has not been activated.
