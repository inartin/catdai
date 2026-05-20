# Auth And Profile

## Stage
Implemented and active.

## Login
- Supabase OAuth is used.
- UI currently exposes Google and Facebook login.
- Redirect returns to the current page.
- OAuth params are stripped from the URL after session sync.

## Profile
`/profile` shows:
- user avatar/name/email
- logout
- favorites
- listing alerts
- Telegram connection controls
- account deletion

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

## Related Files
- `src/context/AuthContext.js`
- `src/components/AuthOptions.js`
- `src/components/LoginButton.js`
- `src/app/profile/page.js`
- `src/app/api/activity/ping/route.js`
- `src/app/api/profile/delete/route.js`
