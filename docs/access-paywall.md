# Access And Paywall

## Stage
Preview paywall implemented. Paynet and Paddle backend payment routes are prepared.

## Current Access Rule
- Anonymous users are `free`.
- Any authenticated Supabase user is currently returned as `paid`.
- `user_entitlements` schema exists, but `resolveAccessTier()` does not read it yet.
- `db/paynet_payments.sql` prepares the simplified Paynet MVP schema: payment orders, Paynet notifications, aggregate user feature credits, and idempotent feature usage events.
- `POST /api/payments/paynet/create` and `POST /api/paynet/notifications` create Paynet orders and grant credits after verified paid notifications.
- `db/paddle_payments.sql` prepares the Paddle one-time payment schema: Paddle payment orders, webhook audit rows, and idempotent grants into the same feature-credit system.
- `POST /api/payments/paddle/create` and `POST /api/paddle/webhooks` create Paddle transactions and grant credits only after verified `transaction.completed` notifications.
- The Paddle create route rejects transaction responses that contain recurring items or a `subscription_id`, so subscription-backed checkouts are not accepted.
- Current app access logic does not read the Paynet credit tables yet, and no frontend checkout UI is connected yet.
- Current app access logic also does not read Paddle-backed credits yet. Paddle has only a standalone default payment link page for test payments, not pricing-page checkout UI.

## Result Payload
Sale/buy estimate results return a preview for anonymous users:
- the main market estimate stays visible
- locked values are removed from `/api/estimate` before the JSON response
- the UI shows blurred placeholder values with the shared tooltip
- clicking a blurred value opens the shared auth popup

Locked preview sections include fast/target prices, price per m2, range numbers, market stats, district comparison values, seller breakdown, and listing details.

## Paid Payload
Paid users receive the full estimate response.
Cadastral lookup is login-gated: authenticated users receive full extracted apartment/building details, while anonymous users get the shared auth popup in the UI and `401 unauthorized` from the cadastral APIs.
PDF export dialogs are visible to anonymous users, but downloading a PDF requires a valid authenticated Supabase bearer token checked by `/api/pdf-generation-authorizations`.

## Share Exception
If a shared link was created by a paid user, `/api/estimate` allows full result access through `share_slug`.

## Related Files
- `src/lib/access-tier.js`
- `src/app/api/estimate/route.js`
- `src/app/api/cadastral/route.js`
- `src/components/EstimateResult.js`
- `src/components/BlurWall.js`
- `src/components/Tooltip.js`
- `src/locales/ro.json`
- `src/locales/ru.json`
- `db/user_entitlements.sql`
- `db/paynet_payments.sql`
- `src/app/api/payments/paynet/create/route.js`
- `src/app/api/paynet/notifications/route.js`
- `src/lib/paynet.js`
- `src/lib/paynet-products.js`
- `db/paddle_payments.sql`
- `src/app/api/payments/paddle/create/route.js`
- `src/app/api/paddle/webhooks/route.js`
- `src/app/payment/paddle/checkout/page.js`
- `src/lib/paddle.js`
- `src/lib/paddle-products.js`
- `src/lib/payment-products.js`
