# Access And Paywall

## Stage
Preview paywall implemented. Paddle checkout is connected for packages, evaluation limit popups, and paid feature credits.

## Current Access Rule
- Anonymous users are `free`.
- Authenticated Supabase users are `free` by default; authentication and paid access are separate.
- Authenticated free users receive 5 unique uses per feature per UTC month across sale/rent estimates, 999 analysis, cadastru, yield calculator, and PDF reports.
- Paid package and single-feature access is tracked in `user_feature_credits`.
- Standard and Pro grant 2 and 10 non-expiring uses for each paid feature. Extra is a monthly Paddle subscription that resets to 50 uses for each paid feature on each paid billing period, and failed or inactive renewal states clear remaining Extra credits.
- Approved full Paddle refunds and chargebacks mark the local payment as refunded/chargeback and remove remaining paid credits from that payment; already consumed credits remain visible in usage totals.
- Each gated feature consumes paid credits first, then the free monthly allowance when the user has never received a paid grant for that feature.
- Free usage is recorded in `user_feature_usage_events` with `source = 'free_monthly'`; repeated loads of the same normalized request in the same month reuse the same idempotency key.
- `/api/profile/credits` returns the current UTC-month allowance for all six features alongside paid credits, with a separate free badge in `Acces rămas`.
- Runtime usage persistence runs when `NODE_ENV=production` or `ENABLE_RUNTIME_PERSISTENCE=true`; local dev can use the live Supabase dataset when this flag is enabled.
- `user_entitlements` schema exists, but `resolveAccessTier()` does not read it yet.
- Paynet is not used whatsoever and must not be connected to checkout. The old Paynet API routes now return disabled responses.
- `db/paynet_payments.sql` still contains shared credit tables/helpers used by the current free monthly usage limit and by Paddle grants.
- `db/paddle_payments.sql` prepares Paddle payment orders, Extra subscription state, webhook audit rows, one-time grants, and idempotent monthly subscription resets into the same feature-credit system.
- `POST /api/payments/paddle/create` and `POST /api/paddle/webhooks` create Paddle transactions and grant or reset credits only after verified `transaction.completed` notifications.
- `POST /api/paddle/webhooks` also handles approved full Paddle refund/chargeback adjustments and revokes remaining credits so refunded orders no longer keep paid access.
- Locked sale and rent evaluation popups and result action columns show the same reusable feature-pricing checkout action.
- In the desktop result sidebar, the Extra unlock card appears above the PDF/share/compare actions; the unlock button is green and the PDF action is black.
- Limit-reached blurred-value popups say the free monthly evaluation was used and show Extra as the default package action with a secondary link to `/pricing`.
- Paddle checkout and status pages use the CatDai-branded RO/RU payment shell and preserve the selected language through the checkout/status redirect.
- Sale and rent evaluation single-access checkouts use the same Paddle price ID from `PADDLE_PRICE_LISTING_ANALYSIS_SINGLE`, display the euro amount from `PADDLE_PRICE_LISTING_ANALYSIS_SINGLE_COST` plus `≈ MDL` at 20 MDL per EUR, and grant one `sale_estimate` or `rent_estimate` credit after Paddle confirms payment.
- Authenticated users consume matching paid feature credits before the free monthly allowance. Users who have ever received paid credits for a feature do not receive an additional free allowance for that same feature after paid credits run out.
- When a paid sale/rent credit is used, `user_feature_usage_events.metadata.evaluation_snapshot` stores the immutable full result for profile history replay by `snapshot_id`.
- Repeated loads of the same paid feature result reuse stable paid idempotency keys so refreshes do not consume another credit.

## Result Payload
Sale/buy estimate results return a preview for anonymous users:
- the main market estimate is removed from `/api/estimate` before the JSON response and rendered as a blurred fake value
- locked values are removed from `/api/estimate` before the JSON response
- the UI shows blurred placeholder values with a lock icon and the shared tooltip
- clicking a blurred value opens the shared package popup; anonymous checkout continues on `/payment/paddle/checkout` with login methods in the checkout panel before Paddle loads
- when the monthly free limit is reached, blurred values use the unlock-evaluation tooltip instead of the login tooltip

Locked preview sections include fast/target prices, price per m2, range numbers, market stats, district comparison values, seller breakdown, and listing details.
The sale/buy preview still shows the sector/city trend card title and period, but uses fake blurred `9.999`-style trend data and the shared auth tooltip instead of exposing the real trend payload.

## Full Payload
Authenticated free users receive the full sale/buy estimate response while they have monthly free allowance remaining. After the monthly allowance is exhausted, `/api/estimate` returns the locked detailed-value preview plus `access_limit.reason = free_monthly_limit_reached`; anonymous previews additionally remove the headline estimate. Users with exhausted purchased sale/rent credits receive `access_limit.reason = paid_evaluation_limit_reached` instead of falling through to free monthly quota.
Rent evaluation uses the same limit and purchase flow through `/api/estimate-rent` with `rent_estimate` credits. Anonymous rent previews remove the main monthly estimate from the JSON response and render a blurred fake value.
Cadastral lookup is login-gated and credit-gated with `cadastru_lookup` credits. Authenticated users without a remaining credit receive a result-page preview: direct cadastral-number searches keep the submitted number visible, address searches replace the discovered cadastral number with a fake blurred number, and address, floor, and classifier remain visible when available. The remaining official cadastru fields are server-masked with `|` characters and blurred in the UI with the package purchase popup.
999 listing analysis is credit-gated with `listing_analysis` credits and does not consume sale-estimate credits. Missing login or credit returns the `/anunt` result shell with sale values, listing price-history, and detailed market data locked/blurred instead of a hard error; duplicate candidates render as fake blurred cards only when the duplicate lookup found at least one real high/medium duplicate.
Rent-yield calculator results are credit-gated with `yield_calculator` credits and do not consume rent-estimate credits; missing credit returns the calculator result shell with rent-yield, tax, market-stat, district, and listing details locked/blurred instead of a hard error.
PDF export dialogs are visible to anonymous users, but downloading a PDF requires a valid authenticated Supabase bearer token and a `pdf_report` credit checked by `/api/pdf-generation-authorizations`. Authenticated users without PDF credit see the reusable Extra package purchase action inside the PDF dialog after clicking download.
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
