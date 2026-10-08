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

function cleanSearchRequest(value) {
  if (!value || typeof value !== "object") return null;
  const city = cleanCity(value.city);
  const roadType = String(value.road_type || "");
  const street = typeof value.street === "string" ? value.street.trim().slice(0, 80) : "";
  const houseNumber = typeof value.house_number === "string" ? value.house_number.trim().slice(0, 10) : "";
  const apartmentNumber = typeof value.apartment_number === "string" ? value.apartment_number.trim().slice(0, 4) : "";
  if (!city || !["strada", "str-la", "bulevard"].includes(roadType) || !street || !houseNumber) return null;
  return { city, road_type: roadType, street, house_number: houseNumber, ...(apartmentNumber ? { apartment_number: apartmentNumber } : {}) };
}

function resultValueForSearch(searchType, payload) {
  if (!payload || typeof payload !== "object") return null;

  if (searchType === "number") {
    const address = [
      payload.address,
      payload.apartment?.address,
      payload.building?.address,
      payload.matched_address,
      payload.location?.display_name,
      payload.building_address,
    ].find((value) => typeof value === "string" && value.trim());
    return address ? address.trim().slice(0, 500) : null;
  }

  const numbers = [
    payload.cadastral_number,
    ...(Array.isArray(payload.lands) ? payload.lands.map((land) => land?.cadastral_number) : []),
    ...(Array.isArray(payload.buildings) ? payload.buildings.map((building) => building?.cadastral_number) : []),
  ].map(cleanCadastralNumber).filter(Boolean);
  return [...new Set(numbers)].join(" · ") || null;
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
      search_request: normalizedType === "address" ? cleanSearchRequest(options.searchRequest) : null,
      result_value: resultValueForSearch(normalizedType, options.resultPayload),
      result_type: normalizeResultType(options.resultType),
      lookup_source: normalizeLookupSource(options.lookupSource),
    };

    let { data, error } = await supabaseAdmin.from("cadastru_search_events").insert(row).select("id").single();

    for (let attempt = 0; attempt < 8 && error; attempt++) {
      const missingColumn = ["search_request", "result_value", "search_address", "city", "district", "cadastral_number", "result_type", "lookup_source"].find((column) =>
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
