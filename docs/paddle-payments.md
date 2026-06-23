# Paddle Payments

## Stage
Paddle payment flow is connected for one-time packages, the Extra monthly subscription, evaluation limit popups, and single-feature products.

## Scope
- Paddle handles one-time payments for Standard, Pro, and single-feature products.
- Extra uses a monthly Paddle subscription.
- Paddle is the only payment processor CatDai uses for now.
- Paynet is not used whatsoever. Any old Paynet code is dormant compatibility code and must not be wired into checkout.

## Routes
- `POST /api/payments/paddle/create`
  - requires Supabase bearer token
  - accepts `product_key`, optional `lang`, optional `customer`
  - validates the configured Paddle price ID before creating a local order
  - creates a local pending Paddle order
  - creates a Paddle transaction with one configured `price_id`
  - requires a one-time price for Standard, Pro, and single-feature products
  - requires a monthly subscription price for Extra
  - returns `order_id`, `paddle_transaction_id`, and `checkout.url`
  - when `PADDLE_CHECKOUT_URL` is configured, returns that CatDai checkout page instead of Paddle's hosted checkout URL
- `POST /api/paddle/webhooks`
  - public endpoint for Paddle notifications
  - verifies `Paddle-Signature` using the raw request body
  - processes `transaction.completed`, `transaction.canceled`, and `transaction.payment_failed`
  - tracks Extra subscription state from `subscription.*` events
  - resets Extra credits to 50 per paid feature for each completed subscription billing period
  - clears Extra credits when renewal payment fails or the subscription becomes canceled, past due, or paused
  - creates `source = 'system'` user notifications for Extra activation, renewal, cancellation, and failed renewal
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
  - includes product key, status, amount, currency, Paddle transaction/subscription id, paid date, created date, and internal order id
- `GET /api/profile/subscription`
  - requires Supabase bearer token
  - returns the authenticated user's active Extra subscription state when present
- `POST /api/profile/subscription`
  - requires Supabase bearer token
  - cancels the user's active Extra subscription at the next billing period through Paddle
  - marks `cancel_at_period_end` locally while Paddle webhooks remain the source of truth
  - creates a system notification when the cancellation is scheduled
- `GET /payment/paddle/checkout`
  - noindex default payment link page for Paddle
  - loads Paddle.js and opens the transaction passed by Paddle as `_ptxn` in an inline checkout frame on the page
  - logs a `checkout_page_opened` event in `payment_checkout_events` for admin statistics
  - prefills Paddle customer email from the authenticated Supabase user when the email is real; Telegram placeholder emails like `telegram-<id>@auth.catdai.md` are not sent
  - shows a localized left-side purchase summary from the create-route product payload saved in `sessionStorage`; package summaries show the package name, included usage count, exact EUR price first, and approximate configured `NEXT_PUBLIC_PRICE_*_MDL_COST` as secondary
  - preserves optional local `return_to` and `lang` query values for the status page
  - uses the shared clean checkout shell with CatDai logo, RO/RU copy, and a secure-payment panel that contains the Paddle frame
  - shows two localized reassurance cards below the checkout shell: Paddle processing with supported payment method chips, and EUR-vs-MDL conversion copy
  - requires `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
- `GET /payment/paddle/success`
  - noindex status page for the Paddle flow
  - polls the status endpoint and shows paid, pending, failed, or canceled state
  - marks the local order `checkout_closed` when reached after Paddle.js reports the checkout was closed by the user, without treating it as a final payment cancellation
  - uses the same checkout shell and localized RO/RU status copy, including internal order states like `registered`
  - links back to the originating evaluation path when checkout started from a limit popup
- `GET /payment/paddle/test`
  - noindex temporary test page
  - creates a `cadastru_lookup_single` Paddle payment through `POST /api/payments/paddle/create`
  - redirects to the returned Paddle checkout URL and keeps the UI minimal
  - not linked from pricing or public navigation

## Product Model
- Paddle uses the CatDai product keys:
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
- Standard and Pro grant 2 and 10 uses respectively for every paid feature, with no time expiry.
- Extra is a monthly subscription and resets to 50 uses for every paid feature each paid billing period.
- Extra credits do not roll over; without a successful renewal, remaining Extra credits are cleared.
- Single-feature products grant one use for their feature and stack onto existing package credits.

## Paddle Requirements
- Each supported product key needs a Paddle `price_id` in env.
- If `PADDLE_PRICE_STANDARD_PACK`, `PADDLE_PRICE_PRO_PACK`, or `PADDLE_PRICE_EXTRA_PACK` is set to a Paddle product id (`pro_...`), the create route resolves the correct active price before creating the transaction. Extra resolves a monthly subscription price; the others resolve one-time prices.
- The create route verifies catalog price IDs and billing cycle type.
- Non-production create-route failures include a short `details` field so the temporary Paddle test page can show the exact Paddle/API/Supabase failure during setup.
- Webhook access is granted only after a verified `transaction.completed` event.
- Subscribe the Paddle webhook destination to `transaction.completed`, `transaction.payment_failed`, `transaction.canceled`, `subscription.created`, `subscription.activated`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, and `subscription.trialing`. User-closed checkout events are handled client-side with Paddle.js `checkout.closed`; Paddle says `transaction.canceled` is not typically part of automatic checkout workflows.
- `/payment/paddle/checkout` initializes Paddle Checkout with `displayMode: "inline"`, `frameTarget: "paddle-inline-checkout"`, a 520px initial frame height, and a borderless full-width frame style. Visual branding for the embedded Paddle frame is controlled in the Paddle dashboard under branded inline checkout. Paddle checkout locale maps CatDai RU to `ru` and RO to `en`, because Paddle does not provide Romanian checkout copy.
- App CSP must allow Paddle script, frame, connect, and stylesheet assets; `style-src` includes `https://cdn.paddle.com` because Paddle.js loads `paddle.css`. Paddle may also load ProfitWell, so script CSP allows `https://public.profitwell.com`.
- `PADDLE_WEBHOOK_SECRET_KEY` must be the webhook endpoint secret from Paddle, not the `ntfset_...` notification setting id.
- The Paddle API key needs `transaction.write`.
- Canceling Extra from `/profile` requires `subscription.write`.

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
# PADDLE_PRICE_EXTRA_PACK must be a monthly subscription price.
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
  - `paddle_subscriptions`
  - `paddle_subscription_credit_periods`
  - `paddle_webhook_events`
  - `payment_checkout_events`
  - `grant_paddle_payment_order_feature_credits(...)`
  - `reset_paddle_subscription_period_feature_credits(...)`
  - `clear_paddle_subscription_feature_credits(...)`
  - `complete_paddle_payment(...)`
- One-time Paddle grants add to the existing shared `user_feature_credits` table. Extra subscription renewals reset those rows to 50 per paid feature for the new paid billing period; failed/expired Extra subscription states clear those rows.
- Paid uses are logged in `user_feature_usage_events`; `user_feature_credits.remaining_uses` and `total_used` drive the profile balance display.
- `paddle_payment_orders.status` includes `checkout_closed` for a user-closed checkout that has not received a final Paddle payment outcome.
- `payment_checkout_events` records `checkout_popup_opened` when the reusable purchase popup is shown, `checkout_page_opened` when `/payment/paddle/checkout` loads, and `pricing_page_opened` when the standalone pricing page opens; admin stats count total opens and unique user/device visitors separately.
- Run the shared credit schema from `db/paynet_payments.sql` before `db/paddle_payments.sql`, because that file still defines shared credit tables and helpers used by Paddle. Do not use the Paynet order/notification tables for checkout.

## Related Files
- `src/lib/payment-products.js`
- `src/lib/paddle.js`
- `src/lib/paddle-products.js`
- `src/lib/system-notifications.js`
- `src/app/api/payments/paddle/create/route.js`
- `src/app/api/payments/paddle/status/route.js`
- `src/app/api/profile/subscription/route.js`
- `src/app/api/payment-checkout-events/route.js`
- `src/app/api/paddle/webhooks/route.js`
- `src/app/payment/paddle/checkout/page.js`
- `src/app/payment/paddle/checkout/layout.js`
- `src/app/payment/paddle/success/page.js`
- `src/app/payment/paddle/success/layout.js`
- `src/app/payment/paddle/test/page.js`
- `src/app/payment/paddle/test/layout.js`
- `db/paddle_payments.sql`
