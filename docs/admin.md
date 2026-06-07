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
- registered users with login provider type such as Telegram or Gmail, registration date, last visit, estimation count, cadastru search count, calculator usage count, PDF report count, 999 link count, shared links, and favorites
- Registered users table uses vertical column dividers for scanability.
- The user admin API includes a response version in its short cache so table schema changes do not reuse stale in-memory rows.
- sale estimations and rent estimations as separate counts from `estimate_log.estimate_type`
- PDF report generation count with registered/anonymous split, cadastral-included count, period totals, and recent rows
- cadastru search count with address/number split, registered/anonymous split, top searched districts for address lookups, period totals, and recent rows
- 999.md listing-link analysis count with analyzed/rejected/failed split, period totals, and recent rows
- calculator usage count with registered/anonymous split, tax-enabled count, period totals, average investment/rent/yield, and recent rows
- shared links
- favorites
- Telegram alert count with an expandable list of configured Telegram alerts
- sale and rent estimation cards are clickable and each opens its own recent row list with property details, anonymous/user identity, Romanian date-time, shared status, and favorite status
- Cadastru search rows show date, search type, result type, cadastral number when known, derived district when available, and anonymous/user name. Exact searched addresses are not stored for this dashboard.
- 999 link-analysis rows show date, status, listing id/link, mapped property summary, asking price, and anonymous/user id.
- Calculator usage rows show date, property summary, total investment, estimated rent, yield, payback period, tax selection, and anonymous/user id.
- Dashboard has a `Hard refresh` button that reloads `/api/admin/stats?fresh=1` to bypass the 5-minute server cache.
- Dashboard stats intentionally load only Users & App Usage data from `/api/admin/stats`; listing analytics are loaded from the Listings section.
- `/admin/feedback` is linked from the left menu as `Feedback` and shows the latest registered-user feedback rows with message, user id, date, status, and optional uploaded image preview that opens in an in-page modal.
- `/admin/news` is linked from the left menu as `News` and lets admins list, create, edit, and remove news items with slug, title, rich description, creation date, and cover image link.
- `/admin/uploads` is linked from the left menu as `Uploads` and lets admins upload JPEG, PNG, WebP, or GIF images up to 5 MB to Supabase Storage.
- Admin uploads use the `img` Supabase Storage bucket by default, or `SUPABASE_IMAGE_BUCKET` when set. Files are saved at the bucket root with a unique sanitized filename. The bucket must be public to use the returned `getPublicUrl` URL without an expiration date; signed URLs are not used.

## Data Views
- Listings list with search, active filter, rooms filter, sorting, pagination.
- Listings page loads `/api/admin/listings/stats` for total listings, active/inactive listings, owner count, average price, average price per m2, market direction for 24h/7d/30d, distributions by district/rooms/renovation/building type, and recent listings.
- Listings page also shows listings with multiple price-history entries, displays the total count for that group, loads the newest 10 first, has a `Load more` button for 10 more rows, and lets the loaded rows be sorted by history count.
- Listing detail with full data, owner link, price history, and a price-history chart when at least two history entries exist.
- Owners list with search and pagination.
- Owner detail with profile fields and listings.
- Dashboard registered users and recent sale/rent estimations are inline expandable tables.
- `/admin/ad-tracking` is linked from the left menu as `Ad tracking` and shows `/?src=zdg` tracking grouped by visitor session, with closed-by-default action timelines, repeated actions collapsed into counters, readable event names, registered user identity when a tracked visitor logs in, exact all-time source session/device/funnel totals in the top cards, and paged visitor journeys that load more while scrolling.
- `/api/admin/feedback` returns the 100 latest `user_feedback` rows after route-level admin cookie verification.
- `/api/admin/news` and `/api/admin/news/[id]` manage `news_posts` rows after route-level admin cookie verification.
- `/api/admin/uploads` stores images in the configured Supabase Storage bucket and returns `public_url` plus the storage path after route-level admin cookie verification.

## Related Files
- `src/proxy.js`
- `src/lib/admin-auth.js`
- `src/app/admin/*`
- `src/app/api/admin/*`
- `src/lib/admin-ad-tracking.js`
- `db/pdf_generation_events.sql`
- `db/cadastru_search_events.sql`
- `db/listing_link_analysis_events.sql`
- `db/calculator_usage_events.sql`
