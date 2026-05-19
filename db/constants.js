export const TELEGRAM_ALERTS_BOT_HANDLE = "catdai_alert_bot";
export const TELEGRAM_ALERTS_BOT_URL = `https://t.me/${TELEGRAM_ALERTS_BOT_HANDLE}`;

function normalizeTelegramAlertsLang(lang) {
  const value = String(lang || "").trim().toLowerCase();
  return value === "ru" ? "ru" : "ro";
}

function toBase64Url(value) {
  const text = String(value || "");

  if (typeof btoa === "function" && typeof TextEncoder !== "undefined") {
    const bytes = new TextEncoder().encode(text);
    let binary = "";

    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }

    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(text, "utf8").toString("base64url");
  }

  throw new Error("Base64url encoding is not available.");
}

export function buildTelegramAlertsStartPayload(token, lang) {
  const safeToken = String(token || "").trim();
  const safeLang = normalizeTelegramAlertsLang(lang);
  return toBase64Url(`${safeToken}${safeLang}`);
}

export function buildTelegramAlertsStartUrl(token, lang) {
  return `${TELEGRAM_ALERTS_BOT_URL}?start=${encodeURIComponent(buildTelegramAlertsStartPayload(token, lang))}`;
}
