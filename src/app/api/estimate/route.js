import crypto from "node:crypto";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isPaidAccessTier, resolveAccessTier } from "@/lib/access-tier";
import { rateLimit } from "@/lib/rate-limit";
import { validateEstimateInput } from "@/lib/validation";
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
  const maskEstimateData = (estData) => {
    if (!estData) return null;
    return {
      ...estData,
      estimate: {
        ...estData.estimate,
        fast_sale: null,
        premium: null,
      },
      range: {
        low: null,
        high: null,
      },
      market_stats: {
        ...estData.market_stats,
        avg_price: null,
        avg_price_per_m2: null,
        min_price_per_m2: null,
        max_price_per_m2: null,
        p10_price_per_m2: null,
        p90_price_per_m2: null,
      },
    };
  };

  return {
    ...maskEstimateData(payload),
    district_comparison: buildDistrictComparisonPreview(payload.district_comparison),
    estimates_by_seller: payload.estimates_by_seller ? {
      individual: maskEstimateData(payload.estimates_by_seller.individual),
      agency: maskEstimateData(payload.estimates_by_seller.agency),
    } : null,
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

  const validation = validateEstimateInput({
    city: body.city,
    district: body.district,
    rooms_count: body.rooms_count,
    area_m2: body.area_m2,
    floor: body.floor,
    total_floors: body.total_floors,
    building_type: body.building_type,
    renovation: body.renovation,
    bathrooms_count: body.bathrooms_count,
    balconies_count: body.balconies_count,
  });

  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.reason, field: validation.field },
      { status: 400 }
    );
  }

  const v = validation.data;

  const params = {
    p_city: v.city,
    p_district: v.district,
    p_rooms_count: v.rooms_count,
    p_area_m2: v.area_m2,
    p_floor: v.floor ?? null,
    p_total_floors: v.total_floors ?? null,
    p_building_type: v.building_type ?? null,
    p_renovation: v.renovation ?? null,
    p_bathrooms_count: v.bathrooms_count ?? null,
    p_balconies_count: v.balconies_count ?? null,
  };

  const rpcStart = Date.now();
  const [overallRes, individualRes, agencyRes] = await Promise.all([
    supabase.rpc("estimate_price", params),
    supabase.rpc("estimate_price", { ...params, p_seller_categories: ["Persoană fizică"] }),
    supabase.rpc("estimate_price", { ...params, p_seller_categories: ["Agenție", "Dezvoltator imobiliar"] }),
  ]);
  const responseTimeMs = Date.now() - rpcStart;

  if (overallRes.error) {
    console.error("Supabase RPC error:", overallRes.error);
    return NextResponse.json(
      { error: "Failed to compute estimate" },
      { status: 500 }
    );
  }

  if (overallRes.data?.error) {
    return NextResponse.json(
      { error: overallRes.data.error, message: overallRes.data.message },
      { status: 422 }
    );
  }

  const data = overallRes.data;

  const featureAdj = computeFeatureAdjustments(
    params.p_bathrooms_count,
    params.p_balconies_count
  );

  function applyAdjustments(item) {
    if (!item || item.error || !item.estimate) return;
    if (featureAdj.items.length > 0) {
      const m = featureAdj.multiplier;
      item.estimate.fast_sale = Math.round((item.estimate.fast_sale * m) / 100) * 100;
      item.estimate.market_rate = Math.round((item.estimate.market_rate * m) / 100) * 100;
      item.estimate.premium = Math.round((item.estimate.premium * m) / 100) * 100;
      item.estimate.price_per_m2 = Math.round(item.estimate.price_per_m2 * m * 100) / 100;
    }
  }

  applyAdjustments(data);
  const individualData = individualRes.data?.error ? null : individualRes.data;
  const agencyData = agencyRes.data?.error ? null : agencyRes.data;
  if (individualData) applyAdjustments(individualData);
  if (agencyData) applyAdjustments(agencyData);

  data.feature_adjustments = featureAdj;
  data.market_position = {
    marker_pct: computeMarketMarkerPct(data),
  };

  data.estimates_by_seller = {
    individual: individualData
      ? { estimate: individualData.estimate, range: individualData.range, market_stats: individualData.market_stats }
      : null,
    agency: agencyData
      ? { estimate: agencyData.estimate, range: agencyData.range, market_stats: agencyData.market_stats }
      : null,
  };

  const access = await resolveAccessTier(request);
  let isPaid = isPaidAccessTier(access.tier);

  // If a share_slug is provided, verify server-side if the sharer was paid
  if (!isPaid && body.share_slug) {
    const { data: shareData } = await supabaseAdmin
      .from("shared_links")
      .select("sharer_is_paid")
      .eq("slug", String(body.share_slug))
      .maybeSingle();
    if (shareData?.sharer_is_paid) {
      isPaid = true;
    }
  }

  const responsePayload = isPaid
    ? { ...data, access_tier: "paid", locked_sections: {} }
    : { ...buildEstimatePreview(data), access_tier: "free" };

  if (body.device_id) {
    logEstimate({
      id: body.log_id || undefined,
      user_id: access.user_id || null,
      device_id: body.device_id,
      session_id: body.session_id || null,
      evaluation_group_id: body.evaluation_group_id || null,
      ip_hash: hashIp(ip),
      city: v.city,
      district: v.district,
      rooms_count: v.rooms_count,
      area_m2: v.area_m2,
      building_type: v.building_type || null,
      renovation: v.renovation || null,
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
