# Paynet Implementation Plan

## Scope
- Integrate Paynet for one-time payments only.
- Use Supabase users as the identity source; do not create guest payment access in the first version.
- Do not store card data. Paynet owns card/payment instrument entry.
- Payment success must be granted only after a verified Paynet notification or a server-side Paynet status check confirms paid status.

## Recommended Integration Model
Use Paynet **Server-Server** integration.

Why this fits CatDai:
- The app is a Next.js server app with API routes that can safely hold Paynet credentials.
- Orders and user credit grants need to be created on the backend before redirecting the user.
- Server-Server does not require signing the full payment payload in the browser.
- Paynet returns a `PaymentId` and `Signature`; the browser only needs these redirect fields for the Paynet payment form.

Do not use:
- **Client-Server** for this app. It posts the full payment payload from the client to Paynet and relies on payment-data signing. It is less suitable for user-linked paid credits and backend order reconciliation.
- **Plugin** integration. The app is not a CMS/shop platform.

## Paynet Flow
1. User must be logged in.
2. User chooses a one-time product from pricing or a paid feature prompt.
3. Backend creates an internal pending payment order with a numeric invoice id.
4. Backend authenticates to Paynet:
   - `POST /auth`
   - body is form-encoded with `grant_type=password`, merchant username/password, and the merchant/sale-area data required by Paynet.
5. Backend registers the payment:
   - `POST /api/Payments/Send`
   - body contains `Invoice`, `MerchantCode`, customer data, `Currency: 498`, expiry, services/products, and language.
6. Paynet returns `PaymentId` and `Signature`.
7. Browser is redirected by POST form to Paynet:
   - test UI path from docs: `/acquiring/getecom`
   - fields: `operation`, `LinkUrlSucces`, `LinkUrlCancel`, `ExpiryDate`, `Signature`, `Lang`
8. User pays on Paynet.
9. Paynet sends a paid notification to the configured CatDai notification URL.
10. Backend verifies the notification hash, checks order/payment/amount, marks the order paid, and grants the purchased credits once.
11. Success/cancel pages only show status and can trigger reconciliation; they must not grant access by themselves.

## Important Paynet Details
- Currency is Moldovan leu, ISO numeric code `498`.
- Amounts are integer minor units: `12.01 MDL` is sent as `1201`.
- Product quantity is also integer-based in examples: quantity `100` means one unit.
- Paynet payment status values in the docs:
  - `1` registered
  - `2` customer verified
  - `3` initialized to be paid
  - `4` paid
- Paid notifications have `EventType: "Paid"`.
- Notifications include a `Hash` header. The signed string is:
  `EventDate + Eventid + EventType + Payment.Amount + Payment.Customer + Payment.ExternalID + Payment.ID + Payment.Merchant + Payment.StatusDate + secretKey`
- The Paynet docs show both `LinkUrlSuccess` and `LinkUrlSucces`. The redirect examples use `LinkUrlSucces`; implementation should test the exact spelling with Paynet.
- The docs contain older and newer host examples. Confirm the production API and acquiring hosts with Paynet before implementation.

## Required Environment
Add server-side env vars:

```env
PAYNET_API_BASE_URL=https://api-merchant.test.paynet.md
PAYNET_ACQUIRING_BASE_URL=https://test.paynet.md
PAYNET_MERCHANT_CODE=
PAYNET_SALE_AREA_CODE=
PAYNET_MERCHANT_USER=
PAYNET_MERCHANT_PASSWORD=
PAYNET_SECRET_KEY=
PAYNET_NOTIFICATION_URL=https://catdai.md/api/paynet/notifications
PAYNET_SUCCESS_URL=https://catdai.md/payment/paynet/success
PAYNET_CANCEL_URL=https://catdai.md/payment/paynet/cancel
```

The backend routes currently require `PAYNET_MERCHANT_CODE`, `PAYNET_MERCHANT_USER`, `PAYNET_MERCHANT_PASSWORD`, and `PAYNET_SECRET_KEY`. `PAYNET_API_BASE_URL` and `PAYNET_ACQUIRING_BASE_URL` default to test hosts when omitted. `PAYNET_SALE_AREA_CODE` is sent only to Paynet auth when configured. `PAYNET_NOTIFICATION_URL` must be configured in Paynet. Success/cancel URLs are currently built from the app URL and route paths until the frontend pages are added.

Production values must come from Paynet, not from the test docs. Paynet credentials must stay server-only.

## Products To Sell
Use one-time orders. No subscriptions and no recurring token storage.

Initial product keys should match the current pricing UI:
- `standard_pack`: 99 MDL by current default; grants 2 uses per paid feature.
- `pro_pack`: 199 MDL by current default; grants 10 uses per paid feature.
- `extra_pack`: 499 MDL by current default; current UI shows 50 uses per feature but also says one month. Resolve this before implementation.
- `listing_analysis_single`: 29 MDL.
- `cadastru_lookup_single`: 19 MDL.
- `yield_calculator_single`: 29 MDL.
- `pdf_report_single`: 29 MDL.

Feature keys:
- `sale_estimate`
- `rent_estimate`
- `listing_analysis`
- `cadastru_lookup`
- `yield_calculator`
- `pdf_report`

## Database Plan
Created `db/paynet_payments.sql`.

### Done
- Added the simplified MVP payment schema with 4 tables:
  - `payment_orders`
  - `paynet_notifications`
  - `user_feature_credits`
  - `user_feature_usage_events`
- Added RPC helpers:
  - `grant_user_feature_credits(user_id, feature_key, uses_count)`
  - `grant_payment_order_feature_credits(order_id, feature_key, uses_count)`
  - `complete_paynet_payment(invoice_no, paynet_payment_id, amount_minor, paynet_status, payload, paid_at)`
  - `consume_user_feature_credit(user_id, feature_key, idempotency_key, metadata)`
- Enabled RLS and revoked direct `anon` / `authenticated` access for all payment and credit tables.
- Granted table and RPC access to `service_role`; app API routes must enforce user auth before using these tables.
- Kept product config and product-to-credit mapping out of the DB for the first implementation. Shared product grants now live in `src/lib/payment-products.js`, with Paynet-specific request formatting in `src/lib/paynet-products.js`.
- Excluded `extra_pack` from checkout-eligible product keys until we clarify whether it means 50 uses per feature, one-month access, or both.
- Supabase migration was run manually.
- Added backend-only Paynet flow:
  - `src/lib/paynet.js`
  - `src/lib/paynet-products.js`
  - `POST /api/payments/paynet/create`
  - `POST /api/paynet/notifications`

No frontend checkout UI has been added yet.

### `payment_orders`
Stores one Paynet checkout attempt.

Core columns:
- `id uuid primary key`
- `invoice_no bigint generated by identity unique not null`
- `user_id uuid references auth.users(id) on delete set null`
- `product_key text not null`
- `amount_minor int not null`
- `currency int not null default 498`
- `status text not null` with values `pending`, `registered`, `paid`, `canceled`, `expired`, `failed`
- `paynet_payment_id bigint unique`
- `paynet_status int`
- `paynet_signature text`
- `paynet_registered_at timestamptz`
- `paid_at timestamptz`
- `credit_grants jsonb`
- `canceled_at timestamptz`
- `expires_at timestamptz`
- `language text`
- `customer_snapshot jsonb`
- `request_payload jsonb`
- `response_payload jsonb`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:
- `(user_id, created_at desc)`
- `(status, created_at desc)`
- `(invoice_no)`
- `(paynet_payment_id)`

Allowed MVP product keys:
- `standard_pack`
- `pro_pack`
- `listing_analysis_single`
- `cadastru_lookup_single`
- `yield_calculator_single`
- `pdf_report_single`

### `paynet_notifications`
Stores every Paynet callback for audit and idempotency.

Core columns:
- `id bigserial primary key`
- `event_id bigint unique`
- `event_type text`
- `event_date timestamptz`
- `order_id uuid references payment_orders(id)`
- `paynet_payment_id bigint`
- `invoice_no bigint`
- `merchant_code text`
- `payment_customer text`
- `amount_minor int`
- `hash_header text`
- `hash_valid boolean not null default false`
- `payload jsonb not null`
- `processed_at timestamptz`
- `processing_error text`
- `created_at timestamptz default now()`

### `user_feature_credits`
Stores aggregate purchased credits per user and feature.

Core columns:
- `user_id uuid references auth.users(id) on delete cascade`
- `feature_key text not null`
- `remaining_uses int not null default 0`
- `total_granted int not null default 0`
- `total_used int not null default 0`
- primary key `(user_id, feature_key)`
- `updated_at timestamptz default now()`
- `created_at timestamptz default now()`

### `user_feature_usage_events`
Stores every paid or free consumption event and prevents duplicate charging.

Core columns:
- `id uuid primary key`
- `user_id uuid references auth.users(id) on delete cascade`
- `feature_key text not null`
- `source_order_id uuid references payment_orders(id) on delete set null`
- `source text not null` with values `free_monthly`, `paid_credit`, `admin_adjustment`
- `idempotency_key text not null`
- `metadata jsonb`
- `created_at timestamptz default now()`
- unique `(user_id, feature_key, idempotency_key)`

Use this table to count the free monthly sale/rent allowance and to avoid charging refreshes, retries, callback duplicates, or cached API reads.

### Existing `user_entitlements`
The current `user_entitlements` table is too coarse for one-time feature credits because it only stores `tier` and `expires_at`.

Plan:
- Keep it temporarily for compatibility if needed.
- Move real access decisions to `user_feature_credits` and `user_feature_usage_events`.
- Later remove or turn `user_entitlements` into a derived compatibility view only if no route needs broad `paid/free` tier checks.

## Access And Consumption Rules
- Replace the temporary rule “any authenticated user is paid” with real feature access.
- Authenticated identity and paid access should be separate concepts.
- Consumption should happen only after the app has enough validated input to complete the requested action.
- Do not consume credits on page refresh, cached result reload, or success-page polling.
- Use request-level idempotency keys for each billable user action:
  - valuation result id or evaluation group id for sale/rent
  - listing id/url hash for 999 analysis
  - normalized cadastru number/address search id for cadastru
  - calculator result event id for yield calculator
  - PDF generation event id for PDF reports

## Backend API Routes
- `POST /api/payments/paynet/create`
  - requires Supabase bearer token
  - creates `payment_orders`
  - registers payment with Paynet
  - returns redirect form fields
  - accepts JSON with `product_key`, optional `lang`, optional `customer`, optional relative `success_path`, and optional relative `cancel_path`
  - rate limited to 10 attempts per minute by client IP
- `POST /api/paynet/notifications`
  - public endpoint configured in Paynet
  - verifies `Hash`
  - stores notification
  - applies paid order idempotently

## Routes To Add Later
- `GET /payment/paynet/success`
  - user-facing status page
  - calls server reconciliation if notification has not arrived yet
- `GET /payment/paynet/cancel`
  - user-facing canceled/pending page
- Optional admin route:
  - reconcile an order by calling Paynet `GET /api/Payments/{PaymentId}`

## Idempotency And Safety
- Grant credits in a single database RPC/function so duplicate notifications cannot double-grant.
- Match Paynet notification against the stored order by `Payment.ID`, `ExternalID`/invoice, merchant, and amount.
- Treat redirects as untrusted.
- Store raw Paynet payloads for support/debugging, but never log secrets.
- If notification verification fails, store the callback with `processing_error` and return non-success.
- Insert notifications before completing the order, mark `processed_at` only after order completion and credit grants succeed, and allow retries for unprocessed duplicate `event_id` callbacks.
- If a paid notification arrives before the order update completes, reconcile by invoice/payment id.

## Compliance Work
Paynet compliance docs require these before production:
- payment method logos on the homepage or checkout
- clear payment, cancellation, refund, and return terms
- customer information fields before payment when required
- transaction confirmation message before payment
- mandatory checkbox confirming the user accepted Terms and Conditions before paying
- legal company name and legal address in Moldova on the site
- support contact and working hours
- Terms and Privacy links in the footer
- consistent information in every site language

Current gap:
- `terms` now covers one-time paid digital products, Paynet/processor-owned card entry, activation only after verified payment, mandatory Terms acceptance before payment, canceled/unconfirmed payment handling, refund review for duplicate/failed/non-delivered access cases, support contact, support hours, and an explicit no-financial-advice disclaimer for investment, mortgage/credit, trading, and property buy/sell decisions.
- `privacy` now covers account data, payment/order metadata, processor disclosure, no CatDai card-data storage, transaction retention, and payment support.
- `refund` now covers digital-product delivery, refund eligibility, common refusal cases, request steps, and processing timing.
- Production legal company name and legal address still need final business text.
- Checkout UI still needs the Terms acceptance checkbox, transaction confirmation message, and customer information fields when required by Paynet.

## Testing Plan
1. Add Paynet test env values locally.
2. Create a test order from a logged-in user.
3. Confirm Paynet auth token retrieval.
4. Confirm payment registration returns `PaymentId` and `Signature`.
5. Confirm browser POST redirect opens Paynet checkout.
6. Pay with Paynet test card from the official docs.
7. Confirm notification arrives at `/api/paynet/notifications`.
8. Confirm invalid notification hash is rejected.
9. Confirm duplicate notification does not duplicate credits.
10. Confirm success page shows paid status after notification.
11. Confirm success page can reconcile by Paynet status if notification is delayed.
12. Confirm canceled payment grants nothing.
13. Confirm purchased credits are consumed once per billable action.

## Open Questions
- Should checkout require login, or should guest checkout be supported later?
- Should `extra_pack` be 50 uses per feature, one month unlimited, or 50 uses that expire after one month?
- Which cadastru calls are paid: only `/cadastru` searches, or also valuation/PDF cadastral lookups?
- Should sale/rent free monthly limits apply only to authenticated users, or also anonymous users by device/session?
- What exact legal company name, legal address, support phone/email, and support hours should be shown for Paynet compliance?
- What production API host and acquiring host did Paynet assign to CatDai?
