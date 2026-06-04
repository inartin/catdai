# 999.md Listing Link Analysis

## Purpose
Paste a 999.md listing link, auto-extract its parameters, run the standard valuation, and show how the listing's asking price compares to the calculated market median.

## Flow
1. `LinkAnalyzer` is available on the landing page and on `/verifica-anunt`; `/estimeaza` links users to `/verifica-anunt?from=estimeaza`, where a back button returns to `/estimeaza`, and `/999` permanently redirects to `/verifica-anunt`.
2. It posts the URL to `POST /api/analyze-link`.
3. The route extracts the listing id, fetches the page, parses seller-selected attributes, validates Chișinău, and maps them to estimate params.
4. The client redirects to `/evaluare?...` with the mapped params plus `listing_price`, `listing_currency`, `listing_id`.
5. `EstimateResult` runs the usual estimate and renders the listing-vs-market comparison.

## Parsing (`src/lib/parse-999-listing.js`)
- Reads the seller-selected attributes only; the free-text description is ignored.
- Price/currency/external id come from `product:*` meta tags; location from JSON-LD `name`.
- Page title is kept only as a fallback signal for category/deal-type rejection.
- Features are read from the `styles_group__feature__*` list items.
- Deal type can also be recovered from compact visible text when 999.md does not render it as a regular feature row.
- Returns `null` when the page is not a parseable listing.

## Mapping & Validation (`src/app/api/analyze-link/route.js`)
- **Chișinău-only**: aborts with `not_chisinau` when the location is outside Chișinău.
- **Sale apartments only**: aborts with `unsupported_listing_type` when seller attributes or title do not confirm sale, or when they show rent / a non-apartment category.
- Requires district + room count; missing essentials return `insufficient_data`.
- Optional fields (area, building type, renovation, floor, total floors, bathrooms, balconies) are mapped when present and within bounds.
- Returns `external_id`, `listing_price`, `listing_currency`, `listing_url`, and the mapped `params`.

## Analytics
- Each parse attempt with a valid 999 listing id writes to `listing_link_analysis_events` when the table exists.
- The admin dashboard shows total link analyses, analyzed/rejected/failed splits, period totals, and recent rows.
- 999.md link-analysis events are written only when `NODE_ENV=production`.

## Comparison UI (`src/components/EstimateResult.js`)
- Only compared when the listing is in **EUR** (avoids cross-currency math).
- Header label switches to "Analiza anunțului" when a listing is analyzed and sits above both the preview image and property title.
- The listing preview image is a larger 4:3 thumbnail aligned with the property title row, hydrated client-side via `/api/listing-preview-images`.
- The asking price replaces the middle column in the main estimate card, with a directional arrow + signed % (emerald = under, amber = over, primary = at market within ±3%).
- A verdict banner states the difference (e.g. "Prețul cerut este cu €5.500 (7.0%) sub prețul de piață mediu") and compares price/m² (listing vs market). The "Vezi anunțul" link sits inside the banner.

## Anti-Blocking Measures
- **Caching** (`src/lib/listing-cache.js`): uses the shared Redis cache (`src/lib/cache.js`) with key prefix `catdai:listing-analyze:v2:` and a 6h TTL, plus a 500-entry in-memory LRU fallback for when Redis is unavailable. Repeat analyses of the same listing skip the upstream fetch. Only successfully parsed listings are cached; transient failures are not. Mapping still runs per request so logic changes apply immediately.
- **Backoff**: `fetchListingHtml` retries up to 3 times with exponential backoff (600ms → 4s cap), honoring upstream `Retry-After` on `429`/`503`. `403` is treated as a block immediately (no hammering); network/timeout errors retry.
- **Block signaling**: blocks return `upstream_blocked` (503), shown to the user as a "temporarily limited, try again in a few minutes" message.
- **Consistent headers**: a single stable Chrome-on-macOS header set (`Accept-Language`, `Referer`, `Sec-Fetch-*`, `Sec-Ch-Ua*`). `Accept-Encoding` is intentionally left unset so the runtime auto-decompresses the response.
- Rotating proxies / headless browser are not used; escalate to those only if real blocking appears.

## Error Codes
| Code | Meaning |
|---|---|
| `invalid_url` | Not a valid 999.md listing link |
| `unsupported_listing_type` | Listing is not a sale apartment |
| `not_chisinau` | Listing is outside Chișinău |
| `insufficient_data` / `not_a_listing` | Page lacks the data needed to analyze |
| `fetch_failed` | Upstream fetch failed |
| `upstream_blocked` | 999.md temporarily blocked/limited access |
| `rate_limited` | Per-IP request limit hit (15/min) |

## Related Files
- `src/components/LinkAnalyzer.js`
- `src/components/ListingAnalyzerPageContent.js`
- `src/app/verifica-anunt/page.js`
- `src/app/999/page.js`
- `src/app/api/analyze-link/route.js`
- `src/lib/parse-999-listing.js`
- `src/lib/listing-link-analysis-events.js`
- `src/lib/runtime-persistence.js`
- `src/lib/listing-cache.js` (wraps the shared Redis cache in `src/lib/cache.js`)
- `db/listing_link_analysis_events.sql`
- `src/components/EstimateResult.js`
- `src/locales/ro.json`, `src/locales/ru.json` (`linkAnalyzer.*`, `result.listing*`)

## Assumptions
- Analysis is restricted to the Chișinău region.
- Price comparison runs only for EUR listings.
- The ±3% band marks a listing as "at market".
- Listing caching shares the same Redis instance as the rest of the app (AWS), with an in-memory fallback when Redis is down.
