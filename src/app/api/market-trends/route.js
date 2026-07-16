import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSharedCache, setSharedCache } from "@/lib/cache";

export const dynamic = "force-dynamic";

const MARKET_TREND_DAYS = 90;
const MIN_MARKET_TREND_POINTS = 2;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_TTL_SECONDS = 12 * 60 * 60;
const CACHE_KEY = "catdai:market-trends:v2";
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=43200, stale-while-revalidate=86400",
};
const BUILDING_TYPES = [
  { key: "constructii_noi", value: "Construcţii noi" },
  { key: "secundar", value: "Secundar" },
];

let cache = null;

function isCacheFresh(cachedAt) {
  return cachedAt && Date.now() - cachedAt < CACHE_TTL_MS;
}

function getSinceDate() {
  return new Date(Date.now() - MARKET_TREND_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function buildTrendPayload(rows, buildingType) {
  const points = rows
    .map((row) => {
      const value = Number(row.median_ppm);
      if (!row.snapshot_date || !Number.isFinite(value) || value <= 0) return null;

      return {
        date: row.snapshot_date,
        value: Math.round(value),
      };
    })
    .filter(Boolean);

  if (points.length < MIN_MARKET_TREND_POINTS) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const changePct = ((last.value - first.value) / first.value) * 100;
  const lastCount = Number(rows[rows.length - 1]?.listing_count);

  return {
    scope: "city",
    district: null,
    building_type: buildingType,
    period_days: MARKET_TREND_DAYS,
    metric: "median_price_per_m2",
    start_date: first.date,
    end_date: last.date,
    start_value: first.value,
    end_value: last.value,
    change_pct: Math.round(changePct * 10) / 10,
    listing_count: Number.isFinite(lastCount) ? lastCount : null,
    points,
  };
}

export async function GET() {
  const sharedCache = await getSharedCache(CACHE_KEY);
  if (sharedCache) {
    cache = {
      cached_at: Date.now(),
      data: sharedCache.value,
    };
    return NextResponse.json(sharedCache.value, { headers: CACHE_HEADERS });
  }

  if (cache && isCacheFresh(cache.cached_at)) {
    return NextResponse.json(cache.data, { headers: CACHE_HEADERS });
  }

  try {
    const since = getSinceDate();
    const { data, error } = await supabaseAdmin
      .from("daily_price_snapshot")
      .select("snapshot_date, building_type, median_ppm, listing_count")
      .is("district", null)
      .in("building_type", BUILDING_TYPES.map((type) => type.value))
      .gte("snapshot_date", since)
      .order("snapshot_date", { ascending: true });

    if (error) throw error;

    const rows = data || [];
    const trends = Object.fromEntries(
      BUILDING_TYPES.map((type) => [
        type.key,
        buildTrendPayload(
          rows.filter((row) => row.building_type === type.value),
          type.value
        ),
      ])
    );
    const latestDate = rows.reduce((latest, row) => {
      if (!row.snapshot_date) return latest;
      return !latest || row.snapshot_date > latest ? row.snapshot_date : latest;
    }, null);
    const payload = {
      period_days: MARKET_TREND_DAYS,
      updated_at: latestDate ? `${latestDate}T00:00:00.000Z` : new Date().toISOString(),
      trends,
    };

    cache = {
      cached_at: Date.now(),
      data: payload,
    };
    await setSharedCache(CACHE_KEY, payload, CACHE_TTL_SECONDS);

    return NextResponse.json(payload, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("Failed to fetch market trends:", error.message);

    if (cache) {
      return NextResponse.json(cache.data, { headers: CACHE_HEADERS });
    }

    return NextResponse.json(
      { error: "Market trend data unavailable" },
      { status: 502 }
    );
  }
}
