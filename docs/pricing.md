# Pricing

## Stage
Implemented as a reusable UI section. Payments are not implemented.

## Routes
- Landing page shows pricing near the bottom, before the FAQ preview.
- `/pricing` renders the same pricing component as a standalone page.

## Content
- UI is localized through `src/locales/ro.json` and `src/locales/ru.json`.
- The main pricing grid has four equal-height cards: Free, Standard, Pro, and Extra.
- Pricing cards use a fixed-height header area so feature rows start at the same vertical position even when descriptions wrap to different line counts.
- Standard and Pro are fixed action packages with no time limit.
- Extra includes 50 actions per feature.
- Each card enumerates usage per feature: sale estimate, rent estimate, 999 analysis, cadastru lookup, yield calculator, and PDF report.
- Free shows `0 lei*`; sale/rent rows keep the `2/lună` monthly limit and show `0 lei` under the limit badge.
- Free one-off features show per-use prices instead of usage counts: 999 analysis 29 lei, cadastru 19 lei, yield calculator 29 lei, and PDF report 29 lei.
- Free card note explains the asterisk as per-use pricing.
- Feature count badges show the included usage or one-off price for each feature.
- Feature rows use a fixed height so the same feature lines align across pricing cards.
- Prices are read server-side from env and passed into the client component.
- If an env value is missing or invalid, the component falls back to the current default price.

## Env
```env
CATDAI_PRICE_STANDARD_MDL=99
CATDAI_PRICE_PRO_MDL=199
CATDAI_PRICE_EXTRA_MDL=499
```

## Related Files
- `src/components/Pricing.js`
- `src/lib/pricing-config.js`
- `src/app/pricing/page.js`
- `src/app/pricing/layout.js`
- `src/components/HomeContent.js`
- `src/app/page.js`
- `src/locales/ro.json`
- `src/locales/ru.json`
