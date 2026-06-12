import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isPaidAccessTier, resolveAccessTier } from "@/lib/access-tier";
import { getSharedCache, setSharedCache } from "@/lib/cache";
import {
  consumeFreeMonthlyFeatureUsage,
  FREE_MONTHLY_FULL_EVALUATION_LIMIT,
  makeMonthlyFeatureUsageKey,
} from "@/lib/free-monthly-feature-usage";
import { consumePaidFeatureCredit } from "@/lib/paid-feature-usage";
import { getEvaluationPurchaseOffer } from "@/lib/payment-products";
import { rateLimit } from "@/lib/rate-limit";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
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

function getRenovationFilters(renovation) {
  if (renovation === "Euroreparație") return ["Euroreparație", "Design individual"];
  if (renovation === "Reparație cosmetică") return ["Reparație cosmetică"];
  if (renovation === "Fără reparație") {
    return [
      "Fără reparație",
      "Construcție nefinisată",
      "Are nevoie de reparație",
      "Variantă sură",
      "Dat în exploatare",
    ];
  }
  return renovation ? [renovation] : [];
}

function applyComparableListingFilters(query, input, filtersUsed) {
  const area = Number(input?.area_m2);
  const floor = Number(input?.floor);
  const totalFloors = Number(input?.total_floors);
  const firstFloor = input?.first_floor === true;
  const lastFloor = input?.last_floor === true;
  const areaTolerance = Number(filtersUsed?.area_tolerance) || 0.20;

  query = query
    .eq("is_active", true)
    .not("price_per_m2", "is", null)
    .gt("price_per_m2", 0)
    .not("price_amount", "is", null)
    .gt("price_amount", 0)
    .eq("city", input.city);

  if (filtersUsed?.district && input.district) {
    query = query.eq("district", input.district);
  }
  if (input.rooms_count != null) {
    query = query.eq("rooms_count", input.rooms_count);
  }
  if (filtersUsed?.building_type && input.building_type) {
    query = query.eq("building_type", input.building_type);
  }
  if (filtersUsed?.renovation && input.renovation) {
    query = query.in("renovation", getRenovationFilters(input.renovation));
  }
  if (filtersUsed?.area && Number.isFinite(area) && area > 0) {
    query = query
      .gte("area_m2", area * (1 - areaTolerance))
      .lte("area_m2", area * (1 + areaTolerance));
  }
  if (filtersUsed?.floor && (firstFloor || lastFloor || Number.isFinite(floor))) {
    if (firstFloor && !lastFloor) {
      query = query.eq("floor", 1);
    } else if (lastFloor && !firstFloor) {
      query = query.not("floor", "is", null).not("total_floors", "is", null);
    } else if (firstFloor && lastFloor) {
      query = query.not("floor", "is", null);
    } else if (floor === 1) {
      query = query.eq("floor", 1);
    } else if (Number.isFinite(totalFloors) && floor === totalFloors) {
      query = query.not("floor", "is", null).not("total_floors", "is", null);
    } else {
      const maxFloor = Number.isFinite(totalFloors)
        ? Math.min(totalFloors - 1, floor + 2)
        : floor + 2;
      query = query.gte("floor", Math.max(2, floor - 2)).lte("floor", maxFloor);
    }
  }

  return query;
}

function matchesFinalFloorFilter(listing, input, filtersUsed) {
  if (!filtersUsed?.floor) return true;

  const firstFloor = input?.first_floor === true;
  const lastFloor = input?.last_floor === true;
  if (firstFloor || lastFloor) {
    const listingFloor = Number(listing.floor);
    const listingTotalFloors = Number(listing.total_floors);
    const matchesFirst = firstFloor && listingFloor === 1;
    const matchesLast = lastFloor && Number.isFinite(listingFloor) && Number.isFinite(listingTotalFloors) && listingFloor === listingTotalFloors;
    return matchesFirst || matchesLast;
  }

  const floor = Number(input?.floor);
  const totalFloors = Number(input?.total_floors);
  if (!Number.isFinite(floor) || !Number.isFinite(totalFloors) || floor !== totalFloors) {
    return true;
  }

  return Number(listing.floor) === Number(listing.total_floors);
}

function pickRandomItems(items, limit) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, limit);
}

async function fetchRelevantListings(payload) {
  const input = payload?.input;
  const filtersUsed = payload?.filters_used || {};
  if (!input?.city) return [];

  const countQuery = applyComparableListingFilters(
    supabaseAdmin.from("listing").select("external_id", { count: "exact", head: true }),
    input,
    filtersUsed
  );
  const { count, error: countError } = await countQuery;

  if (countError || !count) {
    if (countError) console.error("Relevant listings count error:", countError.message);
    return [];
  }

  const fields = [
    "external_id",
    "title",
    "price_amount",
    "price_per_m2",
    "area_m2",
    "rooms_count",
    "floor",
    "total_floors",
    "building_type",
    "renovation",
    "city",
    "district",
    "sector",
    "images_count",
  ].join(", ");
  const batchSize = Math.min(count, 100);

  for (let attempt = 0; attempt < 3; attempt++) {
    const offset = count > batchSize
      ? Math.floor(Math.random() * (count - batchSize + 1))
      : 0;
    const query = applyComparableListingFilters(
      supabaseAdmin.from("listing").select(fields),
      input,
      filtersUsed
    );
    const { data, error } = await query
      .order("external_id", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error("Relevant listings fetch error:", error.message);
      return [];
    }

    const listings = (data || []).filter((listing) =>
      matchesFinalFloorFilter(listing, input, filtersUsed)
    );
    const picked = pickRandomItems(listings, 3);
    if (picked.length >= 3 || count <= batchSize) return picked;
  }

  return [];
}

const limiter = rateLimit({ interval: 60_000, limit: 30 });
const TRACKING_SALT = process.env.TRACKING_SALT || "catdai-default-salt";
const MARKET_TREND_DAYS = 30;
const MIN_MARKET_TREND_POINTS = 2;
const ESTIMATE_CACHE_TTL_MS = 30 * 60 * 1000;
const ESTIMATE_CACHE_TTL_SECONDS = 30 * 60;
const ESTIMATE_CACHE_MAX_ENTRIES = 250;
const ESTIMATE_CACHE_PREFIX = "catdai:estimate:v1:";
const FULL_EVALUATION_FEATURE_KEY = "sale_estimate";

let estimateCache = new Map();

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip + TRACKING_SALT).digest("hex").slice(0, 16);
}

function logEstimate(row) {
  if (!shouldPersistRuntimeData()) return;
  supabaseAdmin
    .from("estimate_log")
    .upsert(row, { onConflict: "id" })
    .then(({ error }) => {
      if (error?.code === "PGRST204" && row.estimate_type) {
        const { estimate_type, ...fallbackRow } = row;
        supabaseAdmin
          .from("estimate_log")
          .upsert(fallbackRow, { onConflict: "id" })
          .then(({ error: fallbackError }) => {
            if (fallbackError) console.error("estimate_log upsert failed:", fallbackError.message);
          });
        return;
      }
      if (error) console.error("estimate_log upsert failed:", error.message);
    });
}

function normalizeEstimateLanguage(language) {
  return language === "ru" ? "ru" : "ro";
}

function makeEstimateCacheKey(params, language) {
  const payload = {
    ...params,
    language: normalizeEstimateLanguage(language),
  };
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 32);

  return `${ESTIMATE_CACHE_PREFIX}${hash}`;
}

async function getCachedEstimate(key) {
  const sharedCache = await getSharedCache(key);
  if (sharedCache?.value) {
    estimateCache.set(key, {
      data: sharedCache.value,
      cached_at: Date.now(),
    });
    return sharedCache.value;
  }

  const local = estimateCache.get(key);
  if (!local) return null;

  if (Date.now() - local.cached_at > ESTIMATE_CACHE_TTL_MS) {
    estimateCache.delete(key);
    return null;
  }

  return local.data;
}

async function setCachedEstimate(key, data) {
  estimateCache.set(key, {
    data,
    cached_at: Date.now(),
  });

  if (estimateCache.size > ESTIMATE_CACHE_MAX_ENTRIES) {
    const oldestKey = estimateCache.keys().next().value;
    if (oldestKey) estimateCache.delete(oldestKey);
  }

  await setSharedCache(key, data, ESTIMATE_CACHE_TTL_SECONDS);
}

function logRpcError(label, error, params, responseTimeMs) {
  if (!error) return;
  console.error("Supabase estimate RPC error:", {
    label,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    params,
    responseTimeMs,
  });
}

function trackEstimate({
  body,
  access,
  data,
  ip,
  params,
  responseTimeMs,
  validationData,
}) {
  if (!body.device_id) return;

  logEstimate({
    id: body.log_id || undefined,
    estimate_type: "sale",
    user_id: access.user_id || null,
    device_id: body.device_id,
    session_id: body.session_id || null,
    evaluation_group_id: body.evaluation_group_id || null,
    ip_hash: hashIp(ip),
    city: validationData.city,
    district: validationData.district,
    rooms_count: validationData.rooms_count,
    area_m2: validationData.area_m2 ?? null,
    building_type: validationData.building_type || null,
    renovation: validationData.renovation || null,
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

function buildUsageMetadata({ params, body }) {
  return {
    feature: "full_sale_evaluation",
    params,
    evaluation_group_id: body.evaluation_group_id || null,
    log_id: body.log_id || null,
    language: body.language || null,
  };
}

async function resolveEstimateAccess(request, body, params) {
  const access = await resolveAccessTier(request);
  let hasFullAccess = isPaidAccessTier(access.tier);
  let accessSource = hasFullAccess ? "paid" : null;
  let freeMonthlyUsage = null;
  let paidCreditUsage = null;

  // If a share_slug is provided, verify server-side if the sharer was paid
  if (!hasFullAccess && body.share_slug) {
    const { data: shareData } = await supabaseAdmin
      .from("shared_links")
      .select("sharer_is_paid")
      .eq("slug", String(body.share_slug))
      .maybeSingle();
    if (shareData?.sharer_is_paid) {
      hasFullAccess = true;
      accessSource = "shared_paid";
    }
  }

  if (!hasFullAccess && access.user_id) {
    const idempotencyKey = makeMonthlyFeatureUsageKey(FULL_EVALUATION_FEATURE_KEY, params);
    freeMonthlyUsage = await consumeFreeMonthlyFeatureUsage({
      userId: access.user_id,
      featureKey: FULL_EVALUATION_FEATURE_KEY,
      idempotencyKey,
      metadata: buildUsageMetadata({ params, body }),
      limit: FREE_MONTHLY_FULL_EVALUATION_LIMIT,
    });

    if (freeMonthlyUsage.allowed) {
      hasFullAccess = true;
      accessSource = freeMonthlyUsage.source || "free_monthly";
    }
  }

  if (!hasFullAccess && access.user_id && freeMonthlyUsage?.reason === "free_monthly_limit_reached") {
    const idempotencyKey = makeMonthlyFeatureUsageKey(FULL_EVALUATION_FEATURE_KEY, params);
    paidCreditUsage = await consumePaidFeatureCredit({
      userId: access.user_id,
      featureKey: FULL_EVALUATION_FEATURE_KEY,
      idempotencyKey,
      metadata: buildUsageMetadata({ params, body }),
    });

    if (paidCreditUsage.allowed) {
      hasFullAccess = true;
      accessSource = "paid_credit";
    }
  }

  return { access, hasFullAccess, accessSource, freeMonthlyUsage, paidCreditUsage };
}

function buildEstimateAccessPayload(data, estimateAccess) {
  const usage = estimateAccess.freeMonthlyUsage;
  if (estimateAccess.hasFullAccess) {
    return {
      ...data,
      access_tier: estimateAccess.access.tier,
      full_access: true,
      access_source: estimateAccess.accessSource,
      free_monthly_usage: usage
        ? {
          limit: usage.limit,
          remaining: usage.remaining_uses,
          reset_at: usage.reset_at,
        }
        : null,
      paid_credit_usage: estimateAccess.paidCreditUsage
        ? {
          remaining: estimateAccess.paidCreditUsage.remaining_uses,
        }
        : null,
      locked_sections: {},
    };
  }

  return {
    ...buildEstimatePreview(data),
    access_tier: "free",
    full_access: false,
    access_limit: usage?.reason === "free_monthly_limit_reached"
      ? {
        reason: usage.reason,
        limit: usage.limit,
        remaining: usage.remaining_uses,
        reset_at: usage.reset_at,
        purchase: getEvaluationPurchaseOffer(FULL_EVALUATION_FEATURE_KEY),
      }
      : null,
  };
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

async function fetchDailySnapshotRows({ district, buildingType, since }) {
  if (!buildingType) return [];

  let query = supabaseAdmin
    .from("daily_price_snapshot")
    .select("snapshot_date, district, building_type, median_ppm, listing_count")
    .eq("building_type", buildingType)
    .gte("snapshot_date", since)
    .order("snapshot_date", { ascending: true });

  query = district ? query.eq("district", district) : query.is("district", null);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function buildMarketTrendPayload(pointsInput, { scope, district, buildingType, metric, listingCount }) {
  const points = pointsInput
    .map((point) => {
      const value = Number(point.value);

      if (!point.date || !Number.isFinite(value) || value <= 0) return null;

      return {
        date: point.date,
        value: Math.round(value),
      };
    })
    .filter(Boolean);

  if (points.length < MIN_MARKET_TREND_POINTS) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const changePct = ((last.value - first.value) / first.value) * 100;

  return {
    scope,
    district,
    building_type: buildingType,
    period_days: MARKET_TREND_DAYS,
    metric,
    start_date: first.date,
    end_date: last.date,
    start_value: first.value,
    end_value: last.value,
    change_pct: Math.round(changePct * 10) / 10,
    listing_count: listingCount,
    points,
  };
}

function buildSnapshotTrend(rows, { scope, district, buildingType }) {
  const points = rows.map((row) => ({
    date: row.snapshot_date,
    value: row.median_ppm,
  }));

  const lastCount = Number(rows[rows.length - 1]?.listing_count);

  return buildMarketTrendPayload(points, {
    scope,
    district,
    buildingType,
    metric: "median_price_per_m2",
    listingCount: Number.isFinite(lastCount) ? lastCount : null,
  });
}

async function fetchMarketTrend(input) {
  if (!input?.building_type) return null;

  const since = new Date(Date.now() - MARKET_TREND_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  try {
    if (input.district) {
      const rows = await fetchDailySnapshotRows({
        district: input.district,
        buildingType: input.building_type,
        since,
      });
      const trend = buildSnapshotTrend(rows, {
        scope: "district",
        district: input.district,
        buildingType: input.building_type,
      });
      if (trend) return trend;
    }

    const fallbackRows = await fetchDailySnapshotRows({
      district: null,
      buildingType: input.building_type,
      since,
    });

    return buildSnapshotTrend(fallbackRows, {
      scope: "city",
      district: null,
      buildingType: input.building_type,
    });
  } catch (error) {
    console.error("Market trend fetch failed:", error.message);
    return null;
  }
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
  const maskEstimateData = (estData, { keepMarketRate = false } = {}) => {
    if (!estData) return null;
    return {
      ...estData,
      estimate: {
        ...estData.estimate,
        market_rate: keepMarketRate ? estData.estimate?.market_rate ?? null : null,
        price_per_m2: null,
        fast_sale: null,
        premium: null,
      },
      range: {
        low: null,
        high: null,
      },
      market_stats: {
        ...estData.market_stats,
        comparable_count: null,
        avg_price: null,
        avg_price_per_m2: null,
        median_price_per_m2: null,
        min_price_per_m2: null,
        max_price_per_m2: null,
        p10_price_per_m2: null,
        p90_price_per_m2: null,
      },
    };
  };

  return {
    ...maskEstimateData(payload, { keepMarketRate: true }),
    district_coefficient: null,
    district_comparison: buildDistrictComparisonPreview(payload.district_comparison),
    estimates_by_seller: payload.estimates_by_seller ? {
      individual: maskEstimateData(payload.estimates_by_seller.individual),
      agency: maskEstimateData(payload.estimates_by_seller.agency),
    } : null,
    market_position: { marker_pct: 50 },
    market_trend: null,
    relevant_listings: [],
    listing_duplicates: null,
    locked_sections: {
      price_tiers: true,
      market_position_numbers: true,
      district_comparison_values: true,
      market_stats_values: true,
      seller_breakdown_values: true,
      listing_details: true,
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
    first_floor: body.first_floor,
    last_floor: body.last_floor,
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
    p_area_m2: v.area_m2 ?? null,
    p_floor: v.floor ?? null,
    ...(v.first_floor ? { p_first_floor: true } : {}),
    ...(v.last_floor ? { p_last_floor: true } : {}),
    p_total_floors: v.total_floors ?? null,
    p_building_type: v.building_type ?? null,
    p_renovation: v.renovation ?? null,
    p_bathrooms_count: v.bathrooms_count ?? null,
    p_balconies_count: v.balconies_count ?? null,
  };

  const requestStart = Date.now();
  const cacheKey = makeEstimateCacheKey(params, body.language);
  const cachedData = await getCachedEstimate(cacheKey);

  if (cachedData) {
    let estimateAccess;
    try {
      estimateAccess = await resolveEstimateAccess(request, body, params);
    } catch (error) {
      console.error("[estimate] free monthly access check failed:", error?.message || String(error));
      return NextResponse.json(
        { error: "free_monthly_limit_check_failed" },
        { status: 500 }
      );
    }
    const responseTimeMs = Date.now() - requestStart;
    trackEstimate({
      body,
      access: estimateAccess.access,
      data: cachedData,
      ip,
      params,
      responseTimeMs,
      validationData: v,
    });

    const responsePayload = buildEstimateAccessPayload(cachedData, estimateAccess);
    const res = NextResponse.json(responsePayload);
    res.headers.set("X-RateLimit-Remaining", String(remaining));
    res.headers.set("X-Estimate-Cache", "HIT");
    return res;
  }

  const rpcStart = Date.now();
  const [overallRes, individualRes, agencyRes] = await Promise.all([
    supabaseAdmin.rpc("estimate_price", params),
    supabaseAdmin.rpc("estimate_price", {
      ...params,
      p_seller_categories: ["Persoană fizică"],
      p_include_district_comparison: false,
      p_include_relevant_listings: false,
    }),
    supabaseAdmin.rpc("estimate_price", {
      ...params,
      p_seller_categories: ["Agenție", "Dezvoltator imobiliar"],
      p_include_district_comparison: false,
      p_include_relevant_listings: false,
    }),
  ]);
  const responseTimeMs = Date.now() - rpcStart;

  if (overallRes.error) {
    logRpcError("overall", overallRes.error, params, responseTimeMs);
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
  logRpcError("seller_individual", individualRes.error, {
    ...params,
    p_seller_categories: ["Persoană fizică"],
    p_include_district_comparison: false,
    p_include_relevant_listings: false,
  }, responseTimeMs);
  logRpcError("seller_agency", agencyRes.error, {
    ...params,
    p_seller_categories: ["Agenție", "Dezvoltator imobiliar"],
    p_include_district_comparison: false,
    p_include_relevant_listings: false,
  }, responseTimeMs);

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
  data.market_trend = await fetchMarketTrend(data.input);

  data.estimates_by_seller = {
    individual: individualData
      ? { estimate: individualData.estimate, range: individualData.range, market_stats: individualData.market_stats }
      : null,
    agency: agencyData
      ? { estimate: agencyData.estimate, range: agencyData.range, market_stats: agencyData.market_stats }
      : null,
  };

  if (!Array.isArray(data.relevant_listings) || data.relevant_listings.length === 0) {
    data.relevant_listings = await fetchRelevantListings(data);
  }

  await setCachedEstimate(cacheKey, data);
  let estimateAccess;
  try {
    estimateAccess = await resolveEstimateAccess(request, body, params);
  } catch (error) {
    console.error("[estimate] free monthly access check failed:", error?.message || String(error));
    return NextResponse.json(
      { error: "free_monthly_limit_check_failed" },
      { status: 500 }
    );
  }

  const responsePayload = buildEstimateAccessPayload(data, estimateAccess);

  trackEstimate({
    body,
    access: estimateAccess.access,
    data,
    ip,
    params,
    responseTimeMs,
    validationData: v,
  });

  const res = NextResponse.json(responsePayload);
  res.headers.set("X-RateLimit-Remaining", String(remaining));
  res.headers.set("X-Estimate-Cache", "MISS");
  return res;
}
