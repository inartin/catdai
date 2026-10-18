# Pricing

## Stage
The standalone `/pricing` page sells individual feature uses and all-feature packs through MAIB hosted checkout. Confirmed payments grant non-expiring universal credits through the existing MAIB ledger. Paddle checkout does not offer these new products.

## Routes
- Landing-page pricing is currently disabled.
- `/pricing` renders `PricingPackages` and logs a `pricing_page_opened` event in `payment_checkout_events`.
- `/payment/checkout` preserves product, RO/RU language, and local return destination and routes to MAIB or Paddle. `/payment/maib/checkout` starts hosted checkout; `/payment/maib/success` verifies status.
- `/payment/paddle/checkout` remains the original standalone Paddle inline checkout page.
- `/payment/paddle/success` is the standalone localized Paddle status page and is not linked from pricing.
- `/payment/paddle/test` is a temporary standalone test page for creating a `cadastru_lookup_single` Paddle checkout and is not linked from pricing.

## Content
- Three localized RO/RU cards sell 1 universal use for 15 MDL, 30 for 99 MDL, and 120 for 299 MDL. The middle card has a green border and filled primary button; the other buttons use green outlines/text with hover feedback.
- Usage counts are the main heading, with total price and per-use price (15 / 3.30 / 2.49 MDL). There are no feature lists, feature selection, quantity controls, or conditional upsells.
- Shared-use rules are explained once above/below the cards. Checkout retains the existing product keys (`cadastru_lookup_single`, `all_features_5`, `all_features_20`); source labels do not restrict usage.
- All six MAIB single-use product keys now cost 15 MDL. Legacy quantity URLs/API requests remain supported at 15 MDL per use; the old quantity discount tiers are removed. Existing orders retain their immutable saved prices/grants. Pack prices and totals are unchanged.
- Prices come from the server catalog; browser-supplied amounts are ignored. Confirmed payments add uses once. The shared-credit migration must be applied before releasing this page.
- Each user has one shared free credit per UTC month. See [Access and Paywall](access-paywall.md).

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
