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
- Three localized RO/RU cards use aligned feature rows, counts and checkout actions, without one-time/non-expiring banners. The 59 MDL combo is no longer displayed.
- The individual card selects one feature and offers a compact `− quantity +` control (1–100 uses) in the top title row, with a localized use label next to the selector (hidden in Russian above 1 use) and the discount on the right. Individual prices are 25/65/89/169/269 MDL for 1/3/5/10/20 uses. Every intermediate quantity uses linear interpolation between its adjacent price tiers, calculated in integer minor units. Above 20 uses, the total continues at 13.45 MDL per use (21 = 282.45 MDL, 25 = 336.25 MDL), retaining the 20-use discount rate. Savings compare the total with `25 × quantity` and show both the rounded percentage and amount, with only the percentage negative and no savings label, e.g. `−32% (81 lei)` for 10 uses. The price, savings and feature counts update together. The PDF option explains that it exports an existing estimate and does not include the estimate itself.
- At 4 or 5 individual uses, the card recommends the 99 MDL pack directly below the quantity control because it includes 5 uses of each of all six features, with a direct action to choose that pack. A summary above the individual purchase button shows the selected feature, quantity and discounted total (e.g. `1 căutare cadastrală · 25 lei`).
- At 20 individual uses, the same area recommends the 299 MDL pack with 20 uses of each of all six features and a direct checkout action for that pack.
- 99 MDL (`all_features_5`) grants 5 uses of each of the six features; 299 MDL (`all_features_20`) grants 20 each. Credits are feature-specific, non-expiring, and additive.
- Prices and grants come from the MAIB catalog. Confirmed payments add credits to the buyer account, visible in profile; duplicate callbacks do not grant twice. New all-feature pack keys are MAIB-only. Historical orders retain their saved prices and grants.
- Individual checkout carries the selected quantity through login and the API; the server validates it and calculates the discounted amount and grants. Request keys distinguish quantities. Existing order JSON grants snapshot the quantity, and status/receipt displays derive it from that snapshot; no database migration is required. MAIB receives one bundle item at the total price to avoid fractional per-unit rounding.
- MAIB feature lock popups offer one use of the relevant feature for 25 MDL and link here for packs. Paddle retains its existing offers.
- Each feature, including full Cadastru details, has one free use per UTC month regardless of purchased credits.
- The pricing page ends after the offers and payment-delivery note; it has no custom-package request section.

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
