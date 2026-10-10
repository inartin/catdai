import crypto from "node:crypto";
import { getExternalApiDiagnosticHeaders, trackExternalApiUsage } from "@/lib/external-api-usage";

const DEFAULT_TIMEOUT_MS = 20_000;

function signBody(rawBody, secret, timestamp) {
  return crypto
    .createHmac("sha256", secret)
    .update(String(timestamp))
    .update("\n")
    .update(rawBody)
    .digest("hex");
}

function resolveEndpointUrl(path, explicitUrl) {
  const baseUrl = process.env.CADASTRU_EXTERNAL_API_BASE_URL || "";
  if (baseUrl) {
    return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
  }
  return explicitUrl || "";
}

function externalCadastruConfig(path, explicitUrl, defaultTimeoutMs = DEFAULT_TIMEOUT_MS) {
  const url = resolveEndpointUrl(path, explicitUrl);
  const secret = process.env.CADASTRU_EXTERNAL_API_SECRET || "";
  const timeoutMs = Number(process.env.CADASTRU_EXTERNAL_API_TIMEOUT_MS || defaultTimeoutMs);
  return { url, secret, timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : defaultTimeoutMs };
}

function externalError(message, options = {}) {
  const error = new Error(message);
  error.code = options.code || "external_cadastru_failed";
  error.status = options.status || null;
  error.fallbackEligible = Boolean(options.fallbackEligible);
  error.suggestions = Array.isArray(options.suggestions) ? options.suggestions.filter((value) => typeof value === "string" && value.length <= 80) : [];
  error.addressSuggestions = Array.isArray(options.addressSuggestions) ? options.addressSuggestions
    .filter((value) => ["city", "road_type", "street", "house_number", "apartment_number"].every((key) => typeof value?.[key] === "string"))
    .slice(0, 3).map(({ city, road_type, street, house_number, apartment_number }) => ({ city, road_type, street, house_number, apartment_number })) : [];
  error.usageEventId = options.usageEventId || null;
  return error;
}

async function fetchSignedExternalCadastru(path, body, explicitUrl, service, options = {}) {
  const { url, secret, timeoutMs: configuredTimeoutMs } = externalCadastruConfig(path, explicitUrl, options.defaultTimeoutMs);
  const timeoutMs = options.timeoutMs || configuredTimeoutMs;
  const shouldTrackUsage = options.trackUsage !== false;
  if (!url || !secret) {
    throw externalError("External cadastru API is not configured", {
      code: "external_cadastru_not_configured",
      fallbackEligible: true,
    });
  }

  const rawBody = JSON.stringify(body);
  const timestamp = Date.now();
  const signature = signBody(rawBody, secret, timestamp);
  const startedAt = Date.now();
  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Catdai-Timestamp": String(timestamp),
        "X-Catdai-Signature": `sha256=${signature}`,
      },
      body: rawBody,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const code = error?.name === "TimeoutError" ? "external_cadastru_timeout" : "external_cadastru_unreachable";
    const message = error?.message || "External cadastru API request failed";
    const usageWrite = shouldTrackUsage ? trackExternalApiUsage(service, "failure", {
      endpoint: url,
      requestPayload: body,
      errorCode: code,
      errorMessage: message,
      durationMs: Date.now() - startedAt,
      returnEventId: options.captureUsageEventId === true,
      userId: options.userId ?? null,
    }) : null;
    const usageEventId = options.captureUsageEventId ? await usageWrite : null;
    throw externalError(message, {
      code,
      fallbackEligible: true,
      usageEventId,
    });
  }

  const responseText = await response.text().catch(() => "");
  let payload = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = responseText ? { raw_response: responseText } : null;
  }
  if (response.ok && payload?.ok && payload?.data) {
    if (shouldTrackUsage) trackExternalApiUsage(service, "success", {
      endpoint: url,
      requestPayload: body,
      responsePayload: payload,
      responseHeaders: getExternalApiDiagnosticHeaders(response),
      httpStatus: response.status,
      durationMs: Date.now() - startedAt,
      userId: options.userId ?? null,
    });
    return payload.data;
  }

  const unavailable = response.status >= 500 || response.status === 429 ||
    payload?.error === "service_unavailable" || (response.ok && (!payload?.ok || !payload?.data));
  const code = unavailable
    ? (options.preserveWorkerError && payload?.error) || "service_unavailable"
    : payload?.error || `external_cadastru_http_${response.status}`;
  const message = payload?.message || `External cadastru API returned ${response.status}`;
  const fallbackEligible = unavailable;
  const usageWrite = shouldTrackUsage ? trackExternalApiUsage(service, "failure", {
    endpoint: url,
    requestPayload: body,
    responsePayload: payload,
    responseHeaders: getExternalApiDiagnosticHeaders(response),
    errorCode: code,
    errorMessage: message,
    httpStatus: response.status,
    durationMs: Date.now() - startedAt,
    returnEventId: options.captureUsageEventId === true,
    userId: options.userId ?? null,
  }) : null;
  const usageEventId = options.captureUsageEventId ? await usageWrite : null;
  throw externalError(message, {
    code,
    status: response.status,
    suggestions: payload?.suggestions,
    addressSuggestions: payload?.address_suggestions,
    fallbackEligible,
    usageEventId,
  });
}

export async function fetchExternalCadastralData(cadastralNumber, options = {}) {
  return fetchSignedExternalCadastru(
    "v1/cadastral",
    { cadastral_number: cadastralNumber },
    process.env.CADASTRU_EXTERNAL_API_URL,
    "cadastru_number",
    options
  );
}

export async function fetchExternalCadastruAddressData(addressFields, options = {}) {
  return fetchSignedExternalCadastru(
    "v1/cadastru/address",
    addressFields,
    process.env.CADASTRU_EXTERNAL_ADDRESS_API_URL,
    "cadastru_address",
    { ...options, defaultTimeoutMs: 45_000 }
  );
}

export async function fetchExternalNearbyData(addressFields) {
  return fetchSignedExternalCadastru(
    "v1/nearby/address",
    addressFields,
    process.env.NEARBY_EXTERNAL_API_URL,
    "cadastru_nearby",
    { timeoutMs: 70_000, preserveWorkerError: true }
  );
}

export async function fetchExternalPublicTransportData(location) {
  return fetchSignedExternalCadastru(
    "v1/public-transport",
    location,
    process.env.PUBLIC_TRANSPORT_EXTERNAL_API_URL,
    "cadastru_nearby",
    { timeoutMs: 70_000, preserveWorkerError: true }
  );
}

export async function fetchExternalMunicipalReportsData(location) {
  return fetchSignedExternalCadastru(
    "v1/municipal-reports",
    location,
    process.env.MUNICIPAL_REPORTS_EXTERNAL_API_URL,
    "cadastru_nearby",
    { timeoutMs: 70_000, preserveWorkerError: true }
  );
}
