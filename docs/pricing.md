# Pricing

## Stage
Implemented as a reusable UI section. Standard, Pro, and Extra pricing cards start Paddle checkout.

## Routes
- Landing page shows pricing near the bottom, before the FAQ preview.
- `/pricing` renders the same pricing component as a standalone page and logs a `pricing_page_opened` event in `payment_checkout_events` for admin statistics.
- `/payment/paddle/checkout` is the standalone Paddle inline checkout page used by payment flows when `PADDLE_CHECKOUT_URL` points to CatDai.
- `/payment/paddle/success` is the standalone localized Paddle status page and is not linked from pricing.
- `/payment/paddle/test` is a temporary standalone test page for creating a `cadastru_lookup_single` Paddle checkout and is not linked from pricing.

## Content
- UI is localized through `src/locales/ro.json` and `src/locales/ru.json`.
- The `/pricing` grid currently shows Free and Extra; Standard and Pro remain configured but are hidden on this page.
- Logged-in users see their current package in a localized status pill above the grid; a visible active card is also highlighted, while hidden Standard or Pro packages remain named in the status pill.
- `/api/profile/package` resolves the current package from an active Extra subscription first, then a non-free admin package, then the latest paid package order; stale free metadata cannot mask a paid tier.
- A full-width custom-request card appears under the visible pricing cards and opens a modal for users who need a different mix of actions.
- Pricing cards reserve equal price, EUR-equivalent, and description height so feature rows align vertically across desktop cards.
- On mobile, pricing card details are collapsed by default. The price, credit summary, and paid-card checkout button remain visible; feature rows and notes expand from the details toggle.
- If an unauthenticated user clicks a package checkout button, pricing opens `/payment/paddle/checkout` with the selected product and shows login methods in the checkout panel. After login, the same page creates the Paddle transaction and loads inline checkout.
- Pro keeps the highlight badge; Extra shows a monthly-payment badge.
- Extra includes 50 actions per feature per month; without a successful renewal, remaining Extra credits are cleared.
- Each card enumerates usage per feature: sale estimate, rent estimate, 999 analysis, cadastru lookup, yield calculator, and PDF report.
- Free shows `0 lei` and 5 monthly uses for every feature, using the same feature-count layout as paid tiers.
- Free monthly limits are enforced for authenticated users across sale/rent estimates, 999 analysis, cadastru, yield calculator, and PDF reports.
- Free card note explains that the included actions renew monthly; no per-feature prices appear in the card.
- Standard and Pro cards show the no-time-limit note. Extra shows that credits renew monthly and do not roll over.
- Feature count badges show the included usage for each feature.
- Feature rows use a fixed height so the same feature lines align across pricing cards.
- Prices are read server-side from env and passed into the client component.
- Custom requests collect a message, email, and optional phone number, then submit to the existing feedback endpoint/table with a pricing-request prefix.
- If an env value is missing or invalid, the component falls back to the current default price.
- Paynet is not used whatsoever; old Paynet routes are disabled and must not be wired into pricing checkout.
- `db/paddle_payments.sql` allows one-time payment product keys for Standard, Pro, sale/rent single-evaluation access, and other single-feature purchases, plus the Extra monthly subscription.
- Shared product definitions now live in `src/lib/payment-products.js`.
- Paddle price IDs are read per product key from env through `src/lib/paddle-products.js`; Standard, Pro, and single-feature products require one-time prices, while Extra requires a monthly subscription price.
- `PADDLE_PRICE_STANDARD_PACK` may be a Paddle price id (`pri_...`) or a product id (`pro_...`); product ids are resolved to the first active one-time price before checkout.
- Locked feature popups use the reusable `FeaturePricingAction` component and present Extra as the default monthly package with 50 uses per feature, pricing-style included-feature rows, a primary checkout action, and a secondary `/pricing` link.
- `standard_pack` and `pro_pack` grant 2 and 10 non-expiring uses per paid feature. `extra_pack` resets each paid monthly subscription period to 50 uses per paid feature.
- Single-feature products grant 1 use for sale evaluation, rent evaluation, 999 analysis, cadastru lookup, yield calculator, or PDF report.
- Profile `Acces rămas` shows all six free monthly feature balances with a free badge plus remaining and used purchased credits.

## Env
```env
CATDAI_PRICE_STANDARD_MDL=99
CATDAI_PRICE_PRO_MDL=199
CATDAI_PRICE_EXTRA_MDL=499
NEXT_PUBLIC_PRICE_STANDARD_PACK_COST=5
NEXT_PUBLIC_PRICE_STANDARD_PACK_MDL_COST=99
PADDLE_PRICE_STANDARD_PACK=
PADDLE_PRICE_PRO_PACK=
# PADDLE_PRICE_EXTRA_PACK must be a monthly subscription price.
PADDLE_PRICE_EXTRA_PACK=
PADDLE_PRICE_LISTING_ANALYSIS_SINGLE=
PADDLE_PRICE_LISTING_ANALYSIS_SINGLE_COST=
PADDLE_PRICE_CADASTRU_LOOKUP_SINGLE=
PADDLE_PRICE_YIELD_CALCULATOR_SINGLE=
PADDLE_PRICE_PDF_REPORT_SINGLE=
```

## Related Files
- `src/components/Pricing.js`
- `src/components/FeaturePricingAction.js`
- `src/lib/pricing-config.js`
- `src/lib/free-monthly-feature-usage.js`
- `src/app/pricing/page.js`
- `src/app/pricing/layout.js`
- `src/components/HomeContent.js`
- `src/app/page.js`
- `src/locales/ro.json`
- `src/locales/ru.json`
- `db/paynet_payments.sql`
- `db/paddle_payments.sql`
- `src/lib/payment-products.js`
- `src/lib/paddle-products.js`
- `src/app/api/payments/paddle/create/route.js`
- `src/app/payment/paddle/checkout/page.js`
- `src/app/payment/paddle/success/page.js`
- `src/app/payment/paddle/test/page.js`
