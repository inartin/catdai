# Paynet Status

## Decision
Paynet is not used whatsoever for CatDai payments right now.

Paddle is the only payment processor to use for checkout, payment status, and payment webhooks.

## Current Code State
- `POST /api/payments/paynet/create` is disabled and returns `410 paynet_disabled`.
- `POST /api/paynet/notifications` is disabled and returns `410`.
- Paynet must not be linked from pricing, checkout, legal copy, footer payment logos, or product flows.
- Old Paynet helper files may remain in the codebase for now, but they are dormant and should not be imported by active checkout code.

## Shared Credit Schema
`db/paynet_payments.sql` still contains shared credit tables/helpers that the app uses outside Paynet:
- `user_feature_credits`
- `user_feature_usage_events`
- `grant_user_feature_credits(...)`
- `consume_user_feature_credit(...)`
- `consume_free_monthly_feature_usage(...)`

Paddle grants still reuse the shared credit helpers, so do not delete that schema without first moving the shared credit definitions into a neutral migration.

## Active Payment Docs
Use `docs/paddle-payments.md` for the current payment implementation.
