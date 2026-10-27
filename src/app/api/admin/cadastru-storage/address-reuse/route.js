import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cadastruReuseCityKey, searchCadastruAddressReuse, summarizeCadastruAddressReuse } from "@/lib/admin-cadastru-address-reuse";

const PAGE = 1000;
const PAGE_SIZE = 50;
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { data: null, ts: 0 };

async function readRows(table, columns, order, searches = false) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabaseAdmin.from(table).select(columns);
    if (searches) query = query.eq("search_type", "address").is("duplicate_of", null);
    const { data, error } = await query.order(order, { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < PAGE) return rows;
  }
}

async function readInventory() {
  const [events, records, buildings] = await Promise.all([
    readRows("cadastru_search_events", "id,search_type,city,cadastral_number,search_address,search_request,user_id,created_at", "id", true),
    readRows("cadastru_records", "cadastral_number,shared_building_number,building_cadastral_number,city,street,house_number,apartment_number,full_address", "id"),
    readRows("cadastru_buildings", "cadastral_number,lookup_input", "cadastral_number"),
  ]);
  return summarizeCadastruAddressReuse(events, { records, buildings });
}

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const city = request.nextUrl.searchParams.get("city")?.trim();
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  const rawOffset = request.nextUrl.searchParams.get("offset") ?? "0";
  const offset = Number(rawOffset);
  if ((!city && !query) || (city && city.length > 100) || (query && (query.length < 2 || query.length > 200))
    || !/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset > Number.MAX_SAFE_INTEGER - PAGE_SIZE) {
    return NextResponse.json({ error: "Invalid city, search or offset." }, { status: 400 });
  }
  try {
    if (request.nextUrl.searchParams.get("fresh") === "1" || !cache.data || Date.now() - cache.ts >= CACHE_TTL_MS) {
      const data = await readInventory();
      cache = { data, ts: Date.now() };
    }
    const summary = city ? cache.data.get(cadastruReuseCityKey(city)) || { rows: [], excluded: 0 } : null;
    const rows = query ? searchCadastruAddressReuse(summary ? new Map([[city, summary]]) : cache.data, query) : summary.rows;
    return NextResponse.json({
      rows: rows.slice(offset, offset + PAGE_SIZE), total: rows.length,
      excluded: summary?.excluded || 0, hasMore: rows.length > offset + PAGE_SIZE, updatedAt: new Date(cache.ts).toISOString(),
    });
  } catch (error) {
    console.error("Failed to load cadastru address reuse:", error.message);
    return NextResponse.json({ error: "Stored properties and search statistics are temporarily unavailable." }, { status: 503 });
  }
}
