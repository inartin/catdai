# Pricing

## Stage
The standalone `/pricing` page sells individual feature uses and all-feature packs through MAIB hosted checkout. Confirmed payments grant non-expiring feature credits through the existing MAIB ledger. Paddle checkout does not offer these new products.

## Routes
- Landing-page pricing is currently disabled.
- `/pricing` renders `PricingPackages` and logs a `pricing_page_opened` event in `payment_checkout_events`.
- `/payment/checkout` preserves product, RO/RU language, and local return destination and routes to MAIB or Paddle. `/payment/maib/checkout` starts hosted checkout; `/payment/maib/success` verifies status.
- `/payment/paddle/checkout` remains the original standalone Paddle inline checkout page.
- `/payment/paddle/success` is the standalone localized Paddle status page and is not linked from pricing.
- `/payment/paddle/test` is a temporary standalone test page for creating a `cadastru_lookup_single` Paddle checkout and is not linked from pricing.

## Content
- Three localized RO/RU cards use the earlier pricing style: aligned feature rows, counts, one-time/non-expiring notes, and checkout actions. The 59 MDL combo is no longer displayed.
- 25 MDL buys one use of one selected feature. Radio options make the choice explicit before MAIB checkout. The PDF option explains that it exports an existing estimate and does not include the estimate itself.
- 99 MDL (`all_features_5`) grants 5 uses of each of the six features; 299 MDL (`all_features_20`) grants 20 each. Credits are feature-specific, non-expiring, and additive.
- Prices and grants come from the MAIB catalog. Confirmed payments add credits to the buyer account, visible in profile; duplicate callbacks do not grant twice. New all-feature pack keys are MAIB-only. Historical orders retain their saved prices and grants.
- MAIB feature lock popups offer one use of the relevant feature for 25 MDL and link here for packs. Paddle retains its existing offers.
- Cadastru has no free monthly full-detail uses; other features retain five per UTC month.
- The existing custom-package request card and feedback modal remain below the offers.

## Env
```env
NEXT_PUBLIC_PRICE_STANDARD_PACK_MDL_COST=99
NEXT_PUBLIC_PRICE_PRO_PACK_MDL_COST=199
NEXT_PUBLIC_PRICE_EXTRA_PACK_MDL_COST=499
NEXT_PUBLIC_PRICE_STANDARD_PACK_COST=5
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
- `src/components/PricingPackages.js`
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
