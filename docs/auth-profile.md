# Auth And Profile

## Stage
Implemented and active.

## Login
- Supabase OAuth is used.
- UI currently exposes Google and Telegram login.
- Navbar login uses the compact dropdown on desktop and a centered popup on mobile so the provider choices are not nested inside the mobile menu.
- Telegram login uses Telegram's current OAuth popup ID token through `/api/auth/telegram`, then signs the browser into Supabase with an app-managed Telegram account.
- Telegram does not use Supabase's hosted OIDC callback because Telegram lacks a UserInfo endpoint and that callback can fail with `Error getting user profile from external provider`.
- Telegram direct OIDC popup ID tokens are not passed to `signInWithIdToken` because those can fail with `Bad ID token`.
- Redirect returns to the current page. Before Google OAuth or Telegram popup login starts, the app stores the current path/query and restores it after the session is created, so `/evaluare` preview URLs keep the same valuation criteria after login.
- OAuth params are stripped from the URL after session sync.
- The auth cleanup only strips `type` when other OAuth callback params are present, so app URLs such as `/evaluare?type=rent` keep their valuation mode on refresh.

## Profile
`/profile` shows:
- user avatar/name/email
- clickable package badge in the top-right of the profile card, based on the latest paid package or remaining paid credits; free accounts show `Pachet Start`, and the badge opens `/pricing`
- Telegram app-managed placeholder emails like `telegram-<id>@auth.catdai.md` are hidden; Telegram username is shown when available.
- logout
- free monthly sale/rent allowance balances plus purchased feature-credit balances, including remaining, used, and granted counts per feature, shown in the top profile card above `Setări`; free allowance cards use a separate free badge
- favorites
- paginated history tab for the authenticated user's own valuation rows from `estimate_log` and cadastru search rows from `cadastru_search_events`; sale shows `Evaluare`, rent shows `Evaluare Chirie`, and cadastru shows the cadastral number as the result plus search type, result type, city, and district when available
- paid sale/rent evaluation usage rows are shown in history when a saved paid snapshot exists; if the same action also has an `estimate_log` row, history hides the ordinary row and keeps only the paid snapshot row. Paid rows have a green left marker with a paid-result tooltip, open `/evaluare?snapshot_id=...`, and render the stored result instead of recomputing the valuation
- paginated transactions tab for the authenticated user's own rows from `paddle_payment_orders`; it shows product, status, amount, Paddle transaction/subscription id when available, and the internal order id for support lookup
- refunded and chargeback Paddle orders remain visible in transaction history, but they are not treated as active paid packages
- closed `Setări` panel with account deletion and an Extra subscription cancellation action when the user has an active Extra subscription; cancellation is scheduled for the next billing period and visible subscription dates use full capitalized month names
- localized browser title from `nav.profile`

## Notifications
- Logged-in users can load their own active `user_notifications` rows from `/api/notifications`.
- Opening the navbar notification sidebar keeps unread rows visibly unread until the sidebar closes.
- Clearing notifications archives the user's visible rows instead of deleting them.
- Admin-created personalized or all-user broadcast messages are inserted through `POST /api/admin/notifications`.
- Paddle subscription lifecycle messages are inserted as `source = 'system'` notifications for Extra activation, renewal, cancellation, and failed renewal, with full capitalized month names in Romanian and Russian dates.

## Activity Tracking
- Authenticated sessions ping `/api/activity/ping`.
- Server updates `user_activity.last_seen_at`, throttled to 10 minutes.

## Account Deletion
- `/api/profile/delete` deletes the Supabase auth user.
- Related DB rows with cascade constraints are removed by Supabase/Postgres.

## Required Env
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `NEXT_PUBLIC_TELEGRAM_LOGIN_CLIENT_ID`
- `TELEGRAM_LOGIN_SECRET`

## Related Files
- `src/context/AuthContext.js`
- `src/components/AuthOptions.js`
- `src/components/LoginButton.js`
- `src/app/profile/page.js`
- `src/app/api/activity/ping/route.js`
- `src/app/api/profile/history/route.js`
- `src/app/api/profile/evaluation-snapshots/[id]/route.js`
- `src/app/api/profile/transactions/route.js`
- `src/app/api/profile/subscription/route.js`
- `src/app/api/profile/credits/route.js`
- `src/app/api/profile/delete/route.js`
- `src/app/api/notifications/route.js`
- `src/lib/system-notifications.js`
- `src/app/api/auth/telegram/route.js`
