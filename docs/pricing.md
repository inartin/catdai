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
- Three localized RO/RU cards sell 1 universal use for 49 MDL, 10 for 245 MDL, and 50 for 490 MDL. The 10-use card is recommended, with a green border and filled primary button; the other buttons use green outlines/text with hover feedback.
- Cards use the localized labels `Ocazional`, `Recomandat`, and `Frecvent` (RO). Each heading shows the use count and unit together in larger bold text on one line. A divider precedes the more prominent total price and muted `Total de plată` caption, followed by the per-use price (49 / 24.50 / 9.80 MDL). There are no feature lists, feature selection, quantity controls, or conditional upsells.
- Below the per-use price, packs show green `Economisești 50%` / `Economisești 80%` copy (RO), rounded against the current single-use catalog price; the single-use card has no standard-price caption. All card copy is localized in RO/RU. The cards and checkout savings prompt share `maibCreditSavingsPercent` so percentages follow catalog changes.
- Shared-use rules are explained once above/below the cards. Checkout uses `cadastru_lookup_single`, `credits_10`, and `credits_50`. The new packs fund one Cadastru source bucket with exactly 10/50 universal credits; source labels do not restrict registered accounts. Legacy `all_features_5`/`all_features_20` products retain their original prices, titles and 30/120-credit grants.
- Pricing links include `checkout_source=pricing`: the 49 MDL checkout uses the generic `1 utilizare` label, while feature-popup checkout retains the selected feature name. The 245/490 MDL checkout titles match the pricing card's 10/50 universal uses. The create API snapshots the same localized title for new orders and MAIB; existing orders keep their saved titles on retries. Checkout copy explains that credits work with any function.
- When the checkout title already shows the use count, the subtitle shows only `Plată unică` (localized), without repeating that count.
- All six MAIB single-use product keys cost 49 MDL. Legacy quantity URLs/API requests remain supported at 49 MDL per use; the old quantity discount tiers are removed. Existing orders retain their immutable saved prices/grants.
- Prices come from the server catalog; browser-supplied amounts are ignored. Confirmed payments add uses once. The shared-credit migration must be applied before releasing this page.
- Pricing-origin purchases still require a registered account, including browsers with an existing guest session. Both checkout UIs and provider create APIs enforce `checkout_source=pricing`. Guest continuation is offered only for checkout carrying a safe feature-result return path.
- There are no new or recurring free credits. Existing unused allowances are retained once. See [Access and Paywall](access-paywall.md).

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
