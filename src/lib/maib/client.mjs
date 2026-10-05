import crypto from "node:crypto";

export function environment() {
  const value = process.env.MAIB_ENVIRONMENT || "sandbox";
  if (!["sandbox", "production"].includes(value)) throw new Error("Invalid MAIB_ENVIRONMENT");
  return value;
}

export function apiBase() {
  return environment() === "production" ? "https://api.maibmerchants.md" : "https://sandbox.maibmerchants.md";
}

export function safeReturnTo(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x1f]/.test(value)) return "/profile";
  try {
    const url = new URL(value, "https://catdai.local");
    return url.origin === "https://catdai.local" ? `${url.pathname}${url.search}${url.hash}` : "/profile";
  } catch { return "/profile"; }
}

export function minorUnits(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid MAIB amount");
  const minor = Math.round(value * 100);
  if (!Number.isSafeInteger(minor) || Math.abs(minor / 100 - value) > 0.000001) throw new Error("Invalid MAIB precision");
  return minor;
}

export function validSignature(raw, headers, now = Date.now()) {
  const key = process.env.MAIB_SIGNATURE_KEY;
  const timestamp = headers.get("x-signature-timestamp") || "";
  const signature = headers.get("x-signature") || "";
  if (!key || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 300_000) return false;
  if (!/^sha256=[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = crypto.createHmac("sha256", key).update(raw).update(`.${timestamp}`).digest();
  const received = Buffer.from(signature.slice(7), "base64");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

let cachedToken;
let pendingToken;
async function token() {
  const clientId = process.env.MAIB_CLIENT_ID;
  const clientSecret = process.env.MAIB_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("MAIB credentials are missing");
  const cacheKey = `${apiBase()}:${clientId}`;
  if (cachedToken?.key === cacheKey && cachedToken.until > Date.now()) return cachedToken.value;
  if (!pendingToken) {
    pendingToken = (async () => {
      const result = await send("/v2/auth/token", { method: "POST", body: { clientId, clientSecret } });
      if (!result?.accessToken || !(result.expiresIn > 0)) throw new Error("Invalid MAIB authentication response");
      const value = `${result.tokenType || "Bearer"} ${result.accessToken}`;
      cachedToken = { key: cacheKey, value, until: Date.now() + Math.max(0, result.expiresIn - 30) * 1000 };
      return value;
    })().finally(() => { pendingToken = null; });
  }
  return pendingToken;
}

async function send(path, { method = "GET", body, authorization } = {}) {
  const response = await fetch(`${apiBase()}${path}`, {
    method, cache: "no-store", signal: AbortSignal.timeout(15_000),
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(authorization ? { Authorization: authorization } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || !payload.result) {
    const error = new Error(`MAIB request failed (${response.status})`);
    error.status = response.status;
    // A structured 4xx is a definitive rejection; network errors/5xx are ambiguous.
    error.definitive = response.status >= 400 && response.status < 500 && !!payload;
    throw error;
  }
  return payload.result;
}

export async function maibRequest(path, options = {}) {
  const authorization = await token();
  try { return await send(path, { ...options, authorization }); }
  catch (error) {
    if (error.status !== 401) throw error;
    cachedToken = null;
    // An explicit unauthorized response did not execute the operation.
    return send(path, { ...options, authorization: await token() });
  }
}

export function validateCheckoutUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || ![
    "checkout.maib.md", "checkout-sandbox.maib.md",
  ].includes(url.hostname)) throw new Error("Unexpected MAIB checkout URL");
  return url.toString();
}

export function validatePayment(order, payment) {
  if (order.environment !== environment() || payment.orderId !== order.id ||
      payment.currency !== order.currency_code || minorUnits(payment.amount) !== order.amount_minor ||
      !/^[\da-f]{8}-[\da-f-]{27}$/i.test(payment.paymentId || "") ||
      (order.payment_id && payment.paymentId !== order.payment_id)) throw new Error("MAIB payment does not match order");
  return payment;
}
