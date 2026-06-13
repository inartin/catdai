import crypto from "node:crypto";

const DEFAULT_PADDLE_VERSION = "1";
const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

function cleanBaseUrl(value) {
  const raw = String(value || "").trim();
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

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function timingSafeStringEqual(expected, received) {
  const expectedBuffer = Buffer.from(String(expected || ""));
  const receivedBuffer = Buffer.from(String(received || ""));
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function getPaddleEnvironment() {
  const value = String(process.env.PADDLE_ENVIRONMENT || process.env.PADDLE_ENV || "sandbox")
    .trim()
    .toLowerCase();
  return value === "live" || value === "production" ? "live" : "sandbox";
}

export function getPaddleApiBaseUrl() {
  const configured = cleanBaseUrl(process.env.PADDLE_API_BASE_URL);
  if (configured) return configured;
  return getPaddleEnvironment() === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

export function getPaddleApiKey() {
  return getRequiredEnv("PADDLE_API_KEY");
}

export function getPaddleWebhookSecretKey() {
  const value = getRequiredEnv("PADDLE_WEBHOOK_SECRET_KEY");
  if (/^ntfset_/i.test(value)) {
    throw new Error("PADDLE_WEBHOOK_SECRET_KEY must be the webhook endpoint secret, not the notification setting id");
  }
  return value;
}

export function getPaddleCheckoutUrl() {
  const raw = String(process.env.PADDLE_CHECKOUT_URL || "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizePaddleLang(lang) {
  const value = String(lang || "").trim().toLowerCase();
  if (value.startsWith("ru")) return "ru";
  if (value.startsWith("en")) return "en";
  return "ro";
}

export function buildPaddleCustomerSnapshot(user, body = {}) {
  const metadata = user?.user_metadata || {};
  const email = String(user?.email || body.email || "").trim();
  const name = String(
    body.name ||
      metadata.full_name ||
      metadata.name ||
      metadata.display_name ||
      email ||
      user?.id ||
      "CatDai user"
  ).trim();

  return {
    user_id: user?.id || null,
    email,
    name,
  };
}

async function readPaddleJson(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid Paddle JSON response: ${text.slice(0, 200)}`);
  }
}

function formatPaddleApiError(payload, response) {
  const error = payload?.error || {};
  const parts = [
    error.detail,
    error.code,
    ...(Array.isArray(error.errors)
      ? error.errors.map((item) => {
          const field = item?.field ? `${item.field}: ` : "";
          return `${field}${item?.message || item?.code || ""}`.trim();
        })
      : []),
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  const message = parts.length > 0 ? parts.join(" ") : "Paddle API request failed";
  const requestId = payload?.meta?.request_id ? ` request_id=${payload.meta.request_id}` : "";
  return `Paddle API ${response.status}: ${message}${requestId}`;
}

export async function paddleApiRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(new URL(path, getPaddleApiBaseUrl()).toString(), {
    method,
    headers: {
      Authorization: `Bearer ${getPaddleApiKey()}`,
      "Content-Type": "application/json",
      "Paddle-Version": DEFAULT_PADDLE_VERSION,
    },
    body: body == null ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  const payload = await readPaddleJson(response);
  if (!response.ok) {
    throw new Error(formatPaddleApiError(payload, response));
  }

  return payload;
}

export async function createPaddleTransaction(payload) {
  const response = await paddleApiRequest("/transactions", {
    method: "POST",
    body: payload,
  });

  const transaction = response?.data;
  if (!transaction?.id) throw new Error("Paddle transaction response is missing id");

  return {
    raw: response,
    transaction,
  };
}

export async function getPaddlePrice(priceId) {
  const response = await paddleApiRequest(`/prices/${encodeURIComponent(priceId)}`);
  const price = response?.data;
  if (!price?.id) throw new Error("Paddle price response is missing id");
  return price;
}

export async function listPaddlePricesForProduct(productId) {
  const params = new URLSearchParams({
    product_id: productId,
    status: "active",
    per_page: "50",
  });
  const response = await paddleApiRequest(`/prices?${params.toString()}`);
  return Array.isArray(response?.data) ? response.data : [];
}

export function isPaddleOneTimePrice(price) {
  return price?.status === "active" && price?.billing_cycle == null;
}

export function extractPaddleTransactionSummary(transaction = {}) {
  const totals = transaction?.details?.totals || {};
  const checkoutUrl = transaction?.checkout?.url ? String(transaction.checkout.url) : null;

  return {
    transactionId: transaction?.id ? String(transaction.id) : null,
    status: transaction?.status ? String(transaction.status) : null,
    checkoutUrl,
    amountMinor: parsePositiveInteger(totals.total ?? totals.grand_total ?? totals.balance),
    currencyCode: totals.currency_code || transaction?.currency_code || null,
  };
}

function getWebhookToleranceSeconds() {
  const value = Number.parseInt(process.env.PADDLE_WEBHOOK_TOLERANCE_SECONDS, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
}

function parsePaddleSignatureHeader(signatureHeader) {
  const parts = String(signatureHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const signatures = [];
  let timestamp = "";

  for (const part of parts) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = part.slice(0, separatorIndex);
    const value = part.slice(separatorIndex + 1);
    if (key === "ts") timestamp = value;
    if (key === "h1") signatures.push(value);
  }

  return { timestamp, signatures };
}

export function isValidPaddleWebhookSignature(rawBody, signatureHeader) {
  const { timestamp, signatures } = parsePaddleSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds <= 0) return false;

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > getWebhookToleranceSeconds()) return false;

  const signedPayload = `${timestamp}:${rawBody}`;
  const expected = crypto
    .createHmac("sha256", getPaddleWebhookSecretKey())
    .update(signedPayload, "utf8")
    .digest("hex");

  return signatures.some((signature) => timingSafeStringEqual(expected, signature));
}

export function getPaddleWebhookEventFields(event = {}) {
  const data = event?.data || {};
  const customData = data?.custom_data || {};
  const totals = data?.details?.totals || {};
  const priceIds = Array.isArray(data?.items)
    ? data.items.map((item) => item?.price?.id || item?.price_id).filter(Boolean).map(String)
    : [];

  return {
    eventId: event?.event_id ? String(event.event_id) : null,
    eventType: event?.event_type ? String(event.event_type) : null,
    occurredAt: event?.occurred_at || null,
    notificationId: event?.notification_id ? String(event.notification_id) : null,
    transactionId: data?.id ? String(data.id) : null,
    transactionStatus: data?.status ? String(data.status) : null,
    orderId: customData?.catdai_order_id ? String(customData.catdai_order_id) : null,
    userId: customData?.catdai_user_id ? String(customData.catdai_user_id) : null,
    productKey: customData?.product_key ? String(customData.product_key) : null,
    customerId: data?.customer_id ? String(data.customer_id) : null,
    amountMinor: parsePositiveInteger(totals.total ?? totals.grand_total),
    currencyCode: totals.currency_code || data?.currency_code || null,
    collectionMode: data?.collection_mode ? String(data.collection_mode) : null,
    subscriptionId: data?.subscription_id ? String(data.subscription_id) : null,
    priceIds,
  };
}
