import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PAGE = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { data: null, ts: 0 };

async function fetchCadastruStorageStats() {
  const byCity = new Map();
  let total = 0;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from("cadastru_records")
      .select("city")
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`cadastru_records stats query failed: ${error.message}`);

    const rows = data || [];
    for (const row of rows) {
      const city = row.city?.trim() || "Unknown city";
      byCity.set(city, (byCity.get(city) || 0) + 1);
    }
    total += rows.length;
    if (rows.length < PAGE) break;
  }

  return {
    available: true,
    total,
    byCity: Array.from(byCity, ([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "ro")),
  };
}

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const fresh = request.nextUrl.searchParams.get("fresh") === "1";
  if (!fresh && cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const data = await fetchCadastruStorageStats();
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to load cadastru storage stats:", error.message);
    return NextResponse.json({ available: false });
  }
}
