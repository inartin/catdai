# Valuation

## Stage
Implemented and active for apartments.

## User Flow
- `/estimeaza` collects city, district, rooms, area, building type, renovation, and optional floor, bathrooms, balconies, cadastral number.
- `/evaluare` reads URL params and calls `/api/estimate`.
- Result supports edit, compare, share, favorite, relevant listings, and alert setup.

## Estimate Logic
- API validates input with `src/lib/validation.js`.
- Supabase RPC `estimate_price` does comparable filtering with progressive widening.
- It computes fast sale, market rate, premium, price per m2, range, confidence, district comparison, relevant listings.
- `/api/estimate` calls the RPC with the server-side Supabase admin client so server valuation work does not inherit the anonymous client timeout.
- Backend also runs seller-category estimates for owner vs agency/developer.
- Seller-category estimates use the same property filters and seller filters, but skip district comparison and relevant listings because the UI only renders their price/range/stats.
- Successful estimate payloads are cached for 30 minutes by normalized inputs and language.
- Cache hits still resolve access and write estimate logs, but skip repeated RPC/listing/trend work.
- `999.md` preview images for relevant listings are loaded after the result page renders through `/api/listing-preview-images`.
- RPC failures are logged with the failing branch, params, error code, and elapsed time.

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
- `src/app/api/listing-preview-images/route.js`
- `src/components/PropertyForm.js`
- `src/components/EstimateResult.js`
- `db/estimate_price_function.sql`
