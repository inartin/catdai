// Browser identifiers are analytics hints, never authentication or authorization.
export function normalizeVisitorId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase() : null;
}

export function getRequestVisitor(request) {
  const headers = request?.headers;
  const cookieId = headers?.get("cookie")?.match(/(?:^|;\s*)catdai-device-id=([^;]*)/)?.[1];
  const deviceId = normalizeVisitorId(headers?.get("x-catdai-device-id")) || normalizeVisitorId(cookieId);
  const ua = (headers?.get("user-agent") || "").slice(0, 1024);
  const ipad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile\//i.test(ua));
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPod|iPad/i.test(ua) || ipad ? "iOS"
    : /Windows/i.test(ua) ? "Windows" : /CrOS/i.test(ua) ? "ChromeOS"
      : /Macintosh|Mac OS X/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : null;
  const bot = /bot\b|crawler|spider|HeadlessChrome/i.test(ua);
  const type = bot ? "Bot" : ipad || /Tablet|Android(?!.*Mobile)/i.test(ua) ? "Tablet"
    : /Mobile|iPhone|iPod/i.test(ua) || headers?.get("sec-ch-ua-mobile") === "?1" ? "Mobile"
      : os ? "Desktop" : null;
  const browser = /Edg(?:e|A|iOS)?\//i.test(ua) ? "Edge" : /OPR\/|Opera|OPiOS\//i.test(ua) ? "Opera"
    : /SamsungBrowser\//i.test(ua) ? "Samsung Internet" : /Firefox\/|FxiOS\//i.test(ua) ? "Firefox"
      : /Chrome\/|CriOS\//i.test(ua) ? "Chrome" : /Safari\//i.test(ua) ? "Safari" : null;
  return { device_id: deviceId, device_type: type, os, browser };
}
