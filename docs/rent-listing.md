# Rent Listings Sync

## Key Changes
- Reuse the current fetch/map/persist pipeline with a rent-specific preset and checkpoint.
- Keep sale rows in `listing`; write rent rows to `listing_rent`.
- Rent price history and change events use `listing_rent_price_history` and `listing_rent_change_events`.
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

## Assumptions
- The active rent ingestion target is monthly rent, not daily rent or renter requests.
- Rent uses the same retry/delay defaults as sale listings.
- No rent-specific Telegram or snapshot flow is added yet.
