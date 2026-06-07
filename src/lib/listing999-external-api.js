import crypto from "node:crypto";

const DEFAULT_TIMEOUT_MS = 10_000;

function signBody(rawBody, secret, timestamp) {
  return crypto
    .createHmac("sha256", secret)
    .update(String(timestamp))
    .update("\n")
    .update(rawBody)
    .digest("hex");
}

function resolveEndpointUrl(path, explicitUrl) {
  const baseUrl =
    process.env.LISTING999_EXTERNAL_API_BASE_URL ||
    process.env.CADASTRU_EXTERNAL_API_BASE_URL ||
    "";

  if (baseUrl) {
    return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
  }

  return explicitUrl || "";
}

function externalListing999Config(path, explicitUrl) {
  const url = resolveEndpointUrl(path, explicitUrl);
  const secret =
    process.env.LISTING999_EXTERNAL_API_SECRET ||
    process.env.CADASTRU_EXTERNAL_API_SECRET ||
    "";
  const timeoutMs = Number(process.env.LISTING999_EXTERNAL_API_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  return {
    url,
    secret,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  };
}

function externalError(message, options = {}) {
  const error = new Error(message);
  error.code = options.code || "external_listing999_failed";
  error.status = options.status || null;
  error.fallbackEligible = Boolean(options.fallbackEligible);
  return error;
}

export async function fetchExternal999Listing(externalId) {
  const { url, secret, timeoutMs } = externalListing999Config(
    "v1/999/listing",
    process.env.LISTING999_EXTERNAL_API_URL
  );

  if (!url || !secret) {
    throw externalError("External 999 listing API is not configured", {
      code: "external_listing999_not_configured",
      fallbackEligible: true,
    });
  }

  const rawBody = JSON.stringify({ external_id: externalId });
  const timestamp = Date.now();
  const signature = signBody(rawBody, secret, timestamp);
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
    throw externalError(error?.message || "External 999 listing API request failed", {
      code: error?.name === "TimeoutError" ? "external_listing999_timeout" : "external_listing999_unreachable",
      fallbackEligible: true,
    });
  }

  const payload = await response.json().catch(() => null);
  if (response.ok && payload?.ok && payload?.data) {
    return payload.data;
  }

  const code = payload?.error || `external_listing999_http_${response.status}`;
  const message = payload?.message || `External 999 listing API returned ${response.status}`;
  throw externalError(message, {
    code,
    status: response.status,
    fallbackEligible: true,
  });
}
