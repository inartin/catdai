import { supabaseAdmin } from "@/lib/supabase-admin";

const PAGE_SIZE = 200;

function sameVisitor(search, event) {
  if (search.user_id && event.user_id && search.user_id !== event.user_id) return false;
  const device = search.visitor?.device_id;
  return !device || !event.visitor?.device_id || device === event.visitor.device_id;
}

// Only recorded lookup IDs link a failed search to its explicit suggestion retry.
// Similar addresses or a later successful search never establish a click.
export function attachCadastruSuggestionActivity(searches, events) {
  return searches.map((search) => {
    if (!search.lookup_id) return search;
    const matches = events.filter((event) => event.suggestion_recovery && sameVisitor(search, event)
      && (event.response_headers?.["x-catdai-lookup-id"] === search.lookup_id
        || event.suggestion_recovery.retry_lookup_id === search.lookup_id));
    const event = matches.sort((a, b) => Boolean(b.suggestion_recovery.recovered_at)
      - Boolean(a.suggestion_recovery.recovered_at))[0];
    if (!event) return search;
    return { ...search, suggestion_activity: { ...event.suggestion_recovery,
      role: event.response_headers?.["x-catdai-lookup-id"] === search.lookup_id ? "original" : "retry",
      original_address: event.response_headers?.["x-catdai-lookup-query"] || null,
    } };
  });
}

export async function loadCadastruSuggestionActivity(searches) {
  const ids = [...new Set(searches.map((search) => search.lookup_id).filter(Boolean))];
  if (!ids.length) return searches;
  const read = async (field) => {
    const rows = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabaseAdmin.from("external_api_usage_events")
        .select("id, user_id, visitor, response_headers, suggestion_recovery")
        .eq("service", "cadastru_address").not("suggestion_recovery", "is", null)
        .in(field, ids).order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        if (["42P01", "42703", "PGRST204", "PGRST205"].includes(String(error.code))) return [];
        throw new Error(`Suggestion activity query failed: ${error.message}`);
      }
      rows.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) return rows;
    }
  };
  const results = await Promise.allSettled([
    read("response_headers->>x-catdai-lookup-id"), read("suggestion_recovery->>retry_lookup_id"),
  ]);
  for (const result of results) if (result.status === "rejected") throw result.reason;
  const events = [...new Map(results.flatMap((result) => result.value).map((event) => [event.id, event])).values()];
  return attachCadastruSuggestionActivity(searches, events);
}
