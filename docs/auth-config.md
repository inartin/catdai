# Auth Config (Current Project)

Main app URL: `https://catdai.md`

## 1) Required (Google login)

### A. App env

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

### B. Supabase -> Authentication -> URL Configuration

- `Site URL` = `https://catdai.md`
- Add Redirect URL: `https://catdai.md/**`

Why: this app sends users back to the current page after OAuth, not only `/`.

### C. Google Cloud (OAuth app)

- Authorized JavaScript origin: `https://catdai.md`
- Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`

### D. Supabase -> Authentication -> Providers -> Google

- Enable Google
- Paste Google `Client ID` and `Client Secret`
- Save

## 2) Local testing (exact steps)

You keep one main URL (`https://catdai.md`) as `Site URL`.
For local testing, only add localhost to allowlists.

### A. Supabase allowlist (do not change Site URL)

In Supabase -> Authentication -> URL Configuration:
- Keep `Site URL` = `https://catdai.md`
- Add Redirect URL: `http://localhost:3000/**`

### B. Google OAuth app allowlist

In Google Cloud Console -> OAuth Client:
- Add Authorized JavaScript origin: `http://localhost:3000`
- Keep/add Authorized JavaScript origin: `https://catdai.md`
- Authorized redirect URI stays Supabase callback:
  - `https://<project-ref>.supabase.co/auth/v1/callback`

### C. Local env and run

Create/update `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Run:

```bash
pnpm dev
```

Open: `http://localhost:3000`

### D. Test flow

1. Click `Login` -> `Login with Gmail`.
2. Complete Google consent.
3. You should be redirected back to the same local page.
4. Open `Login` again:
   - success: you see your email + `Logout`
   - failure: error text appears in the dropdown

### E. Fast failure mapping

- `redirect_url_not_allowed`:
  add `http://localhost:3000/**` in Supabase Redirect URLs.
- `provider is not enabled`:
  Google provider is disabled or credentials are missing in Supabase.
- Google `redirect_uri_mismatch`:
  callback in Google app is not `https://<project-ref>.supabase.co/auth/v1/callback`.

## 3) Telegram (important reality)

As of **March 19, 2026**, Telegram is **not** an official Supabase Social Auth provider.
This is true in hosted docs and in the Auth server provider list.

So there is no Dashboard config like:
- "Enable Telegram"
- "Telegram client id/secret"

## 4) If you still want Telegram, exact options

### Option A (recommended): external IdP + Supabase Third-party Auth

- Use an IdP that supports Telegram login (for example Auth0 or Clerk setup on your side).
- In Supabase Dashboard -> Authentication -> Third-party Auth, add that IdP integration.
- Ensure JWTs include `role: authenticated` as required by Supabase RLS.
- App must use the IdP SDK login flow for Telegram and pass that access token to Supabase client.

### Option B: do not offer Telegram button

- Keep only Gmail login until Telegram IdP integration is implemented.
- This avoids a broken Telegram login path.
