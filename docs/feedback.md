# Feedback Widget

## Stage
Implemented for registered users.

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
