import crypto from "node:crypto";

const DEFAULT_PAYNET_API_BASE_URL = "https://api-merchant.test.paynet.md";
const DEFAULT_PAYNET_ACQUIRING_BASE_URL = "https://test.paynet.md";
const DEFAULT_PAYMENT_EXPIRY_HOURS = 4;

function cleanBaseUrl(value, fallback) {
  const raw = String(value || fallback || "").trim();
  if (!raw) return "";

  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

function getRequiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function firstPresent(source, names) {
  for (const name of names) {
    if (source?.[name] != null) return source[name];
  }
  return null;
}

function getPaynetApiBaseUrl() {
  return cleanBaseUrl(process.env.PAYNET_API_BASE_URL, DEFAULT_PAYNET_API_BASE_URL);
}

export function getPaynetAcquiringUrl() {
  const baseUrl = cleanBaseUrl(process.env.PAYNET_ACQUIRING_BASE_URL, DEFAULT_PAYNET_ACQUIRING_BASE_URL);
  return new URL("/acquiring/getecom", baseUrl).toString();
}

export function getPaynetMerchantCode() {
  return getRequiredEnv("PAYNET_MERCHANT_CODE");
}

export function getPaynetSecretKey() {
  return getRequiredEnv("PAYNET_SECRET_KEY");
}

export function getPaynetSaleAreaCode() {
  return String(process.env.PAYNET_SALE_AREA_CODE || "").trim() || null;
}

export function getPaynetExpiryDate(hours = DEFAULT_PAYMENT_EXPIRY_HOURS) {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  return date.toISOString().slice(0, 19);
}

export function normalizePaynetLang(lang) {
  const value = String(lang || "").trim().toLowerCase();
  if (value.startsWith("ru")) return "ru";
  if (value.startsWith("en")) return "en";
  return "ro";
}

export function toPaynetIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return date.toISOString().slice(0, 19);
}

function getPaynetAuthParams() {
  const params = new URLSearchParams();
  params.set("grant_type", "password");
  params.set("username", getRequiredEnv("PAYNET_MERCHANT_USER"));
  params.set("password", getRequiredEnv("PAYNET_MERCHANT_PASSWORD"));

  const merchantCode = String(process.env.PAYNET_MERCHANT_CODE || "").trim();
  if (merchantCode) params.set("merchantcode", merchantCode);

  const saleArea = getPaynetSaleAreaCode();
  if (saleArea) params.set("salearea", saleArea);

  return params;
}

async function readPaynetJson(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid Paynet JSON response: ${text.slice(0, 200)}`);
  }
}

export async function getPaynetAccessToken() {
  const response = await fetch(new URL("/auth", getPaynetApiBaseUrl()).toString(), {
    method: "POST",
    headers: {
      "Accept-Language": "ro-RO",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: getPaynetAuthParams(),
    cache: "no-store",
  });

  const payload = await readPaynetJson(response);
  if (!response.ok || !payload?.access_token) {
    throw new Error(payload?.error || payload?.Message || "Paynet authentication failed");
  }

  return payload.access_token;
}

export async function registerPaynetPayment(payload) {
  const token = await getPaynetAccessToken();
  const response = await fetch(new URL("/api/Payments/Send", getPaynetApiBaseUrl()).toString(), {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = await readPaynetJson(response);
  if (!response.ok || data?.Code) {
    throw new Error(data?.Message || "Paynet payment registration failed");
  }

  const paymentId = Number(data?.PaymentId ?? data?.PaymentID ?? data?.Paymentid);
  const signature = String(data?.Signature || "").trim();

  if (!Number.isSafeInteger(paymentId) || paymentId <= 0 || !signature) {
    throw new Error("Paynet payment registration response is missing PaymentId or Signature");
  }

  return {
    raw: data,
    paymentId,
    signature,
  };
}

export function buildPaynetCustomer(user, body = {}) {
  const metadata = user?.user_metadata || {};
  const email = String(user?.email || body.email || "").trim();
  const fullName = String(
    body.name ||
      metadata.full_name ||
      metadata.name ||
      metadata.display_name ||
      email ||
      user?.id ||
      "CatDai user"
  ).trim();

  const [fallbackFirst, ...fallbackLastParts] = fullName.split(/\s+/);
  const firstName = String(body.name_first || metadata.first_name || fallbackFirst || fullName).trim();
  const lastName = String(body.name_last || metadata.last_name || fallbackLastParts.join(" ") || "-").trim();

  return {
    Code: email || user?.id,
    Name: fullName,
    NameFirst: firstName,
    NameLast: lastName,
    email,
    Country: String(body.country || "Moldova").trim(),
    City: String(body.city || "Chisinau").trim(),
    Address: String(body.address || "catdai.md").trim(),
    PhoneNumber: String(body.phone || "").replace(/[^\d+]/g, "").slice(0, 32),
  };
}

export function buildNotificationSignaturePayload(payload) {
  const payment = payload?.Payment || {};
  const eventId = firstPresent(payload, ["Eventid", "EventID", "EventId"]);
  const externalId = firstPresent(payment, ["ExternalID", "ExternalId", "Externalid"]);
  const paymentId = firstPresent(payment, ["ID", "Id", "PaymentId", "PaymentID"]);
  const merchant = firstPresent(payment, ["Merchant", "MerchantCode"]);

  return [
    payload?.EventDate,
    eventId,
    payload?.EventType,
    payment?.Amount,
    payment?.Customer,
    externalId,
    paymentId,
    merchant,
    payment?.StatusDate,
  ]
    .map((part) => (part == null ? "" : String(part)))
    .join("");
}

export function signPaynetNotification(payload) {
  const prepared = `${buildNotificationSignaturePayload(payload)}${getPaynetSecretKey()}`;
  return crypto.createHash("md5").update(Buffer.from(prepared, "utf8")).digest("base64");
}

export function isValidPaynetNotificationHash(payload, hashHeader) {
  const expected = signPaynetNotification(payload);
  const received = String(hashHeader || "").trim();
  if (!received) return false;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function getPaynetNotificationFields(payload) {
  const payment = payload?.Payment || {};
  const eventId = firstPresent(payload, ["Eventid", "EventID", "EventId"]);
  const externalId = firstPresent(payment, ["ExternalID", "ExternalId", "Externalid"]);
  const paymentId = firstPresent(payment, ["ID", "Id", "PaymentId", "PaymentID"]);
  const merchant = firstPresent(payment, ["Merchant", "MerchantCode"]);
  const paymentStatus = firstPresent(payment, ["Status", "PaymentStatus"]);
  const isPaid = String(payload?.EventType || "").toLowerCase() === "paid";

  return {
    eventId: Number(eventId),
    eventType: payload?.EventType ? String(payload.EventType) : null,
    eventDate: payload?.EventDate || null,
    paynetPaymentId: Number(paymentId),
    invoiceNo: Number(externalId),
    merchantCode: merchant ? String(merchant) : null,
    paymentCustomer: payment?.Customer ? String(payment.Customer) : null,
    amountMinor: Number(payment?.Amount),
    paynetStatus: paymentStatus == null && isPaid ? 4 : Number(paymentStatus),
  };
}
