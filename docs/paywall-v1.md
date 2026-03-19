# Paywall V1

## Goal
Show a useful preview for everyone, but keep paid values secure.

## How It Works
1. Frontend calls `/api/estimate` and `/api/cadastral`.
2. Backend resolves access tier from:
   - `Authorization: Bearer <supabase access token>`
   - `user_entitlements` table in Supabase
3. Backend returns one of two payloads:
   - `paid`: full data
   - `free`: preview-only data + `locked_sections`
4. UI uses `locked_sections` to render blurred placeholders.

Important: blur is only visual. Security is enforced by the backend payload shape.

## Free (Public) Data
- Result header ("Analiza Pieții")
- Main estimate block:
  - `Nivel de preț estimat în piață`
  - `Preț de piață`
  - `price_per_m2`
- Cadastral:
  - full address
  - `Suprafață`
  - `Etaj` (including total floors when available)
- "Cum am analizat piața" section
- Market position graph + arrow (without real numbers)

## Locked (Paid) Data
- `Vânzare rapidă` value and percent
- `Preț țintă (optimist)` value and percent
- Cadastral detailed values (shown as blurred placeholders in free tier)
- Market position numeric labels/range
- District comparison numeric values
- Market statistics numeric values

## Why Data Is Safe
- Locked values are not sent to free users at all.
- Frontend no longer passes raw cadastral JSON in URL query params (only `cadastral_number`).
- If entitlement is missing/invalid, backend safely falls back to `free`.
- Paid data is returned only when backend confirms user entitlement.

