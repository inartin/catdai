# Admin

## Stage
Implemented as read-only admin dashboard.

## Access
- `/admin/login?key=...` requires `ADMIN_LOGIN_KEY`.
- Password is checked against `ADMIN_PASSWORD`.
- `/api/admin/auth` blocks an IP after 5 failed login attempts for 15 minutes and returns `Retry-After`.
- Successful login sets an httpOnly signed `admin_token` session cookie that expires after 12 hours.
- `ADMIN_TOKEN` is used as the server-side HMAC signing secret and is not stored directly in the cookie.
- All `/admin` and `/api/admin` routes require a valid signed `admin_token` session in `src/proxy.js`.
- Protected `/api/admin/*` data routes also verify the `admin_token` cookie inside each route before returning cached data or using `SUPABASE_SERVICE_KEY`.

## Dashboard
Shows:
- registered users
- sale estimations and rent estimations as separate counts from `estimate_log.estimate_type`
- PDF report generation count with registered/anonymous split, cadastral-included count, period totals, and recent rows
- cadastru search count with address/number split, registered/anonymous split, top searched districts for address lookups, period totals, and recent rows
- shared links
- favorites
- Telegram alert count with an expandable list of configured Telegram alerts
- sale and rent estimation cards are clickable and each opens its own recent row list with property details, anonymous/user identity, Romanian date-time, shared status, and favorite status
- Cadastru search rows show only date, search type, derived district when available, and anonymous/user id. Exact addresses and cadastral numbers are not stored for this dashboard.
- Dashboard has a `Hard refresh` button that reloads `/api/admin/stats?fresh=1` to bypass the 5-minute server cache.
- Dashboard stats intentionally load only Users & App Usage data from `/api/admin/stats`; listing analytics are loaded from the Listings section.

## Data Views
- Listings list with search, active filter, rooms filter, sorting, pagination.
- Listings page loads `/api/admin/listings/stats` for total listings, active/inactive listings, owner count, average price, average price per m2, market direction for 24h/7d/30d, distributions by district/rooms/renovation/building type, and recent listings.
- Listing detail with full data, owner link, and price history.
- Owners list with search and pagination.
- Owner detail with profile fields and listings.
- Dashboard registered users and recent sale/rent estimations are inline expandable tables.
- `/admin/ad-tracking` is linked from the left menu as `Ad tracking` and shows `/?src=zdg` tracking grouped by visitor session, with closed-by-default action timelines, repeated actions collapsed into counters, readable event names, registered user identity when a tracked visitor logs in, exact all-time source session/device/funnel totals in the top cards, and paged visitor journeys that load more while scrolling.

## Related Files
- `src/proxy.js`
- `src/lib/admin-auth.js`
- `src/app/admin/*`
- `src/app/api/admin/*`
- `src/lib/admin-ad-tracking.js`
- `db/pdf_generation_events.sql`
- `db/cadastru_search_events.sql`
