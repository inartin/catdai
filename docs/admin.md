# Admin

## Stage
Implemented as read-only admin dashboard.

## Access
- `/admin/login?key=...` requires `ADMIN_LOGIN_KEY`.
- Password is checked against `ADMIN_PASSWORD`.
- Successful login sets an httpOnly `admin_token` cookie.
- All `/admin` and `/api/admin` routes require `ADMIN_TOKEN`.

## Dashboard
Shows:
- registered users
- total estimations
- PDF report generation count with registered/anonymous split, cadastral-included count, period totals, and recent rows
- shared links
- favorites
- Telegram alert count with an expandable list of configured Telegram alerts
- listing counts and active listings
- owner count
- average price and price per m2
- market direction for 24h, 7d, 30d
- distributions by district, rooms, renovation, building type
- recent listings
- total estimations is clickable and opens a recent estimation row list with property details, anonymous/user identity, Romanian date-time, shared status, and favorite status

## Data Views
- Listings list with search, active filter, rooms filter, sorting, pagination.
- Listing detail with full data, owner link, and price history.
- Owners list with search and pagination.
- Owner detail with profile fields and listings.
- Dashboard registered users and recent estimations are inline expandable tables.
- `/admin/ad-tracking` is linked from the left menu as `Ad tracking` and shows `/?src=zdg` tracking grouped by visitor session, with closed-by-default action timelines, repeated actions collapsed into counters, readable event names, registered user identity when a tracked visitor logs in, exact all-time source session/device/funnel totals in the top cards, and paged visitor journeys that load more while scrolling.

## Related Files
- `src/proxy.js`
- `src/app/admin/*`
- `src/app/api/admin/*`
- `src/lib/admin-ad-tracking.js`
- `db/pdf_generation_events.sql`
