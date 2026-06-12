# Paddle Payments

## Stage
Backend Paddle one-time payment flow is prepared. Evaluation limit popups can start a Paddle checkout; pricing cards are not connected to checkout yet.

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
- `POST /api/paddle/webhooks`
  - public endpoint for Paddle notifications
  - verifies `Paddle-Signature` using the raw request body
  - processes `transaction.completed`
  - stores all webhook deliveries for audit and idempotency
- `GET /api/payments/paddle/status`
  - requires Supabase bearer token
  - returns the authenticated user's Paddle order status by `order_id` or `transaction_id`
- `GET /payment/paddle/checkout`
  - noindex default payment link page for Paddle
  - loads Paddle.js and opens the transaction passed by Paddle as `_ptxn`
  - preserves an optional local `return_to` path for the status page
  - requires `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
- `GET /payment/paddle/success`
  - noindex status page for the temporary Paddle test flow
  - polls the status endpoint and shows paid, pending, failed, or canceled state
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
  - `sale_estimate_single`
  - `rent_estimate_single`
  - `listing_analysis_single`
  - `cadastru_lookup_single`
  - `yield_calculator_single`
  - `pdf_report_single`
- Product grants are shared in app code through `src/lib/payment-products.js`.
- `extra_pack` is still excluded until its business rule is clarified.

## Paddle Requirements
- Each supported product key needs a Paddle `price_id` in env.
- The create route verifies catalog price IDs and no recurring billing cycle.
- Non-production create-route failures include a short `details` field so the temporary Paddle test page can show the exact Paddle/API/Supabase failure during setup.
- Webhook access is granted only after a verified `transaction.completed` event.
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
PADDLE_PRICE_LISTING_ANALYSIS_SINGLE=
PADDLE_PRICE_LISTING_ANALYSIS_SINGLE_COST=
PADDLE_PRICE_CADASTRU_LOOKUP_SINGLE=
PADDLE_PRICE_YIELD_CALCULATOR_SINGLE=
PADDLE_PRICE_PDF_REPORT_SINGLE=
PADDLE_WEBHOOK_TOLERANCE_SECONDS=300
```

`PADDLE_PRICE_LISTING_ANALYSIS_SINGLE` is the shared Paddle price ID for sale/rent single-evaluation checkout. `PADDLE_PRICE_LISTING_ANALYSIS_SINGLE_COST` is the numeric EUR amount shown in the UI, plus `≈ MDL` using 20 MDL per EUR.

## Database
- `db/paddle_payments.sql` adds:
  - `paddle_payment_orders`
  - `paddle_webhook_events`
  - `grant_paddle_payment_order_feature_credits(...)`
  - `complete_paddle_payment(...)`
- Paddle grants write into the existing shared `user_feature_credits` table.
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
