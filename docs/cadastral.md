# Cadastral Lookup

## Stage
Implemented and active, with partial fallback.

## What It Does
- User enters a cadastral number in the valuation form.
- User can also add a cadastral number from the PDF export dialog when the current evaluation lacks official cadastral data.
- PDF-dialog cadastral lookup sends the same authenticated bearer token as the result page, so authenticated users receive full cadastral details there too.
- `/api/cadastral` fetches public geodata and extracts building/apartment details.
- It autofills city, district, area, floor, total floors, building type, and bathroom count when available.
- Result and PDF cadastral panels show official apartment and building details when IPCBI provides them.
- Cadastral validation accepts apartment suffixes with 3 or 4 digits, including the UI example `0100201.999.01.0101`.

## Address-Based Page
- `/ro/cadastru` and `/ru/cadastru` are the indexable localized search pages; direct `/cadastru` is a noindex duplicate that canonicals to the current language version.
- `/cadastru` lets users find official cadastral data by exact address or by entering a cadastral number directly.
- The page title and subtitle sit above the input card so the page purpose is clear before choosing a search method.
- The page has localized route metadata, canonical and alternate language tags, and sitemap entries for both Romanian and Russian.
- The Cadastru route layout passes the URL language into `LanguageProvider`, so `/ru/cadastru` renders Russian page text in the server HTML instead of waiting for client hydration.
- Address search posts to `/api/cadastru/address`, which uses the reusable server helper in `src/lib/cadastru-address-search.js` adapted from `tmp/findcadastru.js`.
- It shows a fixed, non-selectable Chișinău city field, a road type dropdown for `Str.` or `Bulevard`, and separate inputs for street name, house number, and apartment number.
- Address matching must be exact for the street and house number. Similar buildings such as `bd. Moscova 9/5` are rejected when the user enters `bd. Moscova 9`.
- If exact WMS apartment details are missing, address search can use an exact Nominatim building match plus the containing Geodata WFS parcel/building geometry to derive the apartment cadastral number from the building/parcel code and a zero-padded apartment suffix.
- It also shows a lower cadastral-number search section using the same placeholder format as the valuation form and posts to the existing `/api/cadastral` backend.
- Page copy presents address search and cadastral-number search as two alternative methods for the same official cadastral-data result.
- The page displays a short official-source note below the main form card, linking to `geodata.gov.md`.
- The shared header links to the localized Cadastru URL for the current language on desktop and mobile.
- Successful searches navigate to `/{lang}/cadastru/rezultat?cadastral_number=...`.
- `/cadastru/rezultat` fetches `/api/cadastral`, uses the shared back button from the estimation form, renders the shared `CadastralDataCard` component used by the evaluation result page, and is marked `noindex` because each URL is generated from a user query.
- Valid `/cadastru` search submissions are logged to `cadastru_search_events` for admin stats with only `search_type`, optional authenticated `user_id`, optional derived district for address searches, and timestamp. Exact address and cadastral number values are not stored.
- `CadastralDataCard` highlights the cadastral number as the primary key before the address and uses two desktop columns for apartment plus building details, falling back to stacked sections on mobile.
- When only one detail section is available, or only the cadastral number/address is available, the result card uses a compact centered width and keeps the available details on the full inner width instead of reserving an empty second column.
- Partial cadastral responses use the same result card and still show the cadastral number plus any available address, while detailed apartment/building sections render only when official fields exist.
- When Geodata lacks WMS apartment details, `/api/cadastral` calls cadastru.md APEX `GET_DETAIL_DATA` with the dotted cadastral number and object type `3`, then maps the returned table into apartment address, area, type, destination, estimated value, last valuation date, ownership type, real rights, notes, and restrictions.

## Data Sources
- Geodata WFS lookup for parcel geometry.
- Geodata WMS `GetFeatureInfo` for building/apartment HTML details.
- Nominatim fallback when detailed geodata is missing.

## Access
- Cadastral details are free for all users.
- `/api/cadastral` returns full extracted apartment and building details without paid redaction.

## Limits
- Rate limited to 15 requests/minute per IP.
- No DB cache for cadastral data yet.
- Upstream Geodata calls use a 10 second timeout; Nominatim fallback uses 5 seconds.
- Timeout logs include the failing stage: `geodata_wfs`, `geodata_wms`, or `nominatim_reverse`.

## Related Files
- `src/app/api/cadastral/route.js`
- `src/app/api/cadastru/address/route.js`
- `src/app/cadastru/layout.js`
- `src/app/cadastru/rezultat/page.js`
- `src/app/cadastru/rezultat/layout.js`
- `src/lib/cadastru-address-search.js`
- `src/lib/cadastru-search-events.js`
- `src/components/BackButton.js`
- `src/components/CadastralDataCard.js`
- `src/components/PropertyForm.js`
- `src/lib/validation.js`
- `db/cadastru_search_events.sql`
