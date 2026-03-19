import crypto from "node:crypto";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isPaidAccessTier, resolveAccessTier } from "@/lib/access-tier";
import { rateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

/**
 * Balconies baseline: 1 (most Chisinau apartments have exactly 1)
 * Bathrooms baseline: 1
 * Adjustments calibrated from Eastern-European appraisal standards
 * and hedonic regression studies (see research notes).
 */
function computeFeatureAdjustments(bathroomsCount, balconiesCount) {
  const items = [];

  if (balconiesCount !== null && balconiesCount !== undefined) {
    let pct = 0;
    if (balconiesCount === 0) pct = -2;
    else if (balconiesCount === 2) pct = 2;
    else if (balconiesCount >= 3) pct = 3;
    // balconiesCount === 1 → baseline, no adjustment

    if (pct !== 0) {
      items.push({
        type: "balconies",
        count: balconiesCount,
        pct,
        label: balconiesCount === 0 ? "Fără balcon" : `${balconiesCount} balcoane`,
      });
    }
  }

  if (bathroomsCount !== null && bathroomsCount !== undefined) {
    let pct = 0;
    if (bathroomsCount === 0) pct = -4;
    else if (bathroomsCount === 2) pct = 3;
    else if (bathroomsCount >= 3) pct = 5;
    // bathroomsCount === 1 → baseline, no adjustment

    if (pct !== 0) {
      items.push({
        type: "bathrooms",
        count: bathroomsCount,
        pct,
        label: bathroomsCount === 0 ? "Fără baie" : `${bathroomsCount} băi`,
      });
    }
  }

  const totalPct = items.reduce((sum, i) => sum + i.pct, 0);
  const multiplier = 1 + totalPct / 100;
  return { items, total_pct: totalPct, multiplier };
}

const limiter = rateLimit({ interval: 60_000, limit: 30 });
const REQUIRED_FIELDS = ["city", "district", "rooms_count", "area_m2"];
const TRACKING_SALT = process.env.TRACKING_SALT || "catdai-default-salt";

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip + TRACKING_SALT).digest("hex").slice(0, 16);
}

function logEstimate(row) {
  if (process.env.NODE_ENV === "development") return;
  supabaseAdmin
    .from("estimate_log")
    .upsert(row, { onConflict: "id" })
    .then(({ error }) => {
      if (error) console.error("estimate_log upsert failed:", error.message);
    });
}

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeMarketMarkerPct(payload) {
  const area = Number(payload?.input?.area_m2);
  const minPpm = Number(payload?.market_stats?.min_price_per_m2);
  const maxPpm = Number(payload?.market_stats?.max_price_per_m2);
  const marketRate = Number(payload?.estimate?.market_rate);

  if (!Number.isFinite(area) || area <= 0) return 50;
  if (!Number.isFinite(minPpm) || !Number.isFinite(maxPpm) || maxPpm <= minPpm) return 50;
  if (!Number.isFinite(marketRate)) return 50;

  const rangeMin = minPpm * area;
  const rangeMax = maxPpm * area;
  const span = rangeMax - rangeMin;
  if (!Number.isFinite(span) || span <= 0) return 50;

  return clamp(((marketRate - rangeMin) / span) * 100, 2, 98);
}

function buildDistrictComparisonPreview(items) {
  const districts = Array.isArray(items) ? items : [];
  const medians = districts
    .map((item) => Number(item?.median_ppm))
    .filter((value) => Number.isFinite(value) && value > 0);

  const maxMedian = medians.length > 0 ? Math.max(...medians) : null;

  return districts.map((item) => {
    const district = item?.district || null;
    const median = Number(item?.median_ppm);

    if (!district) return null;

    const relativeWidthPct =
      Number.isFinite(median) && median > 0 && maxMedian && maxMedian > 0
        ? clamp((median / maxMedian) * 100, 8, 100)
        : 8;

    return {
      district,
      relative_width_pct: relativeWidthPct,
    };
  }).filter(Boolean);
}

function buildEstimatePreview(payload) {
  return {
    ...payload,
    estimate: {
      ...payload.estimate,
      fast_sale: null,
      premium: null,
    },
    range: {
      low: null,
      high: null,
    },
    market_stats: {
      ...payload.market_stats,
      avg_price: null,
      avg_price_per_m2: null,
      min_price_per_m2: null,
      max_price_per_m2: null,
      p10_price_per_m2: null,
      p90_price_per_m2: null,
    },
    district_comparison: buildDistrictComparisonPreview(payload.district_comparison),
    locked_sections: {
      price_tiers: true,
      cadastral_details: true,
      market_position_numbers: true,
      district_comparison_values: true,
      market_stats_values: true,
    },
  };
}

export async function POST(request) {
  const ip = getClientIp(request);
  const { allowed, remaining, retryAfter } = limiter.check(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const missing = REQUIRED_FIELDS.filter((f) => !body[f] && body[f] !== 0);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const ALLOWED_CITIES = ["Chișinău"];
  if (!ALLOWED_CITIES.includes(body.city)) {
    return NextResponse.json(
      { error: "Only Chișinău is currently supported" },
      { status: 400 }
    );
  }

  const area = parseFloat(body.area_m2);
  if (isNaN(area) || area <= 0 || area > 1000) {
    return NextResponse.json(
      { error: "area_m2 must be a number between 1 and 1000" },
      { status: 400 }
    );
  }

  const roomsCount = parseInt(body.rooms_count, 10);
  const parsedRooms = isNaN(roomsCount) ? null : roomsCount;

  const params = {
    p_city: body.city,
    p_district: body.district || null,
    p_rooms_count: parsedRooms,
    p_area_m2: area,
    p_floor: body.floor ? parseInt(body.floor, 10) : null,
    p_total_floors: body.total_floors ? parseInt(body.total_floors, 10) : null,
    p_building_type: body.building_type || null,
    p_renovation: body.renovation || null,
    p_bathrooms_count: body.bathrooms_count ? parseInt(body.bathrooms_count, 10) : null,
    p_balconies_count: body.balconies_count != null ? parseInt(body.balconies_count, 10) : null,
  };

  const rpcStart = Date.now();
  const { data, error } = await supabase.rpc("estimate_price", params);
  const responseTimeMs = Date.now() - rpcStart;

  if (error) {
    console.error("Supabase RPC error:", error);
    return NextResponse.json(
      { error: "Failed to compute estimate" },
      { status: 500 }
    );
  }

  if (data?.error) {
    return NextResponse.json(
      { error: data.error, message: data.message },
      { status: 422 }
    );
  }

  const featureAdj = computeFeatureAdjustments(
    params.p_bathrooms_count,
    params.p_balconies_count
  );

  if (featureAdj.items.length > 0) {
    const m = featureAdj.multiplier;
    data.estimate.fast_sale   = Math.round((data.estimate.fast_sale   * m) / 100) * 100;
    data.estimate.market_rate = Math.round((data.estimate.market_rate * m) / 100) * 100;
    data.estimate.premium     = Math.round((data.estimate.premium     * m) / 100) * 100;
    data.estimate.price_per_m2 = Math.round(data.estimate.price_per_m2 * m * 100) / 100;
  }

  data.feature_adjustments = featureAdj;
  data.market_position = {
    marker_pct: computeMarketMarkerPct(data),
  };

  const access = await resolveAccessTier(request);
  const isPaid = isPaidAccessTier(access.tier);
  const responsePayload = isPaid
    ? { ...data, access_tier: "paid", locked_sections: {} }
    : { ...buildEstimatePreview(data), access_tier: "free" };

  if (body.device_id) {
    logEstimate({
      id: body.log_id || undefined,
      device_id: body.device_id,
      session_id: body.session_id || null,
      evaluation_group_id: body.evaluation_group_id || null,
      ip_hash: hashIp(ip),
      city: body.city,
      district: body.district || null,
      rooms_count: parsedRooms,
      area_m2: area,
      building_type: body.building_type || null,
      renovation: body.renovation || null,
      floor: params.p_floor,
      total_floors: params.p_total_floors,
      bathrooms_count: params.p_bathrooms_count,
      balconies_count: params.p_balconies_count,
      estimated_price: data.estimate?.market_rate ?? null,
      price_per_m2: data.estimate?.price_per_m2 ?? null,
      language: body.language || null,
      response_time_ms: responseTimeMs,
    });
  }

  const res = NextResponse.json(responsePayload);
  res.headers.set("X-RateLimit-Remaining", String(remaining));
  return res;
}
