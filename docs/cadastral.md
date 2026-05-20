# Cadastral Lookup

## Stage
Implemented and active, with partial fallback.

## What It Does
- User enters a cadastral number in the valuation form.
- `/api/cadastral` fetches public geodata and extracts building/apartment details.
- It autofills city, district, area, floor, total floors, building type, and bathroom count when available.

## Data Sources
- Geodata WFS lookup for parcel geometry.
- Geodata WMS `GetFeatureInfo` for building/apartment HTML details.
- Nominatim fallback when detailed geodata is missing.

## Access
- Free users get address, area, floor, total floors, and autofill fields.
- Paid users get full cadastral details.
- Current code treats authenticated users as paid.

## Limits
- Rate limited to 15 requests/minute per IP.
- No DB cache for cadastral data yet.

## Related Files
- `src/app/api/cadastral/route.js`
- `src/components/PropertyForm.js`
- `src/lib/validation.js`
