# Paddle Payments

## Stage
Paddle one-time payment flow is connected for packages, evaluation limit popups, and single-feature products.

## Scope
- Paddle is added for one-time payments only.
- Subscriptions are intentionally not used.
- Paddle is the only payment processor CatDai uses for now.
- Paynet is not used whatsoever. Any old Paynet code is dormant compatibility code and must not be wired into checkout.

## Routes
- `POST /api/payments/paddle/create`
  - requires Supabase bearer token
  - accepts `product_key`, optional `lang`, optional `customer`
  - validates the configured Paddle price ID before creating a local order
  - creates a local pending Paddle order
  - creates a Paddle transaction with one configured `price_id`
  - rejects the transaction response if Paddle reports recurring items or a `subscription_id`
  - returns `order_id`, `paddle_transaction_id`, and `checkout.url`
  - when `PADDLE_CHECKOUT_URL` is configured, returns that CatDai checkout page instead of Paddle's hosted checkout URL
- `POST /api/paddle/webhooks`
  - public endpoint for Paddle notifications
  - verifies `Paddle-Signature` using the raw request body
  - processes `transaction.completed`, `transaction.canceled`, and `transaction.payment_failed`
  - stores all webhook deliveries for audit and idempotency
- `GET /api/payments/paddle/status`
  - requires Supabase bearer token
  - returns the authenticated user's Paddle order status by `order_id` or `transaction_id`
- `POST /api/payments/paddle/checkout-closed`
  - requires Supabase bearer token
  - marks the authenticated user's open Paddle order as `checkout_closed` when Paddle.js reports `checkout.closed`
  - does not change already paid, failed, or canceled orders
- `GET /api/profile/transactions`
  - requires Supabase bearer token
  - returns the authenticated user's Paddle order rows for the profile transactions tab
  - includes product key, status, amount, currency, Paddle transaction id, paid date, created date, and internal order id
- `GET /payment/paddle/checkout`
  - noindex default payment link page for Paddle
  - loads Paddle.js and opens the transaction passed by Paddle as `_ptxn`
  - preserves optional local `return_to` and `lang` query values for the status page
  - uses the shared clean checkout shell with CatDai logo, RO/RU copy, and a secure-payment state panel
  - requires `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
- `GET /payment/paddle/success`
  - noindex status page for the Paddle flow
  - polls the status endpoint and shows paid, pending, failed, or canceled state
  - marks the local order `checkout_closed` when reached after the overlay checkout was closed by the user, without treating it as a final payment cancellation
  - uses the same checkout shell and localized RO/RU status copy, including internal order states like `registered`
  - links back to the originating evaluation path when checkout started from a limit popup
- `GET /payment/paddle/test`
  - noindex temporary test page
  - creates a `cadastru_lookup_single` Paddle payment through `POST /api/payments/paddle/create`
  - redirects to the returned Paddle checkout URL and keeps the UI minimal
  - not linked from pricing or public navigation

## Product Model
- Paddle uses the CatDai one-time product keys:
  - `standard_pack`
  - `pro_pack`
  - `extra_pack`
  - `sale_estimate_single`
  - `rent_estimate_single`
  - `listing_analysis_single`
  - `cadastru_lookup_single`
  - `yield_calculator_single`
  - `pdf_report_single`
- Product grants are shared in app code through `src/lib/payment-products.js`.
- Standard, Pro, and Extra grant 2, 10, and 50 uses respectively for every paid feature, with no time expiry.
- Single-feature products grant one use for their feature and stack onto existing package credits.

## Paddle Requirements
- Each supported product key needs a Paddle `price_id` in env.
- If `PADDLE_PRICE_STANDARD_PACK` is set to a Paddle product id (`pro_...`), the create route resolves its active one-time price id before creating the transaction.
- The create route verifies catalog price IDs and no recurring billing cycle.
- Non-production create-route failures include a short `details` field so the temporary Paddle test page can show the exact Paddle/API/Supabase failure during setup.
- Webhook access is granted only after a verified `transaction.completed` event.
- Subscribe the Paddle webhook destination to `transaction.completed`, `transaction.payment_failed`, and `transaction.canceled`. Closing an overlay checkout is handled client-side with Paddle.js `checkout.closed`; Paddle says `transaction.canceled` is not typically part of automatic checkout workflows.
- `PADDLE_WEBHOOK_SECRET_KEY` must be the webhook endpoint secret from Paddle, not the `ntfset_...` notification setting id.
- If a Paddle webhook includes a `subscription_id`, CatDai rejects it because this integration is one-time only.
- The Paddle API key needs `transaction.write`.

## Environment
```env
PADDLE_ENVIRONMENT=sandbox
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET_KEY=
PADDLE_CHECKOUT_URL=
NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=
PADDLE_PRICE_STANDARD_PACK=
PADDLE_PRICE_PRO_PACK=
PADDLE_PRICE_EXTRA_PACK=
PADDLE_PRICE_LISTING_ANALYSIS_SINGLE=
PADDLE_PRICE_LISTING_ANALYSIS_SINGLE_COST=
PADDLE_PRICE_CADASTRU_LOOKUP_SINGLE=
PADDLE_PRICE_YIELD_CALCULATOR_SINGLE=
PADDLE_PRICE_PDF_REPORT_SINGLE=
PADDLE_WEBHOOK_TOLERANCE_SECONDS=300
```

`PADDLE_PRICE_LISTING_ANALYSIS_SINGLE` is the shared Paddle price ID for sale/rent single-evaluation checkout and 999 listing analysis. `PADDLE_PRICE_LISTING_ANALYSIS_SINGLE_COST` is the numeric EUR amount shown in the UI, plus `≈ MDL` using 20 MDL per EUR.

## Database
- `db/paddle_payments.sql` adds:
  - `paddle_payment_orders`
  - `paddle_webhook_events`
  - `grant_paddle_payment_order_feature_credits(...)`
  - `complete_paddle_payment(...)`
- Paddle grants write into the existing shared `user_feature_credits` table.
- Paid uses are logged in `user_feature_usage_events`; `user_feature_credits.remaining_uses` and `total_used` drive the profile balance display.
- `paddle_payment_orders.status` includes `checkout_closed` for a user-closed overlay checkout that has not received a final Paddle payment outcome.
- Run the shared credit schema from `db/paynet_payments.sql` before `db/paddle_payments.sql`, because that file still defines shared credit tables and helpers used by Paddle. Do not use the Paynet order/notification tables for checkout.

## Related Files
- `src/lib/payment-products.js`
- `src/lib/paddle.js`
- `src/lib/paddle-products.js`
- `src/app/api/payments/paddle/create/route.js`
- `src/app/api/payments/paddle/status/route.js`
- `src/app/api/paddle/webhooks/route.js`
- `src/app/payment/paddle/checkout/page.js`
- `src/app/payment/paddle/checkout/layout.js`
- `src/app/payment/paddle/success/page.js`
- `src/app/payment/paddle/success/layout.js`
- `src/app/payment/paddle/test/page.js`
- `src/app/payment/paddle/test/layout.js`
- `db/paddle_payments.sql`
