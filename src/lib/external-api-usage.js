import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { supabaseAdmin } from "@/lib/supabase-admin";

const SERVICES = new Set(["999_listing", "cadastru_number", "cadastru_address"]);
const STATUSES = new Set(["success", "failure"]);

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST204";
}

export function trackExternalApiUsage(service, status) {
  if (!shouldPersistRuntimeData()) return;
  if (!SERVICES.has(service) || !STATUSES.has(status)) return;

  queueMicrotask(() => {
    supabaseAdmin
      .rpc("increment_external_api_usage", {
        p_service: service,
        p_status: status,
      })
      .then(({ error }) => {
        if (error && !isMissingSchemaError(error)) {
          console.error("[external-api-usage] increment failed:", error.message);
        }
      })
      .catch((error) => {
        console.error("[external-api-usage] increment failed:", error?.message || String(error));
      });
  });
}
