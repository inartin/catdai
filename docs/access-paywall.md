# Access And Paywall

## Stage
Preview paywall implemented. Shared checkout selects MAIB by default, with Paddle retained as backup and for existing subscription servicing. See [MAIB payments](maib-payments.md).

## Current Access Rule
- Feature-result checkouts offer a persistent guest Supabase session, without registration. Verified payment unlocks the purchased feature and refreshes reuse the same paid usage record. An optional account banner appears after purchase; Google/Telegram login transfers purchases to the new or existing account before switching result identity. Pricing-origin checkout still requires registration. Guest source credits stay with the purchased feature until transferred, so a containing evaluation cannot spend a Cadastru/PDF credit. See [guest setup](auth-config.md#provider-config).
- Anonymous users are `free`.
- Authenticated Supabase users are `free` by default; authentication and paid access are separate.
- Monthly free grants are retired. The retirement migration snapshots one unused current allowance for existing users into `user_retained_free_credits`. This one-time credit works across all six features, never expires or renews, and is absent for new users. Historical unlock events remain intact. Unpaid anonymous/guest results remain masked.
- All purchased uses form one shared balance. One new paid action consumes one credit regardless of its purchase feature. Pricing packs `credits_10`/`credits_50` grant exactly 10/50 universal credits. Existing balances and legacy product totals are preserved: Standard = 12, Pro = 60, Extra = 300, `all_features_5` = 30, `all_features_20` = 120, combo = 3, and single products = selected quantity.
- `user_feature_credits` and `maib_credit_grants` retain source buckets for payment lifecycle accounting. `user_credit_balances` sums them through `user_feature_credit_balances`. The transactional `consume_user_credit` RPC spends one legacy source row first, then the oldest MAIB grant, irrespective of feature. Usage events keep the actual feature; metadata records `credit_grant_feature_key` separately.
- MAIB credits remain additive/non-expiring. Paddle Extra resets its legacy source rows to 300 total per paid period and clears them on failed/inactive renewal, preserving MAIB credits.
- Approved full Paddle refunds and chargebacks mark the local payment as refunded/chargeback and remove remaining paid credits from that payment; already consumed credits remain visible in usage totals.
- Full MAIB refunds revoke only that order’s unused credits after bank confirmation. External partial refunds leave credits unchanged.
- Each gated feature consumes the retained free credit first, then paid credits. Already-consumed paid results remain accessible without consuming a new free use.
- Free usage is recorded in `user_feature_usage_events` with `source = 'free_monthly'`; repeated loads of the same normalized request in the same month reuse the same idempotency key.
- Profile/admin API responses add `sharedCredits` (paid remaining/granted/used) and `freeMonthlyCredit` (one-time retained allowance). Legacy `credits` rows describe source buckets; `freeMonthlyCredits` repeats the same shared allowance for compatibility and must never be summed. The profile displays one combined available total with a purchased/retained-free breakdown; pricing shows universal-use packages. Legacy API source rows remain for compatibility.
- Runtime usage persistence runs when `NODE_ENV=production` or `ENABLE_RUNTIME_PERSISTENCE=true`; local dev can use the live Supabase dataset when this flag is enabled.
- `user_entitlements` schema exists, but `resolveAccessTier()` does not read it yet.
- Paynet is not used whatsoever and must not be connected to checkout. The old Paynet API routes now return disabled responses.
- `db/paynet_payments.sql` still contains shared credit tables/helpers used by the current retained free credit and by Paddle grants.
- `db/paddle_payments.sql` prepares Paddle payment orders, Extra subscription state, webhook audit rows, one-time grants, and idempotent monthly subscription resets into the same feature-credit system.
- `POST /api/payments/paddle/create` (only with `PAYMENT_PROVIDER=paddle`) and `POST /api/paddle/webhooks` create Paddle transactions and grant or reset credits only after verified `transaction.completed` notifications.
- `POST /api/paddle/webhooks` also handles approved full Paddle refund/chargeback adjustments and revokes remaining credits so refunded orders no longer keep paid access.
- Existing MAIB feature popups still show the selected feature for 15 MDL, but the purchase grants one universal credit. Pricing-page packs grant 10 credits for 79 MDL or 50 for 249 MDL.
- Logged-out result pages and their popups show the same matching single-use offer even when the preview has no purchase offer; checkout preserves that product through login.
- In the desktop result sidebar, the unlock card appears above the PDF/share/compare actions; the unlock button is green and the PDF action is black.
- Shared purchase cards use the same green border and subtle green ring as the recommended pricing-page card.
- Below the desktop sidebar breakpoint, result-page purchase cards become a compact fixed bottom drawer showing the price and unlock action. Tapping the handle, title, or chevron expands the included feature details; tapping again or pressing Escape collapses it. The drawer respects the bottom safe area and reserves scroll space. Comparison layouts and purchase/PDF popups retain inline cards.
- Only the fixed drawer is portaled to `document.body`; its spacing element stays in the pricing component's page layout, preventing empty space above the navbar.
- Locked Cadastru results reuse `FeaturePricingAction` with `mobileDock` below the same breakpoint, offering the Cadastru purchase through the shared checkout. Full-access results omit the drawer.
- Limit-reached blurred-value popups show the package price in MDL only and offer a single-feature use through MAIB. Paddle retains its Extra offer. The packages link remains in the offer and also appears beneath the checkout card.
- Paddle checkout and status pages use the CatDai-branded RO/RU payment shell and preserve the selected language through the checkout/status redirect.
- Sale and rent evaluation single-access checkouts charge 15 MDL each through MAIB. When Paddle is selected, they use the same Paddle price ID from `PADDLE_PRICE_LISTING_ANALYSIS_SINGLE`, display the euro amount from `PADDLE_PRICE_LISTING_ANALYSIS_SINGLE_COST` plus `≈ MDL` at 20 MDL per EUR, and grant one shared credit (with a sale/rent source label) after Paddle confirms payment.
- Purchased credits do not affect the retained free balance. Package resets preserve it and historical free usage events.
- When a paid sale/rent credit is used, `user_feature_usage_events.metadata.evaluation_snapshot` stores the immutable full result for profile history replay by `snapshot_id`.
- Repeated loads of the same paid feature result reuse stable paid idempotency keys so refreshes do not consume another credit.
- Standalone Cadastru reads consume credits in development too when runtime persistence is enabled; development suppresses analytics/counting, not a purchased result's credit use. Paid Cadastru request/result metadata supplies account history even when analytics are disabled.

## Paywall Popups
- Standalone Cadastru result unlocks skip the purchase popup and navigate directly to checkout. Embedded cadastral cards and the other feature pages keep their purchase popups. Direct and popup actions reuse `featureCheckoutUrl` so product, language and return criteria follow the same checkout/login flow.
- `FeaturePricingAction variant="paywall"` reuses the Cadastru offer layout for sale/rent evaluations, listing analysis, yield calculation, cadastral lookup and PDF reports. `FEATURE_PURCHASE_CONTENT` supplies the product-specific RO/RU title, current-result price summary and benefit keys; `FeaturePurchaseBenefits` renders the shared checklist.
- MAIB single-feature checkout reuses the same benefit catalog and localized feature titles, with the shared unlock count, green lock styling and safe back-to-result link. Pricing-origin purchases keep their shared-credit presentation.
- `AuthRequiredModal variant="paywall"` supplies the wider, scrollable Cadastru dialog and omits the extra generic limit copy. The primary action names the price. Offers, popups and mobile drawers retain packages navigation; paywall popups use a small text link. A small “Vezi toate pachetele” link also sits beneath the main checkout card for both MAIB and Paddle. Plain login dialogs retain their existing presentation.
- Benefits describe paid result data. Sale/rent copy does not advertise the free market trend; listing history and potential duplicates are conditional on availability. Calculator copy covers income, yield/payback and selected tax calculations. PDF copy describes the actual report sections and optional content, without promising charts or listing cards absent from the PDF.
- When valuation results also contain a locked cadastral card, that card passes its own offer explicitly; opening the valuation paywall cannot select the cadastral product. PDF export retains its section picker and generation authorization alongside the common purchase panel.

## Result Payload
Sale/buy estimate results return a preview for anonymous users:
- the main market estimate is removed from `/api/estimate` before the JSON response and rendered as a blurred fake value
- locked values are removed from `/api/estimate` before the JSON response
- the UI shows blurred placeholder values with a lock icon and the shared tooltip
- clicking a blurred value opens the shared package popup; anonymous checkout continues on `/payment/checkout` with product/language/return URL preserved through guest continuation or login
- blurred values invite users to unlock the evaluation, without promising access just for logging in

Locked preview sections include fast/target prices, price per m2, range numbers, market stats, district comparison values, seller breakdown, and listing details.
The sale/buy evaluation preview shows real, unblurred sector/city trend data when available, including its values, chart, and interactive points, regardless of login or remaining credits. Other detailed-value sections remain locked.

## Full Payload
Authenticated users receive the full sale/buy estimate response while they have a retained free credit or a paid credit remaining. Once both are exhausted, `/api/estimate` returns the locked detailed-value preview; anonymous previews additionally remove the headline estimate. Users with previously granted but exhausted shared paid credits receive `access_limit.reason = paid_evaluation_limit_reached`; other users receive `free_monthly_limit_reached`.
Rent evaluation uses the same limit and purchase flow through `/api/estimate-rent` with shared credits. Anonymous rent previews remove the main monthly estimate from the JSON response and render a blurred fake value.
Cadastral lookup uses the retained free credit first, then shared paid credits. Once both are exhausted, the popup offers the 15 MDL single result plus the pricing page. The standalone `/cadastru` page accepts anonymous searches and returns a server-masked preview: direct cadastral-number searches keep the submitted number and city/village visible while replacing the rest of the address with server-generated fake text that is blurred and opens the paywall. Address searches keep their already-entered address and replace the discovered cadastral number with a fake blurred number. Floor and classifier remain visible when available; construction year is masked server-side and blurred with the other locked fields. Number-based market requests return sector trends until the lookup has been unlocked, avoiding address disclosure through listings. Blurred values start checkout directly on standalone Cadastru results; embedded cadastral cards on other pages retain the purchase popup for both signed-out users and authenticated users without credit. Guest continuation or login happens during checkout, preserving the selected product and return URL. The remaining official cadastru fields are server-masked with `|` characters and blurred in the UI.
Locked Cadastru maps are server-rendered blurred WebP previews, including the land/building outlines. Original map coordinates, geometry, bounds and map links are removed from the main preview and secondary responses before delivery, including cache hits. The image endpoint always returns blurred pixels; unlocking restores the interactive map. Explicitly published shared reports retain full map access.
999 listing analysis uses the same shared free/paid credit pool. Missing login or credit returns the `/anunt` result shell with sale values, listing price-history, and detailed market data locked/blurred instead of a hard error; duplicate candidates render as fake blurred cards only when the duplicate lookup found at least one real high/medium duplicate.
Rent-yield calculator results use the same shared free/paid credit pool; missing credit returns the calculator result shell with rent-yield, tax, market-stat, district, and listing details locked/blurred instead of a hard error.
PDF export dialogs show the shared 15 MDL single-PDF offer, report-specific benefits and priced purchase action to everyone above the section picker. The dialog scrolls on shorter screens. Downloading requires a valid authenticated Supabase bearer token and a retained free or paid credit checked by `/api/pdf-generation-authorizations`. A new PDF uses the retained free credit if available, otherwise one shared paid credit, while downloading the same authorized report again reuses its access. Generation requires an explicit successful authorization response.
Shared paywall and PDF dialogs render above reusable tooltip portals so locked-state tooltips do not float on top of open popups.

Paid PDF authorizations can fetch the full matching sale/rent report data without another evaluation charge. The API verifies the PDF usage owner, exact normalized valuation criteria and estimate type before returning full data. Guest PDF usage keys exclude the changing analytics log ID; after account transfer the same key remains valid. Checkout restores the PDF dialog on the originating result page.

## Share Exception
If a shared link was created by a paid user, `/api/estimate` allows full result access through `share_slug`.

Cadastru sharing is separate: only an already-unlocked result can be published through `/api/cadastru/share`, using either the retained free credit or a paid credit. The generated `share_slug` opens a saved official report for all viewers without consuming credits. Ordinary Cadastru result URLs continue to use the viewer's own access checks. See [sharing](favorites-sharing.md#cadastru-reports).

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

## Monthly free-credit retirement
Pause credit-consuming requests, apply `supabase/migrations/20261020081326_retire_monthly_free_credits.sql`, deploy the matching app, then resume traffic. The pause ensures an in-flight old RPC cannot grant another free use during the snapshot. Do not rerun historical SQL over this migration. The snapshot is taken once even if the migration is reapplied. It never changes purchased balances.

Legacy RPC names, API fields (`freeMonthlyCredit` / `freeMonthlyCredits`), event source `free_monthly`, and limit reason remain for compatibility; none grant monthly access. APIs read the retained balance, not the absence of monthly usage events. Profile only shows the retained-free row when a credit remains. Admin package changes do not restore it or delete historical unlocks. Runtime persistence disabled does not grant free access.

Verify with `pnpm exec node scripts/test-universal-credits.mjs`.
