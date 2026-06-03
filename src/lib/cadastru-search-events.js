import { resolveAccessTier } from "@/lib/access-tier";
import { supabaseAdmin } from "@/lib/supabase-admin";

const SEARCH_TYPES = new Set(["address", "number"]);
const RESULT_TYPES = new Set(["no_data", "address_only", "apartment_only", "full_data"]);

function normalizeSearchType(searchType) {
  const value = String(searchType || "").trim();
  return SEARCH_TYPES.has(value) ? value : null;
}

function normalizeResultType(resultType) {
  const value = String(resultType || "").trim();
  return RESULT_TYPES.has(value) ? value : null;
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

function cleanCadastralNumber(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 40) : null;
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
      cadastral_number: cleanCadastralNumber(options.cadastralNumber),
      result_type: normalizeResultType(options.resultType),
    };

    let { error } = await supabaseAdmin.from("cadastru_search_events").insert(row);

    for (let attempt = 0; attempt < 3 && error; attempt++) {
      const missingColumn = ["district", "cadastral_number", "result_type"].find((column) =>
        column in row && isMissingColumnError(error, column)
      );
      if (!missingColumn) break;
      delete row[missingColumn];
      ({ error } = await supabaseAdmin.from("cadastru_search_events").insert(row));
    }

    if (error && !isMissingSchemaError(error)) {
      console.error("[cadastru-search-events] insert failed:", error.message);
    }
  } catch (error) {
    console.error("[cadastru-search-events] insert failed:", error?.message || String(error));
  }
}
