# Valuation

## Stage
Implemented and active for apartments.

## User Flow
- `/estimeaza` shows two tabs for `Vânzare / cumpărare` and `Chirie lunară`; rent submissions use `/evaluare?type=rent`.
- `/estimeaza` includes a bottom text link to `/verifica-anunt?from=estimeaza` for users who already have a 999.md listing URL.
- `/estimeaza?type=rent` opens the rent tab even before any city or criteria are present.
- The sale/buy tab uses `Estimare apartament` / `Оценка квартиры`; the rent tab uses `Estimare de piață` / `Рыночная оценка`, lets users select multiple sectors/zones and optionally multiple construction types, and hides the cadastral shortcut, total floors, first/last-floor filters, balconies, and budget fields.
- `/estimeaza` collects city, district, rooms, building type, renovation, optional area, optional floor, optional first-floor/last-floor filters, bathrooms, balconies, cadastral number.
- `/estimeaza` accepts the city, district, area, floor, and total-floor query presets handed off by qualifying Chișinău or Durlești apartment results from `/cadastru/rezultat`; all other criteria remain empty for the user to complete.
- `/evaluare` reads URL params and calls `/api/estimate`; anonymous sale/buy users can submit the form and see only a preview result.
- `/evaluare` without valuation query params shows the reusable cadastru search form from `/cadastru` instead of redirecting to the homepage.
- Result-page URL cleanup preserves `type=rent`, so refreshing a rent result keeps the rent API path instead of falling back to sale valuation.
- Anonymous sale/buy and rent evaluation results hide the headline estimate behind blurred fake values, while detailed values are blurred and open the shared auth popup. Sale/buy previews also keep the sector/city trend card visible with fake blurred trend data.
- Authenticated users with sale/rent paid credits use those credits before the free monthly allowance, so package-paid evaluations are stored as paid snapshots. Users who have ever received paid credits for that feature do not get extra free monthly evaluations after credits run out. Authenticated users without matching paid credits receive 5 free full evaluations per UTC month for sale and 5 for rent; after that, the result falls back to the blurred preview and shows the monthly-limit message.
- When the monthly limit is hit, the popup and the result action column both include the same reusable feature-price block with the sale/rent single-access price in EUR and the rounded MDL equivalent, plus a checkout button.
- The sale and rent purchase flow both use `PADDLE_PRICE_LISTING_ANALYSIS_SINGLE` as the Paddle price ID, show `PADDLE_PRICE_LISTING_ANALYSIS_SINGLE_COST` in the UI, and grant one paid evaluation credit after Paddle confirms payment.
- Paid sale/rent credits use stable non-monthly idempotency keys and are checked before the free sale/rent allowance, while free usage keeps the existing monthly idempotency.
- When a paid sale/rent evaluation credit is consumed, the app stores the full result payload in the paid usage event metadata so profile history can reopen that timestamped result without recalculating current market data.
- Reopened paid snapshots are read-only result pages; change-criteria and compare actions are hidden because they would start a new current-market calculation.
- Shared `/evaluare` results with `share_slug` are read-only and use the stored `shared_links.params`; viewer-edited URL criteria and compare params do not change the result.
- Full sale/buy results support edit, compare, share, favorite, PDF export, relevant listings, and alert setup.
- Regular `/evaluare` result pages include a bottom refresh-style `Estimare nouă` / `Новая оценка` action that starts a fresh `/estimeaza` flow without carrying the current criteria.
- Result sidebar actions are ordered with PDF export first as the visual primary action, followed by share, compare, and criteria edit as neutral secondary actions.
- Sale and rent result pages share the same criteria-edit action button, including the edit icon and secondary button styling.
- 999.md listing-link analysis opens `/anunt` in listing-comparison mode; the result treats the listing asking price as a second primary value beside the market estimate, keeps fast-sale/target grouped under the market side and asked-price-per-m2 under the listing side, and shows the listing verdict plus the original listing link in the same result card. Locked previews blur the market level and verdict sentence numbers while keeping the asking price visible.
- 999.md listing-link analysis requires a `listing_analysis` paid credit and reuses the same listing idempotency key through parsing and result rendering, so it does not consume `sale_estimate` credits. Without login or a remaining credit, `/anunt` returns a blurred listing-analysis preview instead of a hard error.
- For `/anunt`, listing price history from `listing_price_history` replaces the sector trend when real price changes exist; locked previews show that section blurred.
- For `/anunt`, duplicate candidates from `/api/listing-duplicates` are shown with a combined high + medium count in the header and a text-only duplicate-candidate section above relevant listings; exact address conflicts exclude candidates when parsed addresses are available. The duplicate section renders only when high/medium candidates exist; locked previews show fake blurred cards for those candidates.
- For `/anunt`, the bottom action embeds the `Verifică un anunț 999.md` link analyzer form so another listing check can start directly on the result page.
- The sale valuation form's cadastral shortcut is login-gated and uses the shared auth popup before calling `/api/cadastral`.
- If the cadastral shortcut returns a no-credit preview, the form only applies visible safe fields like city, district, and floor; masked `|` fields are not copied into valuation criteria. The final evaluation result still shows the cadastral card as a blurred paid preview.
- The compact cadastral shortcut UI is shared through `CadastralQuickSearchCard`; in the valuation form it sits inside the `Locație` section below the section title and above the city/sector fields, matching the calculator layout, and is presented as an optional shortcut collapsed by default with title, subtitle, badge, search icon, and chevron; expanding it shows the input and search button.
- The cadastral shortcut must stay mounted while typing or pasting; the location card uses a stable `div` wrapper instead of an inline component so parent form state updates do not reset the expanded shortcut.
- The valuation form uses separate numbered cards for `Locație` and property details, matching the calculator page section style.
- PDF export opens a section picker for everyone, but PDF download is login-gated and requires a valid Supabase session plus a `pdf_report` credit immediately before generation. If login starts from the PDF dialog, the login prompt overlays the PDF dialog; after OAuth redirect, a localStorage flag restores the PDF dialog. Authenticated users without PDF credit stay in the dialog and see the reusable Extra package purchase action instead of the generic PDF error.
- PDF reports always include the estimated market price, segment median price per m2, property summary, disclaimer footer, and `catdai.md` source label; optional sections include seller-type comparison and official cadastral data when available.
- PDF reports intentionally exclude market statistics, relevant listing cards/links, and sector/city trend charts.

## Estimate Logic
- API validates input with `src/lib/validation.js`.
- First-floor and last-floor options are optional alternatives to a specific floor; selecting either clears the exact floor field and filters comparables by floor edge.
- Supabase RPC `estimate_price` does comparable filtering with progressive widening.
- Supabase RPC `estimate_rent` mirrors the same comparable filtering and progressive widening against `listing_rent`, but selected rent districts remain mandatory and are not relaxed during fallback. Rent price-per-m2 calculations use stored `price_per_m2` when present, otherwise `price_amount / area_m2`; selected rent renovation also includes listings with missing renovation because that field is often absent in rental ads.
- Sale and rent valuation inputs are limited to `Chișinău` and `Durlești`. Chișinău medians exclude rows marked as district `Durlești`, while Durlești medians include rows stored either with city `Durlești` or district `Durlești`.
- Rent district comparison is calculated per district across the city with the same non-district segment filters and uses median monthly rent, not median price per m2. Multiple selected sectors are highlighted in the chart while every row remains that district's own median. Rent comparison rows are clickable and open `/evaluare?type=rent` with the clicked sector plus the same city, room, construction-type, and renovation filters that produced the median.
- Rent result analysis sections use a flex column on mobile and switch to the two-column grid only on desktop, so cards and sector bars stay constrained to the viewport.
- `POST /api/estimate-rent` validates the regular property fields plus `districts` / `regions` as an array of one or more sectors and `building_types` as an optional array, calls `estimate_rent`, and returns monthly rent tiers.
- `/evaluare?type=rent` calls `/api/estimate-rent` and renders a rent-specific result view with the same date badge as the sale result header, monthly rent levels, filters, market stats, district comparison, and relevant rent listings. Sale-only result actions such as seller breakdown and PDF export remain on the sale/buy result.
- `/api/estimate-rent` gates only the `/evaluare?type=rent` flow: users with paid credits consume `rent_estimate` before the free monthly allowance, users with exhausted paid rent credits do not fall back to the free allowance, authenticated free users without paid credits consume the monthly allowance, and anonymous or limit-reached users receive a preview with rent levels, market-stat values, district values, and listing details locked.
- `/calculator?rezultat=1` also calls `/api/estimate-rent`, then uses the estimated monthly rent to calculate rent-yield metrics from the calculator investment fields. Calculator requests carry `calculator_usage`, always return `full_access: true`, and do not consume the rent evaluation allowance.
- Calculator requests consume `yield_calculator` credits, not `rent_estimate` credits.
- Area is used as a comparable filter only when provided.
- If area is missing, total prices and range come from matching listings' `price_amount` values instead of `price_per_m2 * area`.
- It computes fast sale, market rate, premium, price per m2, range, confidence, district comparison, relevant listings.
- Rent computes the market monthly rent from the comparable median, while the result-page low and high levels come from the cheapest and most expensive matched rent listings and link directly to their 999.md pages.
- Rent also returns price per m2 per month, range, confidence, district comparison, relevant rent listings, and the comparable listing count used for the result.
- `/api/estimate` calls the RPC with the server-side Supabase admin client so server valuation work does not inherit the anonymous client timeout.
- Anonymous `/api/estimate` responses remove the headline estimate and locked sale/buy values before returning JSON and mark `locked_sections` for the UI placeholders. Locked preview responses replace the real market trend with fake trend data before it reaches the browser.
- `/api/estimate` and gated `/api/estimate-rent` responses first consume matching paid credits when available. If the user has exhausted previously granted paid credits for that feature, the response stays locked with `paid_evaluation_limit_reached` instead of consuming free monthly quota. Otherwise, authenticated free responses consume the monthly free full-evaluation allowance in `user_feature_usage_events` after a successful cached or fresh estimate. The free idempotency key is based on the UTC month and normalized estimate params so refreshes do not consume another use.
- Paid-credit sale/rent responses update the same `user_feature_usage_events` row with an `evaluation_snapshot` containing normalized params and the immutable result payload.
- Backend also runs seller-category estimates for owner vs agency/developer.
- Seller-category estimates use the same property filters and seller filters, but skip district comparison and relevant listings because the UI only renders their price/range/stats.
- Seller breakdown shows the comparable listing count for each seller type under the price per m2.
- Successful sale estimate payloads are cached for 30 minutes by normalized inputs and language.
- Successful rent estimate payloads are cached for 12 hours by normalized rent filters.
- Cache hits still resolve access and write estimate logs, but skip repeated RPC/listing/trend work.
- `999.md` preview images for sale and rent relevant listings are loaded after the result page renders through `/api/listing-preview-images`; the preview API accepts only 5-12 digit numeric ids, limits callers to 30/min per IP, and stops reading upstream HTML after 512 KB.
- RPC failures are logged with the failing branch, params, error code, and elapsed time.
- Browser-side PDF generation draws the report directly onto A4 canvas pages and downloads it without calling `/api/estimate` again, after `/api/pdf-generation-authorizations` validates the bearer token and consumes a `pdf_report` credit.
- Successful authenticated PDF generation events are logged to `pdf_generation_events` with user id, device/session ids, optional estimate log id, and whether cadastral data was included.
- Successful sale and rent estimation requests are logged to `estimate_log` with `estimate_type = 'sale'` or `estimate_type = 'rent'` for separate admin statistics. Rent requests require a client log or device id so duplicate untracked fetches do not create extra rows.
- Estimate and PDF event DB writes use `NODE_ENV=production` or `ENABLE_RUNTIME_PERSISTENCE=true`; otherwise local development still returns normal API responses without creating analytics rows.
- The PDF dialog links to the static demo report at `/samples/demo-evaluare-catdai.md.pdf`.
- PDF report layout uses explicit canvas coordinates for pills, seller cards, notes, and text blocks instead of HTML rasterization.
- PDF report header reuses the product logo and displays `catdai.md` as the report brand.
- PDF report can optionally include a QR code pointing back to the estimation page with `src=qr` in the query string.
- When official cadastral data is missing, the PDF dialog recommends adding it and can fetch cadastral details by number before generating the report after the same authenticated bearer-token check.
- Official cadastral data, when included, is grouped with its IPCBI source inside one highlighted report panel.
- Cadastral result/PDF panels include apartment-level and building-level IPCBI details when available: veceu, baie, last-floor flag, official estimated value, construction year, total floors, condition, utilities, and wall material.
- The cadastral estimated-value label stays on one line in the PDF data panel.
- `pnpm run pdf:demo` generates `demo-valuation-report.pdf` with non-real example data, all report sections, a cadastral number, and a QR code pointing to `https://catdai.md/`.

## Feature Adjustments
Applied after RPC in `/api/estimate`.

| Feature | Count | Adjustment |
| --- | --- | --- |
| Balconies | 0 | -2% |
| Balconies | 1 | baseline |
| Balconies | 2 | +2% |
| Balconies | 3+ | +3% |
| Bathrooms | 0 | -4% |
| Bathrooms | 1 | baseline |
| Bathrooms | 2 | +3% |
| Bathrooms | 3+ | +5% |

- Adjusts `fast_sale`, `market_rate`, `premium`, `price_per_m2`.
- Does not adjust raw `range` or `market_stats`.

## Related Files
- `src/app/estimeaza/page.js`
- `src/app/evaluare/page.js`
- `src/app/anunt/page.js`
- `src/components/EvaluationResultPage.js`
- `src/app/api/estimate/route.js`
- `src/lib/free-monthly-feature-usage.js`
- `src/app/api/listing-price-history/route.js`
- `src/app/api/listing-duplicates/route.js`
- `src/app/api/estimate-rent/route.js`
- `src/app/api/profile/evaluation-snapshots/[id]/route.js`
- `src/lib/evaluation-snapshots.js`
- `src/app/api/listing-preview-images/route.js`
- `src/components/PropertyForm.js`
- `src/components/EstimateResult.js`
- `src/components/Tooltip.js`
- `src/components/ValuationPdfDialog.js`
- `src/locales/ro.json`
- `src/locales/ru.json`
- `src/app/api/pdf-generation-authorizations/route.js`
- `src/app/api/pdf-generation-events/route.js`
- `src/lib/runtime-persistence.js`
- `src/lib/browser-pdf.js`
- `scripts/generate-demo-valuation-pdf.mjs`
- `db/pdf_generation_events.sql`
- `db/estimate_log_estimate_type.sql`
- `db/estimate_price_function.sql`
- `db/estimate_rent_function.sql`
