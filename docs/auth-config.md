# Auth Config

Main app URL: `https://catdai.md`

## Stage
Implemented for Google, Facebook, and Telegram login.

Telegram login uses Telegram's current OAuth popup to get an ID token, verifies that token on the app backend, then signs the user into Supabase with an app-managed Telegram account. Do not use Supabase's hosted Telegram OIDC callback here because Telegram's OIDC discovery has no UserInfo endpoint and Supabase can fail with `Error getting user profile from external provider`. Do not pass Telegram popup ID tokens directly to Supabase `signInWithIdToken`; Supabase can reject those tokens as `Bad ID token`.

## Required Env

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>
NEXT_PUBLIC_TELEGRAM_LOGIN_CLIENT_ID=<telegram-client-id>
TELEGRAM_LOGIN_SECRET=<random-login-password-secret>
```

`TELEGRAM_LOGIN_SECRET` is required for deterministic app-managed Supabase passwords and must stay unchanged after users sign in.

## Supabase URL Config

- `Site URL` = `https://catdai.md`
- Redirect URLs:
  - `https://catdai.md/**`
  - `http://localhost:3000/**` for local testing

Reason: the app redirects users back to the current page after OAuth.

## Provider Config

Google:
- Authorized JavaScript origin: `https://catdai.md`
- Local origin: `http://localhost:3000`
- Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
- Enable Google in Supabase Auth providers.

Facebook:
- Add equivalent production/local app domains in Meta developer settings.
- Production domain verification uses the global `<meta name="facebook-domain-verification" content="5q4tw3otwv1kyuh0x17nz22eetdvzy" />` tag in `src/app/layout.js`.
- Supabase callback URI is still `https://<project-ref>.supabase.co/auth/v1/callback`.
- Enable Facebook in Supabase Auth providers.

Telegram:
- In Telegram BotFather, open the bot's `Bot Settings` -> `Web Login`, add `https://catdai.md` for production and the current HTTPS ngrok origin for local testing.
- Set `NEXT_PUBLIC_TELEGRAM_LOGIN_CLIENT_ID` to the Telegram Client ID from BotFather.
- Set `TELEGRAM_LOGIN_SECRET` to a stable random secret and keep it unchanged after users sign in.
- In Supabase Dashboard, no Telegram provider is required. The app creates/signs app-managed Supabase users with email pattern `telegram-<id>@auth.catdai.md`.

## Local Run

```bash
pnpm dev
```

Open: `http://localhost:3000`

## Test Flow

1. Click `Login`.
2. Choose Google, Facebook, or Telegram.
3. Complete provider consent.
4. User should return to the same page.
5. Login button should become profile link.

## Fast Failure Map

- `redirect_url_not_allowed`: add the current origin to Supabase Redirect URLs.
- `provider is not enabled`: enable/configure provider in Supabase for Google or Facebook.
- `redirect_uri_mismatch`: provider callback must be Supabase `/auth/v1/callback`.
- Telegram `Bad ID token`: the frontend is passing Telegram's popup ID token directly to Supabase; send it to `/api/auth/telegram` instead.
- Telegram `Error getting user profile from external provider`: Supabase hosted OIDC callback is still being used; the app should call `/api/auth/telegram` instead.
- Telegram `deprecated`: the old `telegram.org/js/telegram-widget.js` flow is being used; use `oauth.telegram.org/js/telegram-login.js?5`.

## Telegram

- Telegram is used as Supabase login through the app callback at `/api/auth/telegram`.
- Telegram is also linked from profile for alert delivery.
- Requires `TELEGRAM_LINK_SECRET`.
- See `docs/telegram-linking.md`.
