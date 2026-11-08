# Feedback Widget

## Stage
Feedback widget for registered users; private result reviews also accept anonymous checkout buyers.

## Result Reviews
- A small, dismissible card appears at the bottom of a successfully loaded paid result (Cadastru, sale/rent evaluation, listing analysis or yield calculator). Checkout, payment confirmation, locked/free results, failures and shared reports do not prompt for a review.
- A rating from one to five stars is required. Selecting a rating reveals a comment field (optional, up to 500 characters) and an explicit send button. Submission confirms inline; there is no popup or public review display.
- Dismissing or submitting suppresses future prompts for that user across results and devices. Browser storage also remembers the choice immediately. A guest's response continues to suppress prompts after their purchases are claimed by a registered account. Guest buyers use their existing anonymous checkout session and never need to register or supply contact details.
- Result APIs attach `review_usage_id` only for a consumed `paid_credit` usage event. `GET /api/result-reviews?usage_id=...` returns eligibility only; `POST /api/result-reviews` validates the session, owned paid usage, stars/comment and first-response uniqueness. Browser roles cannot read or write the storage table directly.
- `/admin/feedback` has a separate **Result reviews** section with the latest 100 submitted ratings, optional comments, feature, date and user/anonymous visitor details. Dismissals are excluded; existing feedback and bug reports retain their own section and delete action.
- Review contacts show the receipt email from the MAIB order linked to the reviewed usage event, including anonymous buyers and purchases later claimed by an account. Registered reviewers also show their account name, with account email as a labeled fallback when no checkout email exists. Missing historical email is shown as unavailable; contacts remain restricted to the admin API.
- Cadastru reviews expand on demand through admin-only `GET /api/admin/feedback/[id]/cadastru`: payment details, reviewed search and the shared `CadastralDataCard` show the same customer-facing labels, units and registry text in the admin's current language. An **All saved fields** disclosure retains every additional snapshot field. The report comes only from the linked single-Cadastru MAIB checkout snapshot with a matching usage key, including after guest ownership transfer. Missing or unrelated snapshots show an explicit unavailable state; no current property lookup is substituted. This is the report saved at checkout, not proof of the exact later browser rendering: newer registry data and separately loaded nearby places, transport, complaints and listings are not historically captured. Other review features have no report expansion.
- Older address snapshots with flat `apartment_area_m2`, `apartment_floor`, `apartment_type` and `estimated_value_lei` are adapted for the card without overwriting existing nested values. The original fields remain intact under **All saved fields**; missing apartment/building facts are never recovered from current records.
- Migration `supabase/migrations/20261104192647_result_reviews.sql` was applied to the shared CatDai database on 4 November 2026. It adds private `result_reviews` storage, one response per session owner and indexes for the admin list and claimed guest lookup. RLS, browser-role access restrictions and rolled-back insert/validation checks were verified. The local filename matches the applied migration history; application deployment remains separate.
- Verification: `pnpm exec node --experimental-vm-modules scripts/test-result-reviews.mjs`.

## User Flow
- Authenticated users see a floating feedback button in the app shell.
- Opening it shows beta feedback copy, a required multiline message, and an optional image upload.
- The pricing page custom-request modal reuses `POST /api/feedback` and stores the request as a feedback message with email and optional phone in the message body.
- Message input is capped at 500 characters in the browser and API.
- Images are optional and limited to JPEG, PNG, WebP, or GIF up to 2 MB.
- Successful submission clears the form and shows a thank-you message.

## Backend
- `POST /api/feedback` accepts a valid Supabase bearer token; unauthenticated submissions are limited to `pricing_custom_request` payloads with a contact email and no image upload.
- The route rate limits submissions per IP, sanitizes control characters from text, validates image type/size/data, and writes to `user_feedback`.
- Uploaded images are stored as base64 text in the feedback row for the first beta version.
- Admins can view latest feedback at `/admin/feedback` through `/api/admin/feedback` and delete individual feedback rows after a browser confirmation.

## Schema
- `db/user_feedback.sql` creates `user_feedback` with optional `user_id`, `message`, optional contact email/phone, optional image metadata/data, status, timestamps, indexes, and RLS policies.

## Related Files
- `src/components/FeedbackWidget.js`
- `src/app/api/feedback/route.js`
- `src/app/admin/feedback/page.js`
- `src/app/api/admin/feedback/route.js`
- `src/components/icons/FeedbackIcon.js`
- `db/user_feedback.sql`
- `src/components/ResultReviewCard.js`
- `src/lib/result-reviews.js`
- `src/app/api/result-reviews/route.js`
