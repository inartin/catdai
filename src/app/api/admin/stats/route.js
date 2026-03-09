import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

const PAGE = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { data: null, ts: 0 };

async function fetchAllRows(buildQuery) {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function groupBy(arr, key) {
  const map = {};
  for (const item of arr) {
    const k = item[key] ?? "N/A";
    if (!map[k]) map[k] = { key: String(k), count: 0, totalPrice: 0, priceCount: 0 };
    map[k].count++;
    if (item.price_amount != null) {
      map[k].totalPrice += Number(item.price_amount);
      map[k].priceCount++;
    }
  }
  return Object.values(map)
    .map((g) => ({
      key: g.key,
      count: g.count,
      avgPrice: g.priceCount > 0 ? g.totalPrice / g.priceCount : null,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function GET() {
  if (cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const [countAll, countActive, countOwners, listings, recentRes] =
    await Promise.all([
      supabaseAdmin.from("listing").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("listing")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      supabaseAdmin.from("owner").select("*", { count: "exact", head: true }),
      fetchAllRows(() =>
        supabaseAdmin
          .from("listing")
          .select(
            "price_amount, price_per_m2, area_m2, rooms_count, district, sector, city, renovation, building_type"
          )
          .eq("is_active", true)
      ),
      supabaseAdmin
        .from("listing")
        .select(
          "id, title, price_amount, price_currency, area_m2, rooms_count, district, sector, is_active, created_at, source_url"
        )
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const priced = listings.filter((l) => l.price_amount != null);
  const prices = priced.map((l) => Number(l.price_amount));
  const pricesPerM2 = priced.map((l) => Number(l.price_per_m2)).filter(Boolean);
  const areas = listings.map((l) => Number(l.area_m2)).filter(Boolean);
  const avg = (arr) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const result = {
    totalListings: countAll.count || 0,
    activeListings: countActive.count || 0,
    totalOwners: countOwners.count || 0,
    avgPrice: avg(prices),
    avgPricePerM2: avg(pricesPerM2),
    avgArea: avg(areas),
    byDistrict: groupBy(listings, "district").slice(0, 20),
    byRooms: groupBy(listings, "rooms_count"),
    byRenovation: groupBy(listings, "renovation"),
    byBuildingType: groupBy(listings, "building_type"),
    recentListings: recentRes.data || [],
  };

  cache = { data: result, ts: Date.now() };
  return NextResponse.json(result);
}
