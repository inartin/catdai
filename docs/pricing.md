# Pricing

## Stage
Implemented as a reusable UI section. Standard, Pro, and Extra pricing cards start Paddle checkout.

## Routes
- Landing page shows pricing near the bottom, before the FAQ preview.
- `/pricing` renders the same pricing component as a standalone page.
- `/payment/paddle/checkout` is the standalone Paddle overlay page used by payment flows when `PADDLE_CHECKOUT_URL` points to CatDai.
- `/payment/paddle/success` is the standalone localized Paddle status page and is not linked from pricing.
- `/payment/paddle/test` is a temporary standalone test page for creating a `cadastru_lookup_single` Paddle checkout and is not linked from pricing.

## Content
- UI is localized through `src/locales/ro.json` and `src/locales/ru.json`.
- The main pricing grid has four equal-height cards: Free, Standard, Pro, and Extra.
- Pricing cards use a fixed-height header area so feature rows start at the same vertical position even when descriptions wrap to different line counts.
- Pro keeps the single highlight badge; the old no-time-limit badges/notes are removed from the pricing cards.
- Extra includes 50 actions per feature and is presented without the old one-month rule.
- Each card enumerates usage per feature: sale estimate, rent estimate, 999 analysis, cadastru lookup, yield calculator, and PDF report.
- Free shows `0 lei*`; sale/rent rows keep the `2/lună` monthly limit and show `0 lei` under the limit badge.
- The sale/buy full-evaluation free monthly limit is enforced in `/api/estimate` for authenticated free users.
- Free one-off features show per-use prices instead of usage counts: 999 analysis 29 lei, cadastru 19 lei, yield calculator 29 lei, and PDF report 29 lei.
- Free card note explains the asterisk as per-use pricing.
- Standard, Pro, and Extra cards show a bottom note: `Acțiunile rămân disponibile până le folosești.`
- Feature count badges show the included usage or one-off price for each feature.
- Feature rows use a fixed height so the same feature lines align across pricing cards.
- Prices are read server-side from env and passed into the client component.
- If an env value is missing or invalid, the component falls back to the current default price.
- Paynet is not used whatsoever; old Paynet routes are disabled and must not be wired into pricing checkout.
- `db/paddle_payments.sql` allows one-time payment product keys for Standard, Pro, Extra, sale/rent single-evaluation access, and other single-feature purchases.
- Shared product definitions now live in `src/lib/payment-products.js`.
- Paddle price IDs are read per product key from env through `src/lib/paddle-products.js`; the backend rejects Paddle transaction responses that contain recurring items or a subscription id.
- `PADDLE_PRICE_STANDARD_PACK` may be a Paddle price id (`pri_...`) or a product id (`pro_...`); product ids are resolved to the first active one-time price before checkout.
- Limit-reached evaluation popups use the reusable `FeaturePricingAction` component and present Standard as the default package with MDL price from `NEXT_PUBLIC_PRICE_STANDARD_PACK_MDL_COST`, approximate EUR equivalent from `NEXT_PUBLIC_PRICE_STANDARD_PACK_COST`, pricing-style included-feature rows, a primary checkout action, and a secondary `/pricing` link.
- `standard_pack`, `pro_pack`, and `extra_pack` grant 2, 10, and 50 uses per paid feature.
- Single-feature products grant 1 use for sale evaluation, rent evaluation, 999 analysis, cadastru lookup, yield calculator, or PDF report.
- Profile `Acces rămas` shows free monthly sale/rent balances with a free badge plus the remaining and used purchased credits per feature.

## Env
```env
CATDAI_PRICE_STANDARD_MDL=99
CATDAI_PRICE_PRO_MDL=199
CATDAI_PRICE_EXTRA_MDL=499
NEXT_PUBLIC_PRICE_STANDARD_PACK_COST=5
NEXT_PUBLIC_PRICE_STANDARD_PACK_MDL_COST=99
PADDLE_PRICE_STANDARD_PACK=
PADDLE_PRICE_PRO_PACK=
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
