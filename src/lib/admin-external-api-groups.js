const CADASTRU_SERVICES = new Set(["cadastru_address", "cadastru_number", "cadastru_nearby"]);
const LEGACY_SEARCH_WINDOW_MS = 120_000;

function normalizeAddress(value) {
  if (typeof value !== "string") return "";
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(?:ap|apt|apartament(?:ul)?|кв)\.?\s*\d+.*$/i, "")
    .replace(/\b(?:mun|municipiul|or|orasul|nr)\b\.?\s*/g, "")
    .replace(/\b(?:str|strada|ул|улица)\b\.?/g, "strada")
    .replace(/\b(?:bd|bul|bulevardul)\b\.?/g, "bulevard")
    .replace(/[,;.]/g, " ").replace(/\s+/g, " ").trim();
}

function eventLocations(event) {
  const request = event.request_payload || {};
  const response = event.response_payload?.data || event.response_payload || {};
  const structuredAddress = (value) => value?.city && value?.street && value?.house_number
    ? [value.city, value.road_type, value.street, value.house_number].filter(Boolean).join(" ") : "";
  return new Set([
    structuredAddress(request), request.address,
    structuredAddress(response.form_fields), response.address, response.request_address,
    response.resolved_address, response.matched_address, response.apartment?.address,
    response.building?.address,
    ...(Array.isArray(response.buildings) ? response.buildings.map((item) => item?.address) : []),
    ...(Array.isArray(response.lands) ? response.lands.map((item) => item?.address) : []),
  ].map(normalizeAddress).filter(Boolean));
}

function callStart(event) {
  return Date.parse(event.created_at) - Math.max(0, Number(event.duration_ms) || 0);
}

function callKind(event) {
  return event.endpoint || event.service;
}

function matchesLegacySearch(event, group) {
  if (group.linked || !CADASTRU_SERVICES.has(group.events[0].service)) return false;
  const primary = group.events[0];
  if (event.user_id && group.events.some((row) => row.user_id && event.user_id !== row.user_id)) return false;
  const delay = callStart(event) - (primary.service === "cadastru_nearby"
    ? callStart(primary) : Date.parse(primary.created_at));
  if (!Number.isFinite(delay) || delay < -5000 || delay > LEGACY_SEARCH_WINDOW_MS) return false;
  const locations = eventLocations(event);
  return group.events.some((row) => [...eventLocations(row)].some((location) => locations.has(location)));
}

function eventQuery(event) {
  const payload = event.request_payload || {};
  return payload.cadastral_number || payload.address || [
    payload.city, payload.road_type, payload.street, payload.house_number,
    payload.apartment_number ? `ap. ${payload.apartment_number}` : "",
  ].filter(Boolean).join(", ") || payload.external_id || "";
}

export function groupExternalApiEvents(events, statusFilter = "all", cachedSearches = []) {
  const groups = new Map();
  const legacySecondaryEvents = [];
  for (const event of events) {
    const lookupId = CADASTRU_SERVICES.has(event.service) && event.response_headers?.["x-catdai-lookup-id"];
    if (!lookupId && event.service === "cadastru_nearby") {
      legacySecondaryEvents.push(event);
      continue;
    }
    const id = lookupId ? `search:${lookupId}` : `event:${event.id}`;
    if (!groups.has(id)) groups.set(id, { id, linked: Boolean(lookupId), events: [] });
    groups.get(id).events.push(event);
  }

  // Older logs have no search ID. Attach distinct follow-up endpoints only when
  // their building address and call timing identify one possible search.
  for (const event of legacySecondaryEvents.sort((a, b) => callStart(a) - callStart(b))) {
    const candidates = [...groups.values()].filter((group) => matchesLegacySearch(event, group));
    const primaryCandidates = candidates.filter((group) => group.events[0].service !== "cadastru_nearby");
    const matches = primaryCandidates.length ? primaryCandidates : candidates;
    const match = matches.length === 1 ? matches[0] : null;
    if (match && !match.events.some((row) => callKind(row) === callKind(event))) {
      match.events.push(event);
      match.inferred = true;
    } else {
      groups.set(`event:${event.id}`, { id: `event:${event.id}`, linked: false, events: [event] });
    }
  }

  for (const search of cachedSearches) {
    if (search.lookup_source !== "cache") continue;
    const id = search.lookup_id ? `search:${search.lookup_id}` : `cache:${search.id}`;
    if (!groups.has(id)) groups.set(id, { id, linked: Boolean(search.lookup_id), events: [] });
    groups.get(id).cachedSearch = search;
  }

  return [...groups.values()].map((group) => {
    const events = [...group.events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const primary = events.find((event) => event.service === "cadastru_address")
      || events.find((event) => event.service === "cadastru_number") || events[0] || {
        service: group.cachedSearch.search_type === "address" ? "cadastru_address" : "cadastru_number",
        request_payload: { address: group.cachedSearch.search_address, cadastral_number: group.cachedSearch.cadastral_number },
      };
    const search = group.cachedSearch;
    return {
      ...group,
      events,
      service: primary.service,
      query: (search && (search.search_type === "address" ? search.search_address : search.cadastral_number))
        || primary.response_headers?.["x-catdai-lookup-query"] || eventQuery(primary),
      created_at: search?.created_at || events[0].created_at,
      latest_at: [search?.created_at, events[events.length - 1]?.created_at].filter(Boolean)
        .sort((a, b) => Date.parse(b) - Date.parse(a))[0],
      user_name: search?.user_name || primary.user_name || events.find((event) => event.user_name)?.user_name,
      success: events.filter((event) => event.status === "success").length,
      failure: events.filter((event) => event.status === "failure").length,
      mainFailure: events.filter((event) => event.status === "failure"
        && (event.service === "cadastru_address" || event.service === "cadastru_number")).length,
    };
  }).filter((group) => statusFilter === "all" || (statusFilter === "failure"
    ? group.mainFailure > 0 : group.events.some((event) => event.status === statusFilter)
      || (group.cachedSearch?.result_type && !["error", "no_data"].includes(group.cachedSearch.result_type))))
    .sort((a, b) => Date.parse(b.latest_at) - Date.parse(a.latest_at));
}
