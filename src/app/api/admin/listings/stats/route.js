import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

const PAGE = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { data: null, ts: 0 };

const PERIODS = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const EMPTY_PRICE_CHANGES = { total: 0, up: 0, down: 0, avgChange: 0, avgChangePct: 0 };

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

async function fetchPriceChangeStats(cutoff) {
  const params = cutoff ? { since: cutoff } : {};
  const { data, error } = await supabaseAdmin.rpc("price_change_stats", params);
  if (error) return null;
  return data;
}

function avg(arr) {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
}

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const bypassCache = request.nextUrl.searchParams.get("fresh") === "1";

  if (!bypassCache && cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const now = Date.now();
  const cutoffs = Object.fromEntries(
    Object.entries(PERIODS).map(([k, ms]) => [k, new Date(now - ms).toISOString()])
  );

  let dataResults;
  try {
    dataResults = await Promise.all([
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
      supabaseAdmin.from("listing").select("*", { count: "exact", head: true }).gte("first_seen_at", cutoffs["24h"]),
      supabaseAdmin.from("listing").select("*", { count: "exact", head: true }).gte("first_seen_at", cutoffs["7d"]),
      supabaseAdmin.from("listing").select("*", { count: "exact", head: true }).gte("first_seen_at", cutoffs["30d"]),
      supabaseAdmin.from("listing").select("*", { count: "exact", head: true }).gte("deleted_at", cutoffs["24h"]),
      supabaseAdmin.from("listing").select("*", { count: "exact", head: true }).gte("deleted_at", cutoffs["7d"]),
      supabaseAdmin.from("listing").select("*", { count: "exact", head: true }).gte("deleted_at", cutoffs["30d"]),
      fetchPriceChangeStats(cutoffs["24h"]),
      fetchPriceChangeStats(cutoffs["7d"]),
      fetchPriceChangeStats(cutoffs["30d"]),
    ]);
  } catch (err) {
    console.error("Failed to load admin listing stats:", err);
    return NextResponse.json({ error: "Failed to load listing stats" }, { status: 500 });
  }

  const [
    countAll,
    countActive,
    countOwners,
    listings,
    recentRes,
    new24h,
    new7d,
    new30d,
    removed24h,
    removed7d,
    removed30d,
    pc24h,
    pc7d,
    pc30d,
  ] = dataResults;

  const priced = listings.filter((l) => l.price_amount != null);
  const prices = priced.map((l) => Number(l.price_amount));
  const pricesPerM2 = priced.map((l) => Number(l.price_per_m2)).filter(Boolean);
  const areas = listings.map((l) => Number(l.area_m2)).filter(Boolean);

  const result = {
    totalListings: countAll.count || 0,
    activeListings: countActive.count || 0,
    totalOwners: countOwners.count || 0,
    avgPrice: avg(prices),
    avgPricePerM2: avg(pricesPerM2),
    avgArea: avg(areas),
    marketDirection: {
      "24h": {
        newListings: new24h.count || 0,
        removedListings: removed24h.count || 0,
        priceChanges: pc24h || EMPTY_PRICE_CHANGES,
      },
      "7d": {
        newListings: new7d.count || 0,
        removedListings: removed7d.count || 0,
        priceChanges: pc7d || EMPTY_PRICE_CHANGES,
      },
      "30d": {
        newListings: new30d.count || 0,
        removedListings: removed30d.count || 0,
        priceChanges: pc30d || EMPTY_PRICE_CHANGES,
      },
    },
    byDistrict: groupBy(listings, "district").slice(0, 20),
    byRooms: groupBy(listings, "rooms_count"),
    byRenovation: groupBy(listings, "renovation"),
    byBuildingType: groupBy(listings, "building_type"),
    recentListings: recentRes.data || [],
  };

  if (!bypassCache) {
    cache = { data: result, ts: Date.now() };
  }

  return NextResponse.json(result);
}
