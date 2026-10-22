import crypto from "node:crypto";
import { getApiWorkerEndpoints, withApiWorkerFallback } from "@/lib/api-workers";
import { getExternalApiDiagnosticHeaders, trackExternalApiUsage } from "@/lib/external-api-usage";

const DEFAULT_TIMEOUT_MS = 10_000;

function signBody(rawBody, secret, timestamp) {
  return crypto
    .createHmac("sha256", secret)
    .update(String(timestamp))
    .update("\n")
    .update(rawBody)
    .digest("hex");
}

function externalListing999Config() {
  const secret = process.env.LISTING999_EXTERNAL_API_SECRET || process.env.CADASTRU_EXTERNAL_API_SECRET || "";
  const timeoutMs = Number(process.env.LISTING999_EXTERNAL_API_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return { secret, timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS };
}

function externalError(message, options = {}) {
  const error = new Error(message);
  error.code = options.code || "external_listing999_failed";
  error.status = options.status || null;
  error.fallbackEligible = Boolean(options.fallbackEligible);
  return error;
}

export async function fetchExternal999Listing(externalId, options = {}) {
  const workers = getApiWorkerEndpoints("v1/999/listing", process.env.LISTING999_EXTERNAL_API_URL,
    process.env.LISTING999_EXTERNAL_API_BASE_URL || process.env.CADASTRU_EXTERNAL_API_BASE_URL || "");
  if (!workers.length || !externalListing999Config().secret) {
    throw externalError("External 999 listing API is not configured", {
      code: "external_listing999_not_configured", fallbackEligible: true,
    });
  }
  return withApiWorkerFallback(workers, (worker) => fetchExternal999ListingAttempt(
    worker.url, externalId, { ...options, nodeName: worker.name }
  ));
}

async function fetchExternal999ListingAttempt(url, externalId, options) {
  const { secret, timeoutMs } = externalListing999Config();

  if (!url || !secret) {
    throw externalError("External 999 listing API is not configured", {
      code: "external_listing999_not_configured",
      fallbackEligible: true,
    });
  }

  const rawBody = JSON.stringify({ external_id: externalId });
  const requestPayload = { external_id: externalId };
  const timestamp = Date.now();
  const signature = signBody(rawBody, secret, timestamp);
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const trackingHeaders = { "x-request-id": requestId, "x-catdai-target-node": options.nodeName };
  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
        "X-Catdai-Timestamp": String(timestamp),
        "X-Catdai-Signature": `sha256=${signature}`,
      },
      body: rawBody,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const code = error?.name === "TimeoutError" ? "external_listing999_timeout" : "external_listing999_unreachable";
    const message = error?.message || "External 999 listing API request failed";
    trackExternalApiUsage("999_listing", "failure", {
      endpoint: url,
      requestPayload,
      responseHeaders: trackingHeaders,
      errorCode: code,
      errorMessage: message,
      durationMs: Date.now() - startedAt,
      userId: options.userId ?? null,
    });
    throw externalError(message, {
      code,
      fallbackEligible: true,
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
    trackExternalApiUsage("999_listing", "success", {
      endpoint: url,
      requestPayload,
      responsePayload: payload,
      responseHeaders: { ...trackingHeaders, ...getExternalApiDiagnosticHeaders(response) },
      httpStatus: response.status,
      durationMs: Date.now() - startedAt,
      userId: options.userId ?? null,
    });
    return payload.data;
  }

  const code = payload?.error || `external_listing999_http_${response.status}`;
  const message = payload?.message || `External 999 listing API returned ${response.status}`;
  trackExternalApiUsage("999_listing", "failure", {
    endpoint: url,
    requestPayload,
    responsePayload: payload,
    responseHeaders: { ...trackingHeaders, ...getExternalApiDiagnosticHeaders(response) },
    errorCode: code,
    errorMessage: message,
    httpStatus: response.status,
    durationMs: Date.now() - startedAt,
    userId: options.userId ?? null,
  });
  throw externalError(message, {
    code,
    status: response.status,
    fallbackEligible: true,
  });
}
