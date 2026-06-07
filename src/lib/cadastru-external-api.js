import crypto from "node:crypto";
import { trackExternalApiUsage } from "@/lib/external-api-usage";

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

function externalCadastruConfig(path, explicitUrl) {
  const url = resolveEndpointUrl(path, explicitUrl);
  const secret = process.env.CADASTRU_EXTERNAL_API_SECRET || "";
  const timeoutMs = Number(process.env.CADASTRU_EXTERNAL_API_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return { url, secret, timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS };
}

function externalError(message, options = {}) {
  const error = new Error(message);
  error.code = options.code || "external_cadastru_failed";
  error.status = options.status || null;
  error.fallbackEligible = Boolean(options.fallbackEligible);
  return error;
}

async function fetchSignedExternalCadastru(path, body, explicitUrl, service) {
  const { url, secret, timeoutMs } = externalCadastruConfig(path, explicitUrl);
  if (!url || !secret) {
    throw externalError("External cadastru API is not configured", {
      code: "external_cadastru_not_configured",
      fallbackEligible: true,
    });
  }

  const rawBody = JSON.stringify(body);
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
    trackExternalApiUsage(service, "failure");
    throw externalError(error?.message || "External cadastru API request failed", {
      code: error?.name === "TimeoutError" ? "external_cadastru_timeout" : "external_cadastru_unreachable",
      fallbackEligible: true,
    });
  }

  const payload = await response.json().catch(() => null);
  if (response.ok && payload?.ok && payload?.data) {
    trackExternalApiUsage(service, "success");
    return payload.data;
  }

  const code = payload?.error || `external_cadastru_http_${response.status}`;
  const message = payload?.message || `External cadastru API returned ${response.status}`;
  const fallbackEligible = response.status === 502 || response.status === 503 || response.status === 504;
  trackExternalApiUsage(service, "failure");
  throw externalError(message, {
    code,
    status: response.status,
    fallbackEligible,
  });
}

export async function fetchExternalCadastralData(cadastralNumber) {
  return fetchSignedExternalCadastru(
    "v1/cadastral",
    { cadastral_number: cadastralNumber },
    process.env.CADASTRU_EXTERNAL_API_URL,
    "cadastru_number"
  );
}

export async function fetchExternalCadastruAddressData(addressFields) {
  return fetchSignedExternalCadastru(
    "v1/cadastru/address",
    addressFields,
    process.env.CADASTRU_EXTERNAL_ADDRESS_API_URL,
    "cadastru_address"
  );
}
