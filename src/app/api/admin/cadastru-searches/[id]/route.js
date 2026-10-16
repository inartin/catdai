import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { findCadastruSearchApiGroup } from "@/lib/admin-cadastru-search-details";

const PAGE_SIZE = 200;
const SERVICES = ["cadastru_address", "cadastru_number", "cadastru_nearby"];

async function readAll(buildQuery) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await buildQuery().order("created_at", { ascending: true })
      .order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

export async function GET(request, { params }) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid cadastru search id." }, { status: 400 });
  }

  try {
    const { data: search, error } = await supabaseAdmin.from("cadastru_search_events")
      .select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!search) return NextResponse.json({ error: "Cadastru search not found." }, { status: 404 });

    const time = Date.parse(search.created_at);
    // Discover the UUID from lightweight log metadata near the saved search,
    // then fetch that search's full payloads independently of dashboard limits.
    const events = await readAll(() => supabaseAdmin.from("external_api_usage_events")
      .select(`id, service, user_id, request_payload, response_headers, duration_ms, created_at${search.event_key ? "" : ", response_payload"}`)
      .in("service", SERVICES)
      .gte("created_at", new Date(time - 120_000).toISOString())
      .lte("created_at", new Date(time + 300_000).toISOString()));
    const nearbySearches = search.event_key ? [] : await readAll(() => supabaseAdmin.from("cadastru_search_events")
      .select("id, search_type, user_id, cadastral_number, search_address, search_request, created_at")
      .gte("created_at", new Date(time - 30_000).toISOString())
      .lte("created_at", new Date(time + 30_000).toISOString()));
    const group = findCadastruSearchApiGroup(search, events, nearbySearches);
    let calls = [];
    if (group) {
      const lookupId = group.events[0].response_headers?.["x-catdai-lookup-id"];
      calls = await readAll(() => {
        const query = supabaseAdmin.from("external_api_usage_events").select("*").in("service", SERVICES);
        return lookupId ? query.eq("response_headers->>x-catdai-lookup-id", lookupId)
          : query.in("id", group.events.map((event) => event.id));
      });
      calls = calls.filter((event) => !event.user_id || event.user_id === search.user_id);
    }
    const { event_key: _eventKey, ...details } = search;
    return NextResponse.json({ search: details, events: calls, match: group?.match || null });
  } catch (error) {
    console.error("[admin-cadastru-search-details] read failed:", error.message);
    return NextResponse.json({ error: "Failed to load cadastru search details." }, { status: 500 });
  }
}
