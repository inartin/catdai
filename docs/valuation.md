# Valuation

## Stage
Implemented and active for apartments.

## User Flow
- `/estimeaza` shows two tabs for `Vânzare / cumpărare` and `Chirie lunară`; rent submissions use `/evaluare?type=rent`.
- `/estimeaza?type=rent` opens the rent tab even before any city or criteria are present.
- The sale/buy tab uses `Estimare apartament` / `Оценка квартиры`; the rent tab uses `Estimare de piață` / `Рыночная оценка`, lets users select multiple sectors/zones and optionally multiple construction types, and hides the cadastral shortcut, total floors, first/last-floor filters, balconies, and budget fields.
- `/estimeaza` collects city, district, rooms, building type, renovation, optional area, optional floor, optional first-floor/last-floor filters, bathrooms, balconies, cadastral number.
- `/evaluare` reads URL params and calls `/api/estimate`.
- Result-page URL cleanup preserves `type=rent`, so refreshing a rent result keeps the rent API path instead of falling back to sale valuation.
- Result supports edit, compare, share, favorite, PDF export, relevant listings, and alert setup.
- Result sidebar actions are ordered with PDF export first as the visual primary action, followed by share, compare, and criteria edit as neutral secondary actions.
- PDF export opens a section picker for everyone, but PDF download is login-gated and requires a valid Supabase session immediately before generation. If login starts from the PDF dialog, the login prompt overlays the PDF dialog; after OAuth redirect, a localStorage flag restores the PDF dialog.
- PDF reports always include the estimated market price, segment median price per m2, property summary, disclaimer footer, and `catdai.md` source label; optional sections include seller-type comparison and official cadastral data when available.
- PDF reports intentionally exclude market statistics, relevant listing cards/links, and sector/city trend charts.

## Estimate Logic
- API validates input with `src/lib/validation.js`.
- First-floor and last-floor options are optional alternatives to a specific floor; selecting either clears the exact floor field and filters comparables by floor edge.
- Supabase RPC `estimate_price` does comparable filtering with progressive widening.
- Supabase RPC `estimate_rent` mirrors the same comparable filtering and progressive widening against `listing_rent`, but selected rent districts remain mandatory and are not relaxed during fallback. Rent price-per-m2 calculations use stored `price_per_m2` when present, otherwise `price_amount / area_m2`; selected rent renovation also includes listings with missing renovation because that field is often absent in rental ads.
- `POST /api/estimate-rent` validates the regular property fields plus `districts` / `regions` as an array of one or more sectors and `building_types` as an optional array, calls `estimate_rent`, and returns monthly rent tiers.
- `/evaluare?type=rent` calls `/api/estimate-rent` and renders a rent-specific result view with monthly rent levels, filters, market stats, district comparison, and relevant rent listings. Sale-only result actions such as seller breakdown and PDF export remain on the sale/buy result.
- Area is used as a comparable filter only when provided.
- If area is missing, total prices and range come from matching listings' `price_amount` values instead of `price_per_m2 * area`.
- It computes fast sale, market rate, premium, price per m2, range, confidence, district comparison, relevant listings.
- Rent computes the market monthly rent from the comparable median, while the result-page low and high levels come from the cheapest and most expensive matched rent listings and link directly to their 999.md pages.
- Rent also returns price per m2 per month, range, confidence, district comparison, relevant rent listings, and the comparable listing count used for the result.
- `/api/estimate` calls the RPC with the server-side Supabase admin client so server valuation work does not inherit the anonymous client timeout.
- Backend also runs seller-category estimates for owner vs agency/developer.
- Seller-category estimates use the same property filters and seller filters, but skip district comparison and relevant listings because the UI only renders their price/range/stats.
- Seller breakdown shows the comparable listing count for each seller type under the price per m2.
- Successful estimate payloads are cached for 30 minutes by normalized inputs and language.
- Cache hits still resolve access and write estimate logs, but skip repeated RPC/listing/trend work.
- `999.md` preview images for sale and rent relevant listings are loaded after the result page renders through `/api/listing-preview-images`.
- RPC failures are logged with the failing branch, params, error code, and elapsed time.
- Browser-side PDF generation draws the report directly onto A4 canvas pages and downloads it without calling `/api/estimate` again, after `/api/pdf-generation-authorizations` validates the bearer token.
- Successful authenticated PDF generation events are logged to `pdf_generation_events` with user id, device/session ids, optional estimate log id, and whether cadastral data was included.
- The PDF dialog links to the static demo report at `/samples/demo-evaluare-catdai.md.pdf`.
- PDF report layout uses explicit canvas coordinates for pills, seller cards, notes, and text blocks instead of HTML rasterization.
- PDF report header reuses the product logo and displays `catdai.md` as the report brand.
- PDF report can optionally include a QR code pointing back to the estimation page with `src=qr` in the query string.
- When official cadastral data is missing, the PDF dialog recommends adding it and can fetch cadastral details by number before generating the report.
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
- `src/app/api/estimate/route.js`
- `src/app/api/estimate-rent/route.js`
- `src/app/api/listing-preview-images/route.js`
- `src/components/PropertyForm.js`
- `src/components/EstimateResult.js`
- `src/components/ValuationPdfDialog.js`
- `src/app/api/pdf-generation-authorizations/route.js`
- `src/app/api/pdf-generation-events/route.js`
- `src/lib/browser-pdf.js`
- `scripts/generate-demo-valuation-pdf.mjs`
- `db/pdf_generation_events.sql`
- `db/estimate_price_function.sql`
- `db/estimate_rent_function.sql`
