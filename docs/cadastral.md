# Cadastral Lookup

## Stage
Implemented and active, with partial fallback.

## What It Does
- User enters a cadastral number in the valuation form.
- User can also add a cadastral number from the PDF export dialog when the current evaluation lacks official cadastral data.
- PDF-dialog cadastral lookup sends the same authenticated bearer token as the result page, so authenticated users receive full cadastral details there too.
- `/api/cadastral` requires a valid Supabase bearer token, then checks Redis, the long-lived Supabase cadastru store, the signed external cadastru worker, and finally the in-app Geodata/cadastru.md backup when the worker is unreachable.
- Successful `/api/cadastral` responses are cached in Redis for 7 days by cadastral number and stored as one `cadastru_records` row per cadastral number for long-lived reuse. Failed/not-found responses are not cached.
- It autofills city, district, area, floor, total floors, building type, and bathroom count when available.
- Result and PDF cadastral panels show official apartment and building details when IPCBI provides them.
- Cadastral validation accepts apartment suffixes with 3 or 4 digits, including the UI example `0100201.999.01.0101`.

## Address-Based Page
- `/ro/cadastru` and `/ru/cadastru` are the indexable localized search pages; direct `/cadastru` is a noindex duplicate that canonicals to the current language version.
- `/cadastru` lets users find official cadastral data by exact address or by entering a cadastral number directly.
- `/evaluare` without result query parameters reuses the same cadastru search form and source note, placing the compact cadastral-number quick-fill card first under the `Locație` category header.
- Anonymous users can submit searches from the standalone page. The APIs perform the lookup and return the same server-masked preview used by the cadastru credit paywall; clicking a blurred value opens the shared login popup.
- The cadastru search form persists the address and cadastral-number draft in browser storage so OAuth return to `/cadastru` restores the fields the anonymous user filled before logging in; the result page clears that draft once a result URL opens.
- The page title and subtitle sit above the input card so the page purpose is clear before choosing a search method.
- The page has localized route metadata, canonical and alternate language tags, and sitemap entries for both Romanian and Russian.
- The Cadastru route layout passes the URL language into `LanguageProvider`, so `/ru/cadastru` renders Russian page text in the server HTML instead of waiting for client hydration.
- Address search posts to authenticated `/api/cadastru/address`, which checks Redis, the structured address fields in `cadastru_records`, the signed external cadastru worker, and finally the reusable in-app helper in `src/lib/cadastru-address-search.js` if the worker is unreachable.
- Adding `skipcache=true` to the `/cadastru` URL makes that search bypass Redis and existing `cadastru_records` data for the current address or cadastral number. The fresh external/local result is then written back to the cache and persistent record when the normal persistence conditions apply; the flag is carried to the result-page lookup as needed.
- Successful address-search responses are cached in Redis for 7 days by the normalized address. Apartment results store/update the matching `cadastru_records` row; multi-property land/building results remain in the address cache. Failed/not-found responses are not cached.
- It shows a city dropdown with all cities supported by the cadastru address API, a road type dropdown for `Str.` or `Bulevard`, and separate inputs for street name, house number, and optional apartment number.
- Address input validation runs in both the browser and `/api/cadastru/address`: street is capped at 80 characters, building number accepts only digits plus one optional slash such as `18/2`, and the optional apartment number accepts only digits from `1` to `9999`.
- Address matching must be exact for the street and house number. Similar buildings such as `bd. Moscova 9/5` are rejected when the user enters `bd. Moscova 9`.
- If exact WMS apartment details are missing, address search can use an exact Nominatim building match plus the containing Geodata WFS parcel/building geometry to derive the apartment cadastral number from the building/parcel code and a zero-padded apartment suffix.
- When the apartment number is omitted, address search returns the official land parcel and all regular buildings found at that address. The result card shows a separate card for each land parcel and construction and conditionally renders every available registry field: cadastral number, both area formats, object/type and usage fields, land/building use, estimated value and date, ownership, transactions, real rights, notes, and restrictions.
- It also shows a lower cadastral-number search section using the original `/cadastru` inline layout and the same placeholder format as the valuation form; the page validates apartment/building numbers and land parcel numbers such as `3153208.081` locally, then the result page makes the single `/api/cadastral` lookup. The `/api/cadastral` backend applies the same shared format validation.
- The compact optional quick-fill card remains separate from the `/cadastru` page layout and is used only where the valuation-style shortcut is needed, such as `/evaluare` without result query parameters.
- Page copy presents address search and cadastral-number search as two alternative methods for the same official cadastral-data result.
- The page displays a short official-source note below the main form card, linking to `geodata.gov.md`.
- The shared header links to the localized Cadastru URL for the current language on desktop and mobile.
- Successful cadastral-number searches and full-access address searches navigate to `/{lang}/cadastru/rezultat?cadastral_number=...`; locked address-search previews use a client-side preview handoff so the discovered cadastral number is not exposed in the URL.
- `/cadastru/rezultat` fetches `/api/cadastral` with an optional bearer token, uses the shared back button from the estimation form, renders the shared `CadastralDataCard` component used by the evaluation result page, and is marked `noindex` because each URL is generated from a user query.
- The result page includes a localized "save image" action that exports the cadastral result card into a downloadable PNG using the desktop two-column layout, even when the page is opened on mobile.
- Authenticated users without a remaining `cadastru_lookup` credit still land on the result page. Direct cadastral-number searches show the submitted number, but address-search previews replace the discovered cadastral number with a fake blurred number; address, apartment floor, building classifier, and construction year stay visible when available, while the rest of the official fields are replaced server-side with `|` placeholders and blurred behind the same package purchase popup pattern used by evaluation previews.
- Anonymous users receive the same masked result after a standalone search. After login, the result page retries the saved address lookup or cadastral-number lookup so authenticated users can see full details when their access allows it.
- After a result is loaded, `/cadastru/rezultat` keeps the loaded result in component state and does not repeat the lookup on tab focus; it retries when an anonymous preview becomes authenticated. In-flight cadastral-number lookups are deduped so effect reruns do not create duplicate statistics rows.
- Valid `/cadastru` search submissions are logged to `cadastru_search_events` for admin stats with `search_type`, optional authenticated `user_id`, city when derivable, optional derived district for address searches, cadastral number when known, result type, lookup source, and timestamp. Result type is one of `no_data`, `address_only`, `apartment_only`, or `full_data`; lookup source is `api` for the external worker or `local` for the in-app backup.
- Authenticated users can see their own cadastru search rows in `/profile` history, where the result column shows the cadastral number and details show search type, result type, city, and district when available.
- Successful and failed signed external cadastru worker calls are counted in `external_api_usage_daily` with fire-and-forget background writes, separate from user/search analytics.
- Cadastru search analytics are written when `NODE_ENV=production` or `ENABLE_RUNTIME_PERSISTENCE=true`.
- Long-lived cadastru storage is written under the same runtime persistence rule. `cadastru_records.lookup_count` counts successful cadastral-number detail lookups.
- `cadastru_records` keeps required `full_address`, separate city/region/district/street/house/apartment fields when derivable, typed apartment/building columns for common filters, and the full official payload in JSONB so newly discovered official fields are not lost.
- `CadastralDataCard` highlights the cadastral number as the primary key before the address and uses two desktop columns for apartment plus building details, falling back to stacked sections on mobile.
- When only one detail section is available, or only the cadastral number/address is available, the result card uses a compact centered width and keeps the available details on the full inner width instead of reserving an empty second column.
- Partial cadastral responses use the same result card and still show the cadastral number plus any available address, while detailed apartment/building sections render only when official fields exist.
- Limited cadastral result cards show a highlighted note in Romanian or Russian explaining that no more official data was found in the verified sources.
- Cadastral-number lookups call cadastru.md APEX `GET_DETAIL_DATA` with the dotted cadastral number and object type `3` to enrich Geodata or external-worker results with cadastru.md-only fields when available: object type, destination, room usage, ownership type, transaction count, real rights, notes, and restrictions.
- When Geodata lacks WMS apartment details, cadastru.md detail data can still provide apartment address, area, type, destination, estimated value, ownership type, transaction count, real rights, notes, and restrictions.
- The cadastru.md session bootstrap retries the APEX entry URLs with browser-like headers, carries cookies between attempts, and accepts hidden `p_instance`, APEX `APP_SESSION`, or page-context session values before calling detail/search processes. This code exists in both the external worker and the in-app backup.
- `external/cadastru-api` contains a standalone Node.js cadastru worker intended for a Raspberry Pi behind Cloudflare Tunnel. It exposes signed `POST /v1/cadastral` and `POST /v1/cadastru/address` requests, runs the Geodata plus cadastru.md lookup externally, and returns data to the main app without Supabase/user context.
- The external worker includes `ecosystem.config.cjs` for PM2, running one local-only process on `127.0.0.1:8787`; secrets must stay in the runtime environment or untracked `.env`, not in the PM2 config.
- Cadastru analytics stay local to the main Catdai app through `src/lib/cadastru-search-events.js`; the external worker must not store user ids, cadastral numbers, or search events. Local analytics include `lookup_source` so admin stats can separate external API results from local backup usage.

## Data Sources
- Geodata WFS lookup for parcel geometry.
- Geodata WMS `GetFeatureInfo` for building/apartment HTML details.
- cadastru.md APEX detail lookup for fields not exposed by Geodata.
- Nominatim fallback when detailed geodata is missing.

## Access
- The standalone `/cadastru` search accepts anonymous address and cadastral-number submissions and returns a server-masked preview.
- Blurred preview values open the shared login popup for anonymous users. Authenticated users receive full details when their `cadastru_lookup` credit or free monthly allowance permits it; authenticated users without access keep the existing package purchase preview.
- `/api/cadastral` and `/api/cadastru/address` allow anonymous requests only when the request explicitly carries the standalone `search_context: "cadastru"`; other callers still require a valid bearer token.
- Authenticated users need an available `cadastru_lookup` allowance or credit for unblurred full details.
- Address search and the follow-up cadastral-number result share the cadastral-number paid idempotency key when possible, so the same lookup is not charged twice.

## Limits
- Rate limited to 15 requests/minute per IP.
- Successful cadastral-number and address lookup responses use Redis shared cache for 7 days before falling back to the long-lived Supabase cadastru store.
- Upstream Geodata calls use a 10 second timeout; Nominatim fallback uses 5 seconds.
- Timeout logs include the failing stage: `geodata_wfs`, `geodata_wms`, or `nominatim_reverse`.
- The external cadastru worker uses HMAC headers `X-Catdai-Timestamp` and `X-Catdai-Signature` for AWS-to-worker calls and should listen on `127.0.0.1` when exposed through Cloudflare Tunnel. The main app reads `CADASTRU_EXTERNAL_API_BASE_URL` plus `CADASTRU_EXTERNAL_API_SECRET`, with `CADASTRU_EXTERNAL_API_URL` and `CADASTRU_EXTERNAL_ADDRESS_API_URL` available as explicit endpoint overrides.

## Related Files
- `src/app/api/cadastral/route.js`
- `src/app/api/cadastru/address/route.js`
- `src/lib/cadastru-external-api.js`
- `src/app/cadastru/layout.js`
- `src/app/cadastru/rezultat/page.js`
- `src/app/cadastru/rezultat/layout.js`
- `src/components/CadastruSearchForm.js`
- `src/components/CadastralQuickSearchCard.js`
- `src/components/CadastruSourceNote.js`
- `src/components/EvaluationResultPage.js`
- `src/lib/cadastru-address-search.js`
- `src/lib/cadastru-search-events.js`
- `src/lib/cadastru-records.js`
- `src/lib/runtime-persistence.js`
- `external/cadastru-api/*`
- `src/components/AuthRequiredModal.js`
- `src/components/BackButton.js`
- `src/components/CadastralDataCard.js`
- `src/components/PropertyForm.js`
- `src/lib/validation.js`
- `db/cadastru_search_events.sql`
- `db/cadastru_records.sql`
