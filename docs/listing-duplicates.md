# Listing Duplicate Detection

## Stage
First API version implemented and shown on `/anunt`.

## API
- `POST /api/listing-duplicates` checks active sale or rent listings for duplicate candidates.
- Input can include a `999.md` `url`, an `external_id`, or normalized listing fields.
- `listing_type` / `type` can be `sale` or `rent`; when omitted with an `external_id`, the API tries sale first, then rent.
- The route can fetch/cache 999.md listing HTML only to read exact address from the embedded region/city/district/street/house fields; it does not fetch or compare images in this version.
- Rate limit is 30 requests/minute per IP.

## Matching
- Required exact fingerprint: city, district, rooms, area, floor, total floors, and building type.
- Detail signals: renovation, bathrooms, and balconies.
- Exact address is a blocking signal when available: different street/building number excludes a candidate from high/medium results.
- Building suffixes and slash parts are part of the exact address, so `28`, `28a`, `28 a`, `28/1`, `28/A`, and `28/D` are not treated as the same building.
- Broad locations such as only `Chișinău mun.` are not treated as an address match and do not add confidence.
- Current imported listing rows do not populate `address_text`, `sector`, `latitude`, or `longitude`; the `/anunt` flow passes the parsed 999.md address for the original listing and the duplicate API reads cached/fetched 999.md listing HTML to compare candidate addresses.
- Cached parsed listings without street and house are refreshed from 999.md before address comparison when possible.
- Owner and same-currency price similarity within 3% raise confidence.
- Different currency does not exclude a candidate; price similarity is simply not scored without conversion.
- Candidates are returned only in `high` and `medium` arrays, each item including match reasons and signals.
- Active rows are checked only; inactive/deleted rows are ignored.
- Up to 1000 fingerprint candidates are checked per request, with `counts.truncated` returned when that cap is reached.

## Response Shape
- `target`: normalized listing used for matching.
- `criteria`: field and scoring settings used by the API.
- `counts`: checked/high/medium/truncation counts.
- `high`: high-probability duplicate candidates.
- `medium`: medium-probability duplicate candidates.

## `/anunt` UI
- Listing analysis fetches duplicates after the main estimate using the analyzed listing id, parsed listing address, and normalized sale criteria.
- The header card shows the combined high + medium duplicate count in the left listing-summary area; the count is clickable and scrolls to the duplicate section.
- When the duplicate API succeeds with zero high/medium matches, the header badge shows `✓ Nu au fost găsite duplicate`.
- A duplicate-candidate section appears above `Anunțuri relevante` when candidates exist.
- The duplicate section shows at most 3 cards by default and uses a bottom button to reveal the remaining candidates.
- Duplicate cards do not show images; they show title, street/house address when available, location/floor, price, key tags, and a two-line `Potrivire` probability badge.
- High-probability duplicate cards can show multiple small reason badges for same owner and same address.
- Cards link directly to the original 999.md listing.
- Locked `/anunt` previews use blurred fake duplicate cards, including fake 999.md listing URLs, so real duplicate data and links are not exposed before unlock.

## Related Files
- `src/app/api/listing-duplicates/route.js`
- `src/lib/listing-duplicates.js`
- `src/app/api/analyze-link/route.js`
- `src/components/LinkAnalyzer.js`
- `src/components/EvaluationResultPage.js`
- `src/components/EstimateResult.js`
