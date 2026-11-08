import { supabaseAdmin } from "@/lib/supabase-admin";
import { cadastruMapLocation } from "@/lib/cadastru-map";
import { validNearbyResult } from "@/lib/cadastru-nearby";
import { validPublicTransportResult } from "@/lib/cadastru-public-transport";
import { CADASTRU_RESULT_CATEGORIES, hasCadastruPropertyResults } from "@/lib/cadastru-result-categories";

// Historical rows have no category snapshot. Use only successful, exactly
// linked worker payloads; HTTP success by itself does not establish a result.
export function attachCadastruResultCategories(searches, events) {
  return searches.map((search) => {
    const flags = {};
    for (const event of events) {
      if (!search.lookup_id || event.response_headers?.["x-catdai-lookup-id"] !== search.lookup_id
        || event.status !== "success" || (event.user_id && event.user_id !== search.user_id)
        || (search.visitor?.device_id && event.visitor?.device_id
          && search.visitor.device_id !== event.visitor.device_id)) continue;
      const payload = event.response_payload?.data;
      if (!payload) continue;
      if (["cadastru_address", "cadastru_number"].includes(event.service)) {
        if (hasCadastruPropertyResults(payload) || payload.address || payload.matched_address || payload.location?.display_name
          || [payload.apartment, payload.building].some((property) => Object.values(property || {})
            .some((value) => value != null && value !== ""))) {
          flags.result_cadastru = true;
        }
        if (cadastruMapLocation(payload)) flags.result_map = true;
      } else if (event.service === "cadastru_nearby") {
        const path = String(event.endpoint || "").split("?")[0];
        if (/\/nearby\/address\/?$/.test(path) && validNearbyResult(payload)) flags.result_nearby = true;
        if (/\/public-transport\/?$/.test(path) && validPublicTransportResult(payload)) flags.result_transport = true;
      }
    }
    return { ...search, ...flags };
  });
}

export async function loadCadastruResultCategories(searches) {
  const legacy = searches.filter((search) => CADASTRU_RESULT_CATEGORIES.every(([key]) => search[key] == null));
  const ids = [...new Set(legacy.map((search) => search.lookup_id).filter(Boolean))];
  if (!ids.length) return searches;
  const events = [];
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await supabaseAdmin.from("external_api_usage_events")
      .select("id, service, endpoint, status, user_id, visitor, response_headers, response_payload")
      .in("service", ["cadastru_address", "cadastru_number", "cadastru_nearby"])
      .in("response_headers->>x-catdai-lookup-id", ids).eq("status", "success")
      .order("id", { ascending: true }).range(offset, offset + 199);
    if (error) throw new Error(`Cadastru result categories query failed: ${error.message}`);
    events.push(...(data || []));
    if (!data || data.length < 200) break;
  }
  const enriched = new Map(attachCadastruResultCategories(legacy, events).map((search) => [search.id, search]));
  return searches.map((search) => enriched.get(search.id) || search);
}
