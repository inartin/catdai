# Rent Listings Sync

## Key Changes
- Reuse the current fetch/map/persist pipeline with a rent-specific preset and checkpoint.
- Keep sale rows in `listing`; write rent rows to `listing_rent`.
- Rent price history and change events use `listing_rent_price_history` and `listing_rent_change_events`.
- Rent valuation reads monthly rent comparables from `listing_rent` through the `estimate_rent` RPC in `db/estimate_rent_function.sql`; it accepts multiple selected sectors/zones through a `text[]` district parameter and never relaxes those selected sectors during fallback.
- Rent valuation accepts optional multiple construction types through a `text[]` building-type parameter, so old, new, both, or no construction-type filter can be selected in one rent estimate.
- Rent valuation computes price per m2 from `price_amount / area_m2` when `listing_rent.price_per_m2` is missing.
- Rent valuation treats missing `renovation` as compatible with a selected renovation because many rental ads do not include that attribute.
- Rent district comparison groups all city sectors with the same room, construction-type, and renovation filters, and compares median monthly rent instead of price per m2; selected sectors are highlighted together when the user chose more than one.
- Rent comparison rows are clickable and open `/evaluare?type=rent` for that sector with the same city, room, construction-type, and renovation filters used by the comparison median.
- Rent result low/high levels use the cheapest and most expensive matched rent listings, exposed as direct 999.md links in the result page, instead of sale-style percentage offsets.
- Successful rent valuation payloads are cached through the shared Redis cache for 12 hours by normalized rent filters, with the same in-memory fallback when Redis is unavailable.
- Successful rent valuation requests are logged in `estimate_log` with `estimate_type = 'rent'`, so admin statistics show rent estimations separately from sale estimations. Requests without a client log or device id are not logged because they can be duplicate untracked result fetches.
- Owners remain shared in `owner`.
- The 999 source deal type is `feature(id: 1)`, not `price.value.mode`.
- Live fetch check: sale returned `776` / `Vând`; monthly rent returned `912` / `De închiriat lunar`.
- `priceMode` stayed `PM_FIXED` for both sale and monthly rent, so it must not be used as the deal type.
- Current rent preset syncs monthly rent (`912` / `De închiriat lunar`).
- Rent stale marking only updates `listing_rent`.
- Existing Telegram alert dispatch continues to read only sale `listing_change_events`.
- Rent sync errors are logged separately and do not block sale alerts or `lastRunAt`.

## 999 Offer Types

| Option ID | Label |
|---|---|
| `776` | `Vând` |
| `903` | `De închiriat pe zi` |
| `912` | `De închiriat lunar` |
| `922` | `Închiriez` |

## Test Plan
- Compare one sale page and one rent page to confirm the raw `searchAds.ads[0]` payload and normalized mapper output are compatible.
- Verify sale rows persist with `deal_type = 'Vând'`.
- Verify rent rows persist into `listing_rent` with `deal_type = 'De închiriat lunar'`.
- Confirm stale marking is scoped to `listing_rent` for the rent sync.
- After applying `db/estimate_rent_function.sql` in Supabase, call `POST /api/estimate-rent` with city, `districts`, rooms, and optional area to confirm monthly rent output.

## Assumptions
- The active rent ingestion target is monthly rent, not daily rent or renter requests.
- Rent uses the same retry/delay defaults as sale listings.
- No rent-specific Telegram or snapshot flow is added yet.
- Rent estimation is wired from `/estimeaza` to `/api/estimate-rent` through `/evaluare?type=rent`.
