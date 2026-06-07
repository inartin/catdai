# 999.md Listing Link Analysis

## Purpose
Paste a 999.md listing link, auto-extract its parameters, run the standard valuation, and show how the listing's asking price compares to the calculated market median.

## Flow
1. `LinkAnalyzer` is available on the landing page and on `/verifica-anunt`; `/estimeaza` links users to `/verifica-anunt?from=estimeaza`, where a back button returns to `/estimeaza`, and `/999` permanently redirects to `/verifica-anunt`.
2. It posts the URL to `POST /api/analyze-link`.
   - When the visitor is authenticated, the client includes the Supabase bearer token so analytics can attach `user_id`.
3. The route extracts the listing id, checks the parsed-listing cache, then tries the signed external 999 worker when configured; if the worker is unavailable or fails, it falls back to the local 999 fetch/parser.
4. The app validates Chișinău sale apartments and maps the parsed seller-selected fields to estimate params.
5. The client redirects to `/anunt?...` with the mapped params plus `listing_price`, `listing_currency`, `listing_id`.
6. `/anunt` runs the usual sale estimate, fetches listing price history by `listing.external_id`, and renders the listing-vs-market comparison through the shared result component.
7. At the bottom of the `/anunt` result, the page embeds `LinkAnalyzer` directly so users can start another 999.md listing check without returning to `/verifica-anunt`.

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
- Returns `external_id`, `listing_price`, `listing_currency`, parsed `listing_address`, `listing_url`, and the mapped `params`.
- `listing_address` is built from 999.md embedded region/city/district/street/house fields when available; stale cached parses that only contain a broad location are refreshed before returning.

## Analytics
- Each parse attempt with a valid 999 listing id writes to `listing_link_analysis_events` when the table exists.
- Cached successful fallback responses also write success analytics, so authenticated cached analyses still attach `user_id`.
- External 999 worker usage does not change analytics ownership; the main app still writes all listing-link analysis events.
- The admin dashboard shows total link analyses, analyzed/rejected/failed splits, period totals, and recent rows.
- 999.md link-analysis events are written only when `NODE_ENV=production`.

## Comparison UI (`src/components/EstimateResult.js`)
- Only compared when the listing is in **EUR** (avoids cross-currency math).
- Header label switches to "Analiza anunțului" when a listing is analyzed and sits above both the preview image and property title.
- The listing preview image is a larger 4:3 thumbnail aligned with the property title row, hydrated client-side via `/api/listing-preview-images`.
- When the parsed listing has a street/house address, the listing-analysis header appends it after district and city.
- When `listing_price_history` has real price changes for the analyzed listing, the header shows an interactive total-price history chart instead of the sector trend. The chart includes price/date axes, visible change-point dots, and hover/click details per dot.
- On desktop, the listing summary and price-history sections split the header card into two equal halves, with the preview image counted inside the left half.
- On mobile, the listing price-history chart spans the full header card width instead of staying constrained to the text column beside the preview image.
- Under the latest price, the chart shows total change from the initial recorded price, for example `-€5.500 (-3.4%)` plus `de la prețul inițial €159.900`.
- When no price change history is found, the header shows `Nu am detectat istoric de schimbări de preț.` instead of the chart.
- The listing-analysis header also shows the combined high + medium duplicate-candidate count when `/api/listing-duplicates` returns data; clicking it scrolls to the duplicate section. If the duplicate API succeeds with zero matches, the same badge shows `✓ Nu au fost găsite duplicate`.
- The asking price replaces the middle column in the main estimate card, with a directional arrow + signed % (emerald = under, amber = over, primary = at market within ±3%).
- A verdict banner states the difference (e.g. "Prețul cerut este cu €5.500 (7.0%) sub prețul de piață mediu") and compares price/m² (listing vs market). The "Vezi anunțul" link sits inside the banner.
- A duplicate-candidate section is shown above `Anunțuri relevante`, using text-only clickable cards with street/house address when available, price, a two-line match probability badge, and reason badges on high-probability matches when available.
- The bottom action on `/anunt` is the inline `Verifică un anunț 999.md` link analyzer instead of the generic `Estimare nouă` button.
- Sharing a listing-analysis result copies the current `/anunt` URL so the listing comparison stays attached.

## Anti-Blocking Measures
- **Caching** (`src/lib/listing-cache.js`): uses the shared Redis cache (`src/lib/cache.js`) with key prefix `catdai:listing-analyze:v2:` and a 6h TTL, plus a 500-entry in-memory LRU fallback for when Redis is unavailable. Repeat analyses of the same listing skip the upstream fetch. Only successfully parsed listings are cached; transient failures are not. Mapping still runs per request so logic changes apply immediately.
- **External worker first** (`src/lib/listing999-external-api.js`): when `LISTING999_EXTERNAL_API_BASE_URL` or `CADASTRU_EXTERNAL_API_BASE_URL` plus the matching shared secret are configured, `/api/analyze-link` asks the signed external worker for parsed 999 data before using local fetch. External failures, timeouts, blocks, or missing config fall back to local fetch/parse.
- **Backoff**: `fetchListingHtml` retries up to 3 times with exponential backoff (600ms → 4s cap), honoring upstream `Retry-After` on `429`/`503`. `403` is treated as a block immediately (no hammering); network/timeout errors retry.
- **Block signaling**: blocks return `upstream_blocked` (503), shown to the user as a "temporarily limited, try again in a few minutes" message.
- **Consistent headers**: a single stable Chrome-on-macOS header set (`Accept-Language`, `Referer`, `Sec-Fetch-*`, `Sec-Ch-Ua*`). `Accept-Encoding` is intentionally left unset so the runtime auto-decompresses the response.
- Rotating proxies / headless browser are not used; escalate to those only if real blocking appears.

## External Worker Env

- `LISTING999_EXTERNAL_API_BASE_URL` points to the external worker base URL and calls `/v1/999/listing`.
- `LISTING999_EXTERNAL_API_URL` can override the full endpoint.
- `LISTING999_EXTERNAL_API_SECRET` signs requests; if absent, the app reuses `CADASTRU_EXTERNAL_API_SECRET`.
- `LISTING999_EXTERNAL_API_TIMEOUT_MS` defaults to 10 seconds.
- If no 999-specific base URL is set, the app can reuse `CADASTRU_EXTERNAL_API_BASE_URL` because both routes can live in the same worker.

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
- `src/app/anunt/page.js`
- `src/components/ListingAnalyzerPageContent.js`
- `src/app/verifica-anunt/page.js`
- `src/app/999/page.js`
- `src/app/api/analyze-link/route.js`
- `src/app/api/listing-price-history/route.js`
- `src/app/api/listing-duplicates/route.js`
- `src/components/EvaluationResultPage.js`
- `src/lib/listing-duplicates.js`
- `src/lib/parse-999-listing.js`
- `src/lib/listing999-external-api.js`
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
