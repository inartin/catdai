export const TELEGRAM_ALERTS_BOT_HANDLE = "catdai_alert_bot";
export const TELEGRAM_ALERTS_BOT_URL = `https://t.me/${TELEGRAM_ALERTS_BOT_HANDLE}`;

export function buildTelegramAlertsStartUrl(token) {
  return `${TELEGRAM_ALERTS_BOT_URL}?start=${encodeURIComponent(String(token || "").trim())}`;
}
