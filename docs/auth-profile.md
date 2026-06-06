# Auth And Profile

## Stage
Implemented and active.

## Login
- Supabase OAuth is used.
- UI currently exposes Google and Telegram login.
- Telegram login uses Telegram's current OAuth popup ID token through `/api/auth/telegram`, then signs the browser into Supabase with an app-managed Telegram account.
- Telegram does not use Supabase's hosted OIDC callback because Telegram lacks a UserInfo endpoint and that callback can fail with `Error getting user profile from external provider`.
- Telegram direct OIDC popup ID tokens are not passed to `signInWithIdToken` because those can fail with `Bad ID token`.
- Redirect returns to the current page.
- OAuth params are stripped from the URL after session sync.
- The auth cleanup only strips `type` when other OAuth callback params are present, so app URLs such as `/evaluare?type=rent` keep their valuation mode on refresh.

## Profile
`/profile` shows:
- user avatar/name/email
- Telegram app-managed placeholder emails like `telegram-<id>@auth.catdai.md` are hidden; Telegram username is shown when available.
- logout
- favorites
- listing alerts
- closed `Setări` panel with Telegram connection controls and account deletion; Telegram status is fetched once with the profile page, not every time the panel opens
- localized browser title from `nav.profile`

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
- `src/app/api/profile/delete/route.js`
- `src/app/api/auth/telegram/route.js`
