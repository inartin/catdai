import { cadastruMapLocation } from "@/lib/cadastru-map";

export const CADASTRU_RESULT_CATEGORIES = [
  ["result_cadastru", "Cadastral data"],
  ["result_nearby", "Nearby"],
  ["result_transport", "Public transport"],
  ["result_map", "Map"],
];

export function hasCadastruPropertyResults(payload) {
  return [payload?.lands, payload?.buildings].some((items) => Array.isArray(items)
    && items.some((item) => item?.cadastral_number));
}

export function primaryCadastruResultCategories(payload, resultType) {
  return {
    result_cadastru: hasCadastruPropertyResults(payload)
      || ["address_only", "land_only", "apartment_only", "full_data"].includes(resultType),
    ...(cadastruMapLocation(payload) ? { result_map: true } : {}),
  };
}

export function cadastruResultSummary(search) {
  const recovered = search.suggestion_activity?.role === "original" && Boolean(search.suggestion_activity.recovered_at);
  const primary = primaryCadastruResultCategories(null, search.result_type).result_cadastru;
  const categories = CADASTRU_RESULT_CATEGORIES.map(([key, label]) => ({
    key, label, success: search[key] === true || (key === "result_cadastru" && (primary || recovered)),
  }));
  return { categories, count: categories.filter((category) => category.success).length,
    cadastru: categories[0].success, recovered };
}
