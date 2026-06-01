import { resolveAccessTier } from "@/lib/access-tier";
import { supabaseAdmin } from "@/lib/supabase-admin";

const SEARCH_TYPES = new Set(["address", "number"]);

function normalizeSearchType(searchType) {
  const value = String(searchType || "").trim();
  return SEARCH_TYPES.has(value) ? value : null;
}

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || code === "PGRST204";
}

function isMissingDistrictError(error) {
  const message = String(error?.message || "");
  return isMissingSchemaError(error) && message.includes("district");
}

function cleanDistrict(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

export async function logCadastruSearchEvent(request, searchType, options = {}) {
  const normalizedType = normalizeSearchType(searchType);
  if (!normalizedType) return;

  let userId = null;
  try {
    const access = await resolveAccessTier(request);
    userId = access.user_id || null;
  } catch (error) {
    console.error("[cadastru-search-events] auth lookup failed:", error?.message || String(error));
  }

  try {
    const row = {
      search_type: normalizedType,
      user_id: userId,
      district: normalizedType === "address" ? cleanDistrict(options.district) : null,
    };

    let { error } = await supabaseAdmin.from("cadastru_search_events").insert(row);

    if (error && row.district && isMissingDistrictError(error)) {
      delete row.district;
      ({ error } = await supabaseAdmin.from("cadastru_search_events").insert(row));
    }

    if (error && !isMissingSchemaError(error)) {
      console.error("[cadastru-search-events] insert failed:", error.message);
    }
  } catch (error) {
    console.error("[cadastru-search-events] insert failed:", error?.message || String(error));
  }
}
