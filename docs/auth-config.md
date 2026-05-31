# Auth Config

Main app URL: `https://catdai.md`

## Stage
Implemented for Google and Facebook OAuth.

## Required Env

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_KEY=<service-role-key>
```

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

## Local Run

```bash
pnpm dev
```

Open: `http://localhost:3000`

## Test Flow

1. Click `Login`.
2. Choose Google or Facebook.
3. Complete provider consent.
4. User should return to the same page.
5. Login button should become profile link.

## Fast Failure Map

- `redirect_url_not_allowed`: add the current origin to Supabase Redirect URLs.
- `provider is not enabled`: enable/configure provider in Supabase.
- `redirect_uri_mismatch`: provider callback must be Supabase `/auth/v1/callback`.

## Telegram

- Telegram is not used as Supabase login.
- Telegram is linked from profile for alert delivery.
- Requires `TELEGRAM_LINK_SECRET`.
- See `docs/telegram-linking.md`.
