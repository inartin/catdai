# Telegram Linking

## Stage
Account linking implemented. Alert delivery depends on an external bot/worker.

## Flow
- Profile creates a short-lived link token through `/api/telegram-link`.
- User opens `t.me/catdai_alert_bot?start=...`.
- Bot calls `/api/telegram-link/claim` with `x-catdai-telegram-secret`.
- Server stores one Telegram connection per user.
- Disconnect removes the connection and disables Telegram on that user's alerts.

## Security
- Link tokens are hashed in DB.
- Tokens expire after 15 minutes.
- Claim endpoint requires `TELEGRAM_LINK_SECRET`.
- A Telegram account cannot be linked to multiple users.

## Related Files
- `src/app/api/telegram-link/route.js`
- `src/app/api/telegram-link/claim/route.js`
- `src/app/api/telegram-link/disconnect/route.js`
- `src/lib/telegram-link-secret.js`
- `db/user_telegram_connections.sql`
- `db/constants.js`
