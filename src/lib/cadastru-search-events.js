import { resolveAccessTier } from "@/lib/access-tier";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createCadastruEvaluationToken } from "@/lib/cadastru-evaluation-tracking";

const SEARCH_TYPES = new Set(["address", "number"]);
const RESULT_TYPES = new Set(["no_data", "address_only", "apartment_only", "full_data"]);
const LOOKUP_SOURCES = new Set(["api", "local"]);

function normalizeSearchType(searchType) {
  const value = String(searchType || "").trim();
  return SEARCH_TYPES.has(value) ? value : null;
}

function normalizeResultType(resultType) {
  const value = String(resultType || "").trim();
  return RESULT_TYPES.has(value) ? value : null;
}

function normalizeLookupSource(source) {
  const value = String(source || "").trim();
  return LOOKUP_SOURCES.has(value) ? value : null;
}

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || code === "PGRST204";
}

function isMissingColumnError(error, column) {
  const message = String(error?.message || "");
  return isMissingSchemaError(error) && message.includes(column);
}

function cleanDistrict(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

function cleanCity(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 80) : null;
}

function cleanCadastralNumber(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 40) : null;
}

function cleanSearchAddress(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

export async function logCadastruSearchEvent(request, searchType, options = {}) {
  if (process.env.NODE_ENV === "development" || !shouldPersistRuntimeData()) return;

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
      city: cleanCity(options.city),
      district: cleanDistrict(options.district),
      cadastral_number: cleanCadastralNumber(options.cadastralNumber),
      search_address: normalizedType === "address" ? cleanSearchAddress(options.searchAddress) : null,
      result_type: normalizeResultType(options.resultType),
      lookup_source: normalizeLookupSource(options.lookupSource),
    };

    let { data, error } = await supabaseAdmin.from("cadastru_search_events").insert(row).select("id").single();

    for (let attempt = 0; attempt < 6 && error; attempt++) {
      const missingColumn = ["search_address", "city", "district", "cadastral_number", "result_type", "lookup_source"].find((column) =>
        column in row && isMissingColumnError(error, column)
      );
      if (!missingColumn) break;
      delete row[missingColumn];
      ({ data, error } = await supabaseAdmin.from("cadastru_search_events").insert(row).select("id").single());
    }

    if (error && !isMissingSchemaError(error)) {
      console.error("[cadastru-search-events] insert failed:", error.message);
    }
    return error ? null : createCadastruEvaluationToken(data?.id);
  } catch (error) {
    console.error("[cadastru-search-events] insert failed:", error?.message || String(error));
  }
}
