# Access And Paywall

## Stage
Preview paywall implemented. Real payments not implemented.

## Current Access Rule
- Anonymous users are `free`.
- Any authenticated Supabase user is currently returned as `paid`.
- `user_entitlements` schema exists, but `resolveAccessTier()` does not read it yet.

## Free Payload
The backend removes locked values before returning data:
- fast sale and premium prices
- numeric range
- detailed market stats
- district comparison values
- market position numbers
- seller breakdown values
- cadastral detail fields

UI renders locked placeholders from `locked_sections`.

## Paid Payload
Paid users receive the full estimate and cadastral response.

## Share Exception
If a shared link was created by a paid user, `/api/estimate` allows full result access through `share_slug`.

## Related Files
- `src/lib/access-tier.js`
- `src/app/api/estimate/route.js`
- `src/app/api/cadastral/route.js`
- `src/components/EstimateResult.js`
- `db/user_entitlements.sql`
