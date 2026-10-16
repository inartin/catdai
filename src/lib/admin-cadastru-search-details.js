import crypto from "node:crypto";
import { groupExternalApiEvents } from "@/lib/admin-external-api-groups";
import { normalizeCadastruLookupId } from "@/lib/cadastru-lookup-tracking";

function normalizeQuery(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(?:str|strada)\b\.?/g, "strada")
    .replace(/\b(?:bd|bulevardul|bulevard)\b\.?/g, "bulevard")
    .replace(/\b(?:ap|apt|apartament)\b\.?/g, "ap")
    .replace(/[,;.]/g, " ").replace(/\s+/g, " ").trim();
}

function addressQuery(payload) {
  if (!payload?.city || !payload.street || !payload.house_number) return "";
  return `${payload.city}, ${payload.road_type || "strada"} ${payload.street} ${payload.house_number}${payload.apartment_number ? ` ap ${payload.apartment_number}` : ""}`;
}

function matchesPrimary(search, event) {
  if (event.service !== (search.search_type === "address" ? "cadastru_address" : "cadastru_number")) return false;
  if (event.user_id && event.user_id !== search.user_id) return false;
  const delay = Date.parse(search.created_at) - Date.parse(event.created_at);
  if (!Number.isFinite(delay) || delay < -5000 || delay > 15_000) return false;
  if (search.search_type === "number") {
    return Boolean(search.cadastral_number) && search.cadastral_number === event.request_payload?.cadastral_number;
  }
  const queries = [search.search_address, addressQuery(search.search_request)].map(normalizeQuery).filter(Boolean);
  return [event.request_payload?.address, addressQuery(event.request_payload)].some((value) =>
    value && queries.includes(normalizeQuery(value)));
}

// A shared search UUID is authoritative. Legacy matches require the full query
// (including apartment), timing and a unique search/call pair.
export function findCadastruSearchApiGroup(search, events, nearbySearches = []) {
  const groups = groupExternalApiEvents(events.filter((event) =>
    !event.user_id || event.user_id === search.user_id));
  if (search.event_key) {
    const group = groups.find((group) => {
      const id = normalizeCadastruLookupId(group.events[0].response_headers?.["x-catdai-lookup-id"]);
      return id && crypto.createHash("sha256").update(JSON.stringify([
        id, search.user_id || null, search.search_type, search.search_address || search.cadastral_number,
      ])).digest("hex") === search.event_key;
    });
    return group ? { ...group, match: "lookup_id" } : null;
  }

  const candidates = groups.filter((group) => group.events.some((event) => matchesPrimary(search, event)));
  if (candidates.length !== 1) return null;
  const group = candidates[0];
  const primary = group.events.filter((event) => matchesPrimary(search, event));
  if (primary.length !== 1 || nearbySearches.some((other) => other.id !== search.id
    && matchesPrimary(other, primary[0]))) return null;
  return { ...group, match: "inferred" };
}
