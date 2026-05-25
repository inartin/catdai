# Listing Alerts

## Stage
UI and storage implemented. Matching/sending worker is not in this repo.

## What Users Can Do
- Create alerts from `/alerts`.
- Create alerts from estimate results.
- Configure base market filters and notification filters.
- Optionally enable Telegram notifications on `/alerts` and connect from the profile-style Telegram card.
- View and delete saved alerts in `/profile`.
- `/alerts` has a localized browser title from `alerts.pageTitle`.

## Filters
Base filters:
- city, district, rooms, area, floor, total floors
- building type, renovation, bathrooms, balconies

Alert filters:
- price min/max
- max price per m2
- area min/max
- floor min/max
- first floor / last floor
- seller type

## Delivery Fields
Alerts store `website_enabled`, `telegram_enabled`, and `telegram_chat_id`.
Current UI saves alerts with website enabled and Telegram disabled by default.

## Missing Piece
No in-repo job currently checks listings against alerts or sends notifications.

## Related Files
- `src/app/alerts/page.js`
- `src/components/ListingAlertConfigurator.js`
- `src/app/api/listing-alerts/route.js`
- `src/app/profile/page.js`
- `db/user_listing_alerts.sql`
