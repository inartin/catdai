# MAIB payments

## Scope and configuration
New purchases use MAIB hosted checkout; card data stays on MAIB. Paddle checkout, records, webhooks, refunds, renewals, and cancellation remain available. Existing pricing/paywall entry points are retained. MAIB purchases never create subscriptions.

Server-only settings:
```env
PAYMENT_PROVIDER=maib
MAIB_ENVIRONMENT=sandbox
MAIB_CLIENT_ID=
MAIB_CLIENT_SECRET=
MAIB_SIGNATURE_KEY=
MAIB_PUBLIC_URL=https://dev.catdai.md
# Optional override of the published legal merchant name:
MAIB_MERCHANT_NAME=Antreprenor Independent Artin Alexandru
# Required to enable payment-confirmation email delivery:
MAIB_RECEIPT_FROM=pay@catdai.md
MAIB_SMTP_HOST=smtp-relay.brevo.com
MAIB_SMTP_PORT=587
MAIB_SMTP_USER=bd4144001@smtp-brevo.com
MAIB_SMTP_PASSWORD=
```
`PAYMENT_PROVIDER` defaults to `maib`; `MAIB_ENVIRONMENT` defaults to `sandbox`. Explicit invalid values fail. With `NODE_ENV=development`, all merchant payment URLs use `https://dev.catdai.md`, even if `MAIB_PUBLIC_URL`, a configured Paddle checkout URL or the current browser origin points at production/localhost. This includes checkout entry points, MAIB callbacks/success/failure returns, payment-result navigation and receipt website/order links. In production, `MAIB_PUBLIC_URL` must be the reachable HTTPS application origin (defaults to the canonical site URL); the worker must use the same configuration. Resolution is shared in `src/lib/payment-urls.mjs`. This does not change `MAIB_ENVIRONMENT` or the processor's API/hosted-checkout domains. Keep all three credentials out of public env variables and logs. Production activation and production credentials are a separate rollout.

The fixed server catalog is `src/lib/maib/products.mjs`. Individual feature purchases accept 1–100 uses: 1/3/5/10/20 uses cost 25/65/89/169/269 MDL, with linear interpolation between adjacent tiers and 13.45 MDL per use above 20, calculated in integer minor units. Savings use the undiscounted 25 MDL per use as their baseline and show a rounded percentage plus the amount saved. Quantities and discounts apply only to the `_single` products; all-feature packs remain one bundle per purchase. The server validates quantity and snapshots the total price and multiplied grants. Order/status/receipt quantities come from these immutable grants; MAIB receives one bundle item at the total price, avoiding fractional per-unit rounding. The pricing page sells `all_features_5` at 99 MDL (5 uses of each of the six features) and `all_features_20` at 299 MDL (20 each). These are one-time, additive purchases with no expiry. The individual card selects exactly one existing single-feature product before checkout. Older catalog keys remain supported for existing flows and order history; historical order prices and grants are snapshots. Orders use integer minor units; MAIB receives major MDL units. Browser prices/grants are ignored.

## Migration and deployment order
1. Existing shared `db/paynet_payments.sql` and `db/paddle_payments.sql` must already be applied. Do not rerun old migrations over the new credit functions.
2. Apply `db/maib_payments.sql` as an administrative SQL migration. It is transactional/idempotent, adds five RLS-protected tables and service-only functions/views, and replaces credit consumption with an atomic dual-source implementation. The 5 October update adds purchase snapshots and the receipt queue without fabricating consent or email for historical orders. The merchant reports applying the updated SQL on 5 October; this application was not independently rechecked. Check RLS and revoked anon/authenticated permissions during rollout.
3. Deploy the application with sandbox settings and a reachable callback URL. Preserve all Paddle settings. New Paddle create calls return 409 while MAIB is selected; existing servicing remains enabled.
4. Start `catdai-maib-reconciliation` from `ecosystem.config.cjs` with the same env and repository working directory. Use `pnpm exec node scripts/reconcile-maib.mjs --once` for a bounded recovery check. The PM2 worker runs independently of the active checkout provider.
5. Verify a dedicated test account, signed callback, payment status, credit use, full refund, and worker recovery. Do not expose sandbox purchases to ordinary customers. Production credentials/environment activation require a separate deployment decision.

## Checkout and verification
For MAIB's review team, development login includes one ordinary `maib-test` account with a generated password. Provisioning and server-only settings are documented in [Auth Config](auth-config.md). The reviewer still supplies a real checkout receipt email; the account's internal authentication email is not a receipt destination.

`/payment/checkout` selects the processor server-side, retaining product, RO/RU language, and safe local return destination. Login stays in the checkout flow. MAIB checkout shows the product, quantity, compact feature-name/use-count lines, digital delivery and browser requirements, with the shared site footer excluding the merchant identity/address/contact block. Feature descriptions and the sandbox banner are omitted on checkout; sandbox result pages retain their test banner. An initially unchecked Terms checkbox and a real receipt email are required; Google email is prefilled, while Telegram placeholder addresses are rejected. The API requires strict acceptance and the current `MAIB_TERMS_VERSION`, then snapshots the server timestamp, version, receipt address, localized product title, grants and amount. Existing orders are returned unchanged on retries. `/api/payments/create` is the common API; `/api/payments/maib/create` and `/status` require Supabase authentication, validate ownership, and are rate-limited. A per-user request UUID prevents repeated order creation. Unknown creation is recovered by order lookup; never blindly POST again.

The authenticated return page shows the stored order number, product, quantity, grants, amount/currency and verified `paid_at` in Europe/Chisinau time. It does not take payment details from redirect parameters. Pending payments have no paid date. Terms version `2026-10-10` corresponds to the legal-page update for individual quantities and their discount; change both when checkout terms change.

## Payment confirmations
`apply_maib_payment` queues one receipt per new order atomically with the verified payment. The existing reconciliation worker processes up to ten receipts per pass, independently of bank reconciliation failures. RO/RU plain-text receipts include legal merchant name, CatDai/site, order number, stored product title, quantity, included uses, amount/currency, payment date and a link to the authenticated order page. Sandbox receipts are explicitly marked as tests; refunded amounts are included when present.

Edit the email subject and ordered body paragraphs in `maib.receiptSubject` and `maib.receiptBody` in `src/locales/ro.json` and `src/locales/ru.json`. Braced placeholders are filled from the payment order; empty `{sandbox}` and `{refund}` paragraphs are omitted. Feature labels, sandbox wording and refund labels use their existing locale keys.

Set the required email settings above on the worker. Brevo has authenticated `catdai.md` and activated `pay@catdai.md` as the sender; Cloudflare forwards replies at `pay@catdai.md` to the existing merchant inbox. Keep the existing `info@catdai.md` routing and sender setup intact. Use a Brevo SMTP key for `MAIB_SMTP_PASSWORD`; the MCP/API key is not the SMTP password. The merchant name defaults to the supplied legal identity in `src/lib/merchant.mjs`; `MAIB_MERCHANT_NAME` can explicitly override it. Port 465 uses implicit TLS; other ports require STARTTLS. Missing SMTP configuration disables sending and leaves receipts queued; it never blocks payment reconciliation. Ignored `.env.local` files hold the SMTP settings locally and on the production host. STARTTLS authentication from both hosts, an SMTP test message, and `pay@` forwarding to the merchant inbox were verified on 8 October 2026. An actual queued production MAIB receipt remains unverified until a production order is paid.

`maib_payment_receipts` is service-only. Atomic claims prevent concurrent sends; sent receipts are never automatically resent. Explicit SMTP rejections and failures before message submission retry with backoff (one minute to one hour). A timeout after submission, failure to persist the outcome, or expired sending lease is held as `unknown`: SMTP cannot guarantee exactly-once delivery. Inspect SMTP logs using the stable Message-ID `<maib-ORDER_UUID@catdai.md>` before deliberately resetting an unknown receipt to pending. Historical orders without a recorded receipt email are not backfilled.

`/api/maib/callback` is public, but requires MAIB's Base64 HMAC-SHA256 over the exact raw body plus `.` and millisecond timestamp. Constant-time comparison and a five-minute tolerance reject forgery/replay outside the window. Store only a hash and minimal verification fields in the audit table, never card/payer data. Signed callbacks and owner status requests fetch authoritative bank status, verify checkout/order/payment IDs, environment, amount, and currency, then share `apply_maib_payment`. Redirect parameters never grant credits. Duplicate/late events cannot grant twice or reactivate a refunded order. Bank requests validate HTTP status and `ok`; access tokens are cached until 30 seconds before expiry.

MAIB rejects bodyless GET requests carrying `Content-Type: application/json`; only JSON POSTs send that header. Hosted checkout uses `checkout.maib.md` or `checkout-sandbox.maib.md`.

## Credits and reporting
`maib_credit_grants` keeps one row per order/feature. `user_feature_credit_balances` aggregates legacy and MAIB balances. Paid-credit consumption is transactional and idempotent, taking legacy balances first, then oldest MAIB grants. Each feature uses its monthly free allowance before paid credits, regardless of prior purchases. Paddle resets/cancellation affect only legacy balances. Explicit admin package resets/balance overrides use `override_payment_credits` to replace both sources atomically; bulk overrides retain consumed counts.

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
pnpm exec node scripts/test-maib-receipts.mjs
pnpm lint
pnpm build
```
The database suite uses PGlite and applies the migration twice. It covers atomic grants, duplicates, stacking, consumption/idempotency, partial/full refunds, delayed payment events, Paddle reset isolation, admin overrides, reporting, leases, receipt queue/claims and role privileges. Client/route tests cover the catalog, signature/timestamp/amount validation, ownership, admin/origin checks, safe return links, cursor validation, token cache, consent/email validation, order snapshots and provider selection. Receipt tests generate real RO/RU MIME without sending mail and exercise safe retries, uncertainty and duplicate prevention. Sandbox bank testing and real SMTP delivery are separate from these tests.

Rollback new checkout by setting `PAYMENT_PROVIDER=paddle` and restarting the application. Original Paddle Extra subscription behavior returns. Keep MAIB secrets, tables, callbacks, and reconciliation running for existing orders/refunds. Do not delete either provider's data or reverse the shared credit migration.
## Merchant requirements still to complete
The supplied identity is Antreprenor Independent Artin Alexandru, IDNO 1026023011448, address Chisinau, Bd. Decebal, 63. Terms, Privacy, Refund and receipt defaults share `src/lib/merchant.mjs`. MAIB's supplied PDF template was compared across all three pages: Terms cover its seven required subject areas, with digital delivery replacing retail/courier clauses, issuer currency conversion, same-card MAIB refunds, and the existing five-working-day response target. General Terms acceptance and credit activation do not waive statutory withdrawal rights.

Confirm registration/registered activities, MAIB eligibility for this merchant status, client status and production approval. Have the exact statutory withdrawal period/exceptions for CatDai's credit/service model reviewed before claiming full legal compliance; no separate early-performance/withdrawal waiver is collected. The template's phone and separate physical-address placeholders were not invented. Its fiscal-receipt promise was not copied: only cashless card payments are supported here, and the independent-entrepreneur tax treatment must match the merchant's actual registration. Deploy the app/worker with its SMTP settings and verify a real receipt, return page and refund. The merchant confirms CatDai does not use MAIB liber, so its branding is not applicable. The official MAIB footer asset comes from [MAIB's WooCommerce plugin](https://github.com/maib-ecomm/maib-payment-gateway-for-woocommerce/blob/main/assets/img/maib.png).

## Sandbox verification — 2 October 2026
The migration was applied to CatDai Supabase and RLS/service-only access verified. Dedicated sandbox order `eceb6174-9b3b-4b19-8f01-6205bdeec166` charged 99 MDL using the supplied MAIB test card. The real signed callback was processed, six two-use grants were verified, and one sale credit was consumed. CatDai admin submitted a 99 MDL refund; MAIB confirmed Accepted, the order became refunded, unused credits became zero, and the consumed use remained recorded. A duplicate refund submission was blocked. The reconciliation worker completed a bounded recovery pass and released its lease.

RO/RU anonymous checkout, authenticated profile/admin history, status ownership, unsigned callback rejection, same-origin refund protection, server price/grant selection, and inactive Paddle creation were checked. Provider rollback, refund failure/manual/pending states, and event ordering are covered by automated tests; a new live Paddle purchase and a fresh Google/Telegram OAuth login were not performed. Focused tests and the production build passed. Repository-wide lint reports 12 pre-existing `react-hooks/set-state-in-effect` errors; the payment changes add no lint errors. The application/PM2 worker have not been deployed, and production MAIB has not been activated.

## Production rollout — 8 October 2026
The `8d2b05e` release was built and deployed to the CatDai production host. The app reports `maib` / `production` at `/api/payments/config`; the homepage and pricing page return HTTP 200. The `catdai-maib-reconciliation` PM2 worker is online with no startup errors, and PM2's process list is saved for the enabled boot service. Production MAIB authentication and Brevo SMTP STARTTLS authentication succeeded. No production MAIB orders existed when the worker started, so live checkout, payment callback, receipt, and refund delivery still need an actual production transaction to verify.
