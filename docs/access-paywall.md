# Access And Paywall

## Stage
Preview paywall implemented. Paddle checkout is connected for evaluation limit popups.

## Current Access Rule
- Anonymous users are `free`.
- Authenticated Supabase users are `free` by default; authentication and paid access are separate.
- Sale/buy full evaluation access for free authenticated users is limited to 2 unique evaluations per UTC month.
- `/api/estimate` records free full-evaluation usage in `user_feature_usage_events` with `source = 'free_monthly'`; repeated loads of the same normalized sale/buy criteria in the same month reuse the same idempotency key.
- Runtime usage persistence runs when `NODE_ENV=production` or `ENABLE_RUNTIME_PERSISTENCE=true`; local dev can use the live Supabase dataset when this flag is enabled.
- `user_entitlements` schema exists, but `resolveAccessTier()` does not read it yet.
- Paynet is not used whatsoever and must not be connected to checkout. The old Paynet API routes now return disabled responses.
- `db/paynet_payments.sql` still contains shared credit tables/helpers used by the current free monthly usage limit and by Paddle grants.
- `db/paddle_payments.sql` prepares the Paddle one-time payment schema: Paddle payment orders, webhook audit rows, and idempotent grants into the same feature-credit system.
- `POST /api/payments/paddle/create` and `POST /api/paddle/webhooks` create Paddle transactions and grant credits only after verified `transaction.completed` notifications.
- The Paddle create route rejects transaction responses that contain recurring items or a `subscription_id`, so subscription-backed checkouts are not accepted.
- Limit-reached sale and rent evaluation popups and result action columns show the same reusable feature-pricing checkout action.
- Limit-reached blurred-value popups say the 2 free monthly evaluations were used, prompt the user to choose a package, and show Standard as the default package action with a secondary link to `/pricing`.
- Paddle checkout and status pages use the CatDai-branded RO/RU payment shell and preserve the selected language through the checkout/status redirect.
- Sale and rent evaluation single-access checkouts use the same Paddle price ID from `PADDLE_PRICE_LISTING_ANALYSIS_SINGLE`, display the euro amount from `PADDLE_PRICE_LISTING_ANALYSIS_SINGLE_COST` plus `≈ MDL` at 20 MDL per EUR, and grant one `sale_estimate` or `rent_estimate` credit after Paddle confirms payment.
- Authenticated free users consume the monthly free allowance before paid credits; paid credits are used only after the free monthly limit is reached.
- When a paid sale/rent credit is used, `user_feature_usage_events.metadata.evaluation_snapshot` stores the immutable full result for profile history replay by `snapshot_id`.

## Result Payload
Sale/buy estimate results return a preview for anonymous users:
- the main market estimate stays visible
- locked values are removed from `/api/estimate` before the JSON response
- the UI shows blurred placeholder values with a lock icon and the shared tooltip
- clicking a blurred value opens the shared auth popup
- when the monthly free limit is reached, blurred values use the unlock-evaluation tooltip instead of the login tooltip

Locked preview sections include fast/target prices, price per m2, range numbers, market stats, district comparison values, seller breakdown, and listing details.
The sale/buy preview still shows the sector/city trend card title and period, but uses fake blurred `9.999`-style trend data and the shared auth tooltip instead of exposing the real trend payload.

## Full Payload
Authenticated free users receive the full sale/buy estimate response while they have monthly free allowance remaining. After the monthly allowance is exhausted, `/api/estimate` returns the same preview payload shape used for anonymous users plus `access_limit.reason = free_monthly_limit_reached`.
Rent evaluation uses the same limit and purchase flow through `/api/estimate-rent` with `rent_estimate` credits.
Cadastral lookup is login-gated: authenticated users receive full extracted apartment/building details, while anonymous users get the shared auth popup in the UI and `401 unauthorized` from the cadastral APIs.
PDF export dialogs are visible to anonymous users, but downloading a PDF requires a valid authenticated Supabase bearer token checked by `/api/pdf-generation-authorizations`.

## Share Exception
If a shared link was created by a paid user, `/api/estimate` allows full result access through `share_slug`.

## Related Files
- `src/lib/access-tier.js`
- `src/lib/free-monthly-feature-usage.js`
- `src/app/api/estimate/route.js`
- `src/app/api/cadastral/route.js`
- `src/components/EstimateResult.js`
- `src/components/FeaturePricingAction.js`
- `src/components/BlurWall.js`
- `src/components/Tooltip.js`
- `src/locales/ro.json`
- `src/locales/ru.json`
- `db/user_entitlements.sql`
- `db/paynet_payments.sql`
- `db/paddle_payments.sql`
- `src/app/api/payments/paddle/create/route.js`
- `src/app/api/paddle/webhooks/route.js`
- `src/app/payment/paddle/checkout/page.js`
- `src/lib/paddle.js`
- `src/lib/paddle-products.js`
- `src/lib/payment-products.js`
- `src/lib/evaluation-snapshots.js`
