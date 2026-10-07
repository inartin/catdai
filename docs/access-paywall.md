# Access And Paywall

## Stage
Preview paywall implemented. Shared checkout selects MAIB by default, with Paddle retained as backup and for existing subscription servicing. See [MAIB payments](maib-payments.md).

## Current Access Rule
- Anonymous users are `free`.
- Authenticated Supabase users are `free` by default; authentication and paid access are separate.
- Authenticated users receive 1 unique free use per UTC month for each feature, including full Cadastru details, even if they have purchased credits. Anonymous Cadastru results remain masked.
- Legacy credits remain in `user_feature_credits`; MAIB purchases have per-order `maib_credit_grants`. Reads aggregate both through `user_feature_credit_balances`; the transactional consumption RPC uses legacy credits first, then oldest MAIB grants.
- Standard and Pro grant 2 and 10 non-expiring uses for each paid feature. MAIB Extra adds 50 non-expiring uses per feature, including repeat purchases. Paddle Extra is a monthly subscription that resets to 50 uses for each paid feature on each paid billing period, and failed or inactive renewal states clear remaining Extra credits.
- Approved full Paddle refunds and chargebacks mark the local payment as refunded/chargeback and remove remaining paid credits from that payment; already consumed credits remain visible in usage totals.
- Full MAIB refunds revoke only that order’s unused credits after bank confirmation. External partial refunds leave credits unchanged.
- Each gated feature consumes its free monthly allowance first, then paid credits. Already-consumed paid results remain accessible without consuming a new free use.
- Free usage is recorded in `user_feature_usage_events` with `source = 'free_monthly'`; repeated loads of the same normalized request in the same month reuse the same idempotency key.
- `/api/profile/credits` returns the current UTC-month allowance for all six features alongside paid credits; `Acces rămas` combines them into one balance card per feature.
- Runtime usage persistence runs when `NODE_ENV=production` or `ENABLE_RUNTIME_PERSISTENCE=true`; local dev can use the live Supabase dataset when this flag is enabled.
- `user_entitlements` schema exists, but `resolveAccessTier()` does not read it yet.
- Paynet is not used whatsoever and must not be connected to checkout. The old Paynet API routes now return disabled responses.
- `db/paynet_payments.sql` still contains shared credit tables/helpers used by the current free monthly usage limit and by Paddle grants.
- `db/paddle_payments.sql` prepares Paddle payment orders, Extra subscription state, webhook audit rows, one-time grants, and idempotent monthly subscription resets into the same feature-credit system.
- `POST /api/payments/paddle/create` (only with `PAYMENT_PROVIDER=paddle`) and `POST /api/paddle/webhooks` create Paddle transactions and grant or reset credits only after verified `transaction.completed` notifications.
- `POST /api/paddle/webhooks` also handles approved full Paddle refund/chargeback adjustments and revokes remaining credits so refunded orders no longer keep paid access.
- MAIB feature popups offer one use of the selected feature for 25 MDL. Pricing-page packs grant 5 uses of each feature for 99 MDL or 20 each for 299 MDL.
- In the desktop result sidebar, the unlock card appears above the PDF/share/compare actions; the unlock button is green and the PDF action is black.
- Limit-reached blurred-value popups offer a single-feature use through MAIB, with a secondary link to `/pricing`. Paddle retains its Extra offer.
- Paddle checkout and status pages use the CatDai-branded RO/RU payment shell and preserve the selected language through the checkout/status redirect.
- Sale and rent evaluation single-access checkouts charge 25 MDL each through MAIB. When Paddle is selected, they use the same Paddle price ID from `PADDLE_PRICE_LISTING_ANALYSIS_SINGLE`, display the euro amount from `PADDLE_PRICE_LISTING_ANALYSIS_SINGLE_COST` plus `≈ MDL` at 20 MDL per EUR, and grant one `sale_estimate` or `rent_estimate` credit after Paddle confirms payment.
- Purchased credits do not affect eligibility for the monthly free allowance.
- When a paid sale/rent credit is used, `user_feature_usage_events.metadata.evaluation_snapshot` stores the immutable full result for profile history replay by `snapshot_id`.
- Repeated loads of the same paid feature result reuse stable paid idempotency keys so refreshes do not consume another credit.

## Result Payload
Sale/buy estimate results return a preview for anonymous users:
- the main market estimate is removed from `/api/estimate` before the JSON response and rendered as a blurred fake value
- locked values are removed from `/api/estimate` before the JSON response
- the UI shows blurred placeholder values with a lock icon and the shared tooltip
- clicking a blurred value opens the shared package popup; anonymous checkout continues on `/payment/checkout` with product/language/return URL preserved through login
- when the monthly free limit is reached, blurred values use the unlock-evaluation tooltip instead of the login tooltip

Locked preview sections include fast/target prices, price per m2, range numbers, market stats, district comparison values, seller breakdown, and listing details.
The sale/buy preview still shows the sector/city trend card title and period, but uses fake blurred `9.999`-style trend data and the shared auth tooltip instead of exposing the real trend payload.

## Full Payload
Authenticated users receive the full sale/buy estimate response while they have a monthly free use or a paid credit remaining. Once both are exhausted, `/api/estimate` returns the locked detailed-value preview; anonymous previews additionally remove the headline estimate. Users with previously granted but exhausted sale/rent credits receive `access_limit.reason = paid_evaluation_limit_reached`; other users receive `free_monthly_limit_reached`.
Rent evaluation uses the same limit and purchase flow through `/api/estimate-rent` with `rent_estimate` credits. Anonymous rent previews remove the main monthly estimate from the JSON response and render a blurred fake value.
Cadastral lookup gives authenticated users one free full-detail result per UTC month, then consumes `cadastru_lookup` credits. Once both are exhausted, the popup offers the 25 MDL single result plus the pricing page. The standalone `/cadastru` page accepts anonymous searches and returns a server-masked preview: direct cadastral-number searches keep the submitted number visible, address searches replace the discovered cadastral number with a fake blurred number, and address, floor, classifier, and construction year remain visible when available. Anonymous blurred values open the login popup; authenticated users without a remaining allowance or credit see the package purchase popup. The remaining official cadastru fields are server-masked with `|` characters and blurred in the UI.
999 listing analysis is credit-gated with `listing_analysis` credits and does not consume sale-estimate credits. Missing login or credit returns the `/anunt` result shell with sale values, listing price-history, and detailed market data locked/blurred instead of a hard error; duplicate candidates render as fake blurred cards only when the duplicate lookup found at least one real high/medium duplicate.
Rent-yield calculator results are credit-gated with `yield_calculator` credits and do not consume rent-estimate credits; missing credit returns the calculator result shell with rent-yield, tax, market-stat, district, and listing details locked/blurred instead of a hard error.
PDF export dialogs are visible to anonymous users, but downloading a PDF requires a valid authenticated Supabase bearer token and a `pdf_report` credit checked by `/api/pdf-generation-authorizations`. Authenticated users without PDF credit see the reusable feature purchase action inside the PDF dialog after clicking download.
Shared paywall and PDF dialogs render above reusable tooltip portals so locked-state tooltips do not float on top of open popups.

## Share Exception
If a shared link was created by a paid user, `/api/estimate` allows full result access through `share_slug`.

## Related Files
- `src/lib/access-tier.js`
- `src/lib/free-monthly-feature-usage.js`
- `src/lib/paid-feature-usage.js`
- `src/app/api/estimate/route.js`
- `src/app/api/estimate-rent/route.js`
- `src/app/api/analyze-link/route.js`
- `src/app/api/cadastral/route.js`
- `src/app/api/cadastru/address/route.js`
- `src/app/api/profile/credits/route.js`
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
