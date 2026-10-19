# Access And Paywall

## Stage
Preview paywall implemented. Shared checkout selects MAIB by default, with Paddle retained as backup and for existing subscription servicing. See [MAIB payments](maib-payments.md).

## Current Access Rule
- Anonymous users are `free`.
- Authenticated Supabase users are `free` by default; authentication and paid access are separate.
- Each authenticated user receives one shared free credit per UTC month, usable on any of the six features. Existing free events across all features count toward the month's limit; historical unlocked requests still replay. Anonymous Cadastru results remain masked.
- All purchased uses form one shared balance. One new paid action consumes one credit regardless of its purchase feature. Existing balances and product totals are preserved: Standard = 12, Pro = 60, Extra = 300, `all_features_5` = 30, `all_features_20` = 120, combo = 3, and single products = selected quantity.
- `user_feature_credits` and `maib_credit_grants` retain source buckets for payment lifecycle accounting. `user_credit_balances` sums them through `user_feature_credit_balances`. The transactional `consume_user_credit` RPC spends one legacy source row first, then the oldest MAIB grant, irrespective of feature. Usage events keep the actual feature; metadata records `credit_grant_feature_key` separately.
- MAIB credits remain additive/non-expiring. Paddle Extra resets its legacy source rows to 300 total per paid period and clears them on failed/inactive renewal, preserving MAIB credits.
- Approved full Paddle refunds and chargebacks mark the local payment as refunded/chargeback and remove remaining paid credits from that payment; already consumed credits remain visible in usage totals.
- Full MAIB refunds revoke only that order’s unused credits after bank confirmation. External partial refunds leave credits unchanged.
- Each gated feature consumes the shared free monthly allowance first, then paid credits. Already-consumed paid results remain accessible without consuming a new free use.
- Free usage is recorded in `user_feature_usage_events` with `source = 'free_monthly'`; repeated loads of the same normalized request in the same month reuse the same idempotency key.
- Profile/admin API responses add `sharedCredits` (paid remaining/granted/used) and `freeMonthlyCredit` (one shared monthly allowance). Legacy `credits` rows describe source buckets; `freeMonthlyCredits` repeats the same shared allowance for compatibility and must never be summed. The profile displays one combined available total with a purchased/monthly-free breakdown; pricing shows universal-use packages. Legacy API source rows remain for compatibility.
- Runtime usage persistence runs when `NODE_ENV=production` or `ENABLE_RUNTIME_PERSISTENCE=true`; local dev can use the live Supabase dataset when this flag is enabled.
- `user_entitlements` schema exists, but `resolveAccessTier()` does not read it yet.
- Paynet is not used whatsoever and must not be connected to checkout. The old Paynet API routes now return disabled responses.
- `db/paynet_payments.sql` still contains shared credit tables/helpers used by the current free monthly usage limit and by Paddle grants.
- `db/paddle_payments.sql` prepares Paddle payment orders, Extra subscription state, webhook audit rows, one-time grants, and idempotent monthly subscription resets into the same feature-credit system.
- `POST /api/payments/paddle/create` (only with `PAYMENT_PROVIDER=paddle`) and `POST /api/paddle/webhooks` create Paddle transactions and grant or reset credits only after verified `transaction.completed` notifications.
- `POST /api/paddle/webhooks` also handles approved full Paddle refund/chargeback adjustments and revokes remaining credits so refunded orders no longer keep paid access.
- Existing MAIB feature popups still show the selected feature for 15 MDL, but the purchase grants one universal credit. Pricing-page packs grant 30 credits for 99 MDL or 120 for 299 MDL.
- Logged-out result pages and their popups show the same matching single-use offer even when the preview has no purchase offer; checkout preserves that product through login.
- In the desktop result sidebar, the unlock card appears above the PDF/share/compare actions; the unlock button is green and the PDF action is black.
- Limit-reached blurred-value popups show the package price in MDL only and offer a single-feature use through MAIB, with a secondary link to `/pricing`. Paddle retains its Extra offer.
- Paddle checkout and status pages use the CatDai-branded RO/RU payment shell and preserve the selected language through the checkout/status redirect.
- Sale and rent evaluation single-access checkouts charge 15 MDL each through MAIB. When Paddle is selected, they use the same Paddle price ID from `PADDLE_PRICE_LISTING_ANALYSIS_SINGLE`, display the euro amount from `PADDLE_PRICE_LISTING_ANALYSIS_SINGLE_COST` plus `≈ MDL` at 20 MDL per EUR, and grant one shared credit (with a sale/rent source label) after Paddle confirms payment.
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
Authenticated users receive the full sale/buy estimate response while they have a monthly free use or a paid credit remaining. Once both are exhausted, `/api/estimate` returns the locked detailed-value preview; anonymous previews additionally remove the headline estimate. Users with previously granted but exhausted shared paid credits receive `access_limit.reason = paid_evaluation_limit_reached`; other users receive `free_monthly_limit_reached`.
Rent evaluation uses the same limit and purchase flow through `/api/estimate-rent` with shared credits. Anonymous rent previews remove the main monthly estimate from the JSON response and render a blurred fake value.
Cadastral lookup uses the shared monthly free credit first, then shared paid credits. Once both are exhausted, the popup offers the 15 MDL single result plus the pricing page. The standalone `/cadastru` page accepts anonymous searches and returns a server-masked preview: direct cadastral-number searches keep the submitted number visible, address searches replace the discovered cadastral number with a fake blurred number, and address, floor, classifier, and construction year remain visible when available. Anonymous blurred values open the login popup; authenticated users without a remaining allowance or credit see the package purchase popup. The remaining official cadastru fields are server-masked with `|` characters and blurred in the UI.
999 listing analysis uses the same shared free/paid credit pool. Missing login or credit returns the `/anunt` result shell with sale values, listing price-history, and detailed market data locked/blurred instead of a hard error; duplicate candidates render as fake blurred cards only when the duplicate lookup found at least one real high/medium duplicate.
Rent-yield calculator results use the same shared free/paid credit pool; missing credit returns the calculator result shell with rent-yield, tax, market-stat, district, and listing details locked/blurred instead of a hard error.
PDF export dialogs immediately show the 15 MDL single-PDF offer and purchase action to everyone, above the section picker, with the existing PDF copy pending the UI phase. The dialog scrolls on shorter screens. Downloading requires a valid authenticated Supabase bearer token and a shared free or paid credit checked by `/api/pdf-generation-authorizations`. A new PDF uses the shared monthly free credit if available, otherwise one shared paid credit, while downloading the same authorized report again reuses its access. Generation requires an explicit successful authorization response.
Shared paywall and PDF dialogs render above reusable tooltip portals so locked-state tooltips do not float on top of open popups.

## Share Exception
If a shared link was created by a paid user, `/api/estimate` allows full result access through `share_slug`.

Cadastru sharing is separate: only an already-unlocked result can be published through `/api/cadastru/share`, using either the monthly free use or a paid credit. The generated `share_slug` opens a saved official report for all viewers without consuming credits. Ordinary Cadastru result URLs continue to use the viewer's own access checks. See [sharing](favorites-sharing.md#cadastru-reports).

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

## Shared-credit rollout
Apply `supabase/migrations/20261017141519_universal_paid_credits.sql` after the existing MAIB/Paddle schema, then deploy the backend. No historical balances or order snapshots are rewritten. Old consumption RPC names delegate to the shared functions; new app code fails closed if the migration is missing (no non-atomic free-use fallback). Do not rerun old payment SQL over this migration.

Run `pnpm exec node scripts/test-universal-credits.mjs` for isolated database regression checks. Deploy the shared-credit migration and the corresponding profile/pricing UI together.
