# Access And Paywall

## Stage
Preview paywall implemented. Paynet database schema and backend payment routes are prepared.

## Current Access Rule
- Anonymous users are `free`.
- Any authenticated Supabase user is currently returned as `paid`.
- `user_entitlements` schema exists, but `resolveAccessTier()` does not read it yet.
- `db/paynet_payments.sql` prepares the simplified Paynet MVP schema: payment orders, Paynet notifications, aggregate user feature credits, and idempotent feature usage events.
- `POST /api/payments/paynet/create` and `POST /api/paynet/notifications` create Paynet orders and grant credits after verified paid notifications.
- Current app access logic does not read the Paynet credit tables yet, and no frontend checkout UI is connected yet.

## Result Payload
Estimate results return the same valuation numbers for anonymous and authenticated users:
- fast sale, market, and premium prices
- numeric range
- market stats
- district comparison values
- market position numbers
- seller breakdown values

UI renders these values directly. There is no blur, tooltip, lock marker, or fake numeric placeholder on estimate result numbers.
`src/components/BlurWall.js` keeps the reusable blur-wall presentation available for future paywall variants.

## Paid Payload
Paid users receive the full estimate response.
Cadastral lookup is login-gated: authenticated users receive full extracted apartment/building details, while anonymous users get the shared auth popup in the UI and `401 unauthorized` from the cadastral APIs.
PDF export dialogs are visible to anonymous users, but downloading a PDF requires a valid authenticated Supabase bearer token checked by `/api/pdf-generation-authorizations`.

## Share Exception
If a shared link was created by a paid user, `/api/estimate` allows full result access through `share_slug`.

## Related Files
- `src/lib/access-tier.js`
- `src/app/api/estimate/route.js`
- `src/app/api/cadastral/route.js`
- `src/components/EstimateResult.js`
- `src/components/BlurWall.js`
- `db/user_entitlements.sql`
- `db/paynet_payments.sql`
- `src/app/api/payments/paynet/create/route.js`
- `src/app/api/paynet/notifications/route.js`
- `src/lib/paynet.js`
- `src/lib/paynet-products.js`
