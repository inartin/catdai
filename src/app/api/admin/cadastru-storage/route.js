import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { summarizeCadastruCities, summarizeCadastruStorage } from "@/lib/admin-cadastru-storage-stats";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PAGE = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const caches = new Map();

async function readRows(table, columns, order) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabaseAdmin.from(table).select(columns);
    for (const column of order.split(",")) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} stats query failed: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < PAGE) return rows;
  }
}

async function fetchCadastruStorageStats(view) {
  if (view === "cities") {
    const [records, buildings] = await Promise.all([
      readRows("cadastru_records", "cadastral_number,city,shared_building_number", "id"),
      readRows("cadastru_buildings", "cadastral_number,lookup_input", "cadastral_number"),
    ]);
    return summarizeCadastruCities({ records, buildings });
  }
  // Read only counting/coverage metadata, never entire property or nearby payloads.
  const [records, buildings, addresses, nearby, transport, reports] = await Promise.all([
    readRows("cadastru_records", "cadastral_number,city,shared_building_number,result_type,apartment_area_m2,apartment_floor,next_refresh_after,unit_list_entry:raw_payload->unit_list_entry", "id"),
    readRows("cadastru_buildings", "cadastral_number,lookup_input,expires_at,collection_snapshot", "cadastral_number"),
    readRows("cadastru_building_addresses", "building_number,origin_key", "origin_key,building_number"),
    ...["cadastru_nearby", "cadastru_public_transport", "cadastru_municipal_reports"].map((table) =>
      readRows(table, "origin_key,expires_at,incomplete:raw_payload->incomplete,stale:raw_payload->cache->stale", "origin_key")),
  ]);
  return summarizeCadastruStorage({ records, buildings, addresses, nearby, transport, reports }, Date.now(), { includeCities: view === "all" });
}

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  const requestedView = request.nextUrl.searchParams.get("view");
  const view = ["overview", "cities"].includes(requestedView) ? requestedView : "all";
  const cache = caches.get(view);
  if (!fresh && cache?.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const data = await fetchCadastruStorageStats(view);
    caches.set(view, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to load cadastru storage stats:", error.message);
    return NextResponse.json({ available: false });
  }
}
