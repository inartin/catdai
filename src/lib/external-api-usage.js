import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { supabaseAdmin } from "@/lib/supabase-admin";

const SERVICES = new Set(["999_listing", "cadastru_number", "cadastru_address"]);
const STATUSES = new Set(["success", "failure"]);
const DIAGNOSTIC_RESPONSE_HEADERS = [
  "content-type",
  "retry-after",
  "cf-ray",
  "x-request-id",
  "x-vercel-id",
];

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST204" || code === "PGRST205";
}

function isMissingColumnError(error, column) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (code === "42703" || isMissingSchemaError(error)) && message.includes(column);
}

function cleanText(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function cleanInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function getExternalApiDiagnosticHeaders(response) {
  if (!response?.headers) return null;

  const headers = Object.fromEntries(
    DIAGNOSTIC_RESPONSE_HEADERS
      .map((name) => [name, response.headers.get(name)])
      .filter(([, value]) => value)
  );

  return Object.keys(headers).length > 0 ? headers : null;
}

export function trackExternalApiUsage(service, status, details = {}) {
  if (!shouldPersistRuntimeData()) return;
  if (!SERVICES.has(service) || !STATUSES.has(status)) return;

  return Promise.resolve().then(async () => {
    const counterWrite = supabaseAdmin.rpc("increment_external_api_usage", {
      p_service: service,
      p_status: status,
    });
    const eventRow = {
      service,
      status,
      endpoint: cleanText(details.endpoint, 500),
      request_payload: details.requestPayload ?? null,
      response_payload: details.responsePayload ?? null,
      response_headers: details.responseHeaders ?? null,
      error_code: cleanText(details.errorCode, 160),
      error_message: cleanText(details.errorMessage, 2000),
      http_status: cleanInteger(details.httpStatus),
      duration_ms: cleanInteger(details.durationMs),
    };
    if (details.userId) {
      eventRow.user_id = details.userId;
    }
    let eventWrite = supabaseAdmin.from("external_api_usage_events").insert(eventRow);
    if (details.returnEventId) eventWrite = eventWrite.select("id");

    const [counterResult, eventResult] = await Promise.all([counterWrite, eventWrite]);
    if (counterResult.error && !isMissingSchemaError(counterResult.error)) {
      console.error("[external-api-usage] increment failed:", counterResult.error.message);
    }
    let finalEventResult = eventResult;
    if (finalEventResult.error && eventRow.user_id && isMissingColumnError(finalEventResult.error, "user_id")) {
      delete eventRow.user_id;
      let retryWrite = supabaseAdmin.from("external_api_usage_events").insert(eventRow);
      if (details.returnEventId) retryWrite = retryWrite.select("id");
      finalEventResult = await retryWrite;
    }
    if (finalEventResult.error && !isMissingSchemaError(finalEventResult.error)) {
      console.error("[external-api-usage] event insert failed:", finalEventResult.error.message);
    }
    return finalEventResult.error ? null : finalEventResult.data?.[0]?.id ?? null;
  }).catch((error) => {
    console.error("[external-api-usage] write failed:", error?.message || String(error));
    return null;
  });
}
