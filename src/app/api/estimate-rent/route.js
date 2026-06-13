import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isPaidAccessTier, resolveAccessTier } from "@/lib/access-tier";
import { getSharedCache, setSharedCache } from "@/lib/cache";
import { logCalculatorUsageEvent } from "@/lib/calculator-usage-events";
import {
  consumeFreeMonthlyFeatureUsage,
  FREE_MONTHLY_FULL_EVALUATION_LIMIT,
  makeMonthlyFeatureUsageKey,
} from "@/lib/free-monthly-feature-usage";
import { persistPaidEvaluationSnapshot } from "@/lib/evaluation-snapshots";
import {
  checkPaidFeatureAccess,
  consumePaidFeatureCredit,
  getUserFeatureCreditBalance,
  makePaidFeatureUsageKey,
} from "@/lib/paid-feature-usage";
import { getEvaluationPurchaseOffer, getFeaturePurchaseOffer } from "@/lib/payment-products";
import { rateLimit } from "@/lib/rate-limit";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { DISTRICTS_BY_CITY, matchBuildingType, matchCity, matchDistrict, validateEstimateInput } from "@/lib/validation";
import { NextResponse } from "next/server";

const limiter = rateLimit({ interval: 60_000, limit: 30 });
const RENT_EVALUATION_FEATURE_KEY = "rent_estimate";
const YIELD_CALCULATOR_FEATURE_KEY = "yield_calculator";
const ESTIMATE_RENT_CACHE_PREFIX = "catdai:estimate-rent:v7:";
const ESTIMATE_RENT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ESTIMATE_RENT_CACHE_TTL_SECONDS = 12 * 60 * 60;
const ESTIMATE_RENT_CACHE_MAX_ENTRIES = 250;
const TRACKING_SALT = process.env.TRACKING_SALT || "catdai-default-salt";

let estimateRentCache = new Map();

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
            if (fallbackError) console.error("rent estimate_log upsert failed:", fallbackError.message);
          });
        return;
      }
      if (error) console.error("rent estimate_log upsert failed:", error.message);
    });
}

function trackRentEstimate({
  body,
  access,
  data,
  ip,
  params,
  responseTimeMs,
  validationData,
}) {
  if (!body.log_id && !body.device_id) return;

  logEstimate({
    id: body.log_id || undefined,
    estimate_type: "rent",
    user_id: access.user_id || null,
    device_id: body.device_id,
    session_id: body.session_id || null,
    evaluation_group_id: body.evaluation_group_id || null,
    ip_hash: hashIp(ip),
    city: validationData.city,
    district: Array.isArray(params.p_districts) ? params.p_districts.join(", ") : null,
    rooms_count: validationData.rooms_count,
    area_m2: validationData.area_m2 ?? null,
    building_type: Array.isArray(params.p_building_types) ? params.p_building_types.join(", ") : null,
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

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function normalizeDistricts(body) {
  const city = matchCity(body.city);
  if (!city) return { valid: false, field: "city", reason: "invalid_city" };

  const cityHasDistricts = (DISTRICTS_BY_CITY[city] || []).length > 0;
  if (!cityHasDistricts) {
    return { valid: true, city, districts: [] };
  }

  const rawDistricts = Array.isArray(body.districts)
    ? body.districts
    : Array.isArray(body.regions)
      ? body.regions
      : body.district
        ? [body.district]
        : [];

  const districts = [];
  for (const rawDistrict of rawDistricts) {
    const district = matchDistrict(rawDistrict, city);
    if (!district) {
      return { valid: false, field: "districts", reason: "invalid_district" };
    }
    if (!districts.includes(district)) districts.push(district);
  }

  if (districts.length === 0) {
    return { valid: false, field: "districts", reason: "invalid_district" };
  }

  return { valid: true, city, districts };
}

function normalizeBuildingTypes(body) {
  const rawBuildingTypes = Array.isArray(body.building_types)
    ? body.building_types
    : body.building_type
      ? [body.building_type]
      : [];

  const buildingTypes = [];
  for (const rawBuildingType of rawBuildingTypes) {
    const buildingType = matchBuildingType(rawBuildingType);
    if (!buildingType) {
      return { valid: false, field: "building_types", reason: "invalid_building_type" };
    }
    if (!buildingTypes.includes(buildingType)) buildingTypes.push(buildingType);
  }

  return { valid: true, buildingTypes };
}

function normalizeShareValue(value) {
  if (Array.isArray(value)) return value.length > 0 ? normalizeShareValue(value[0]) : null;
  if (value == null || value === "") return null;
  return String(value);
}

function normalizeShareList(value) {
  const rawValues = Array.isArray(value) ? value : value != null && value !== "" ? [value] : [];
  return rawValues.map((item) => String(item)).filter(Boolean).sort();
}

function shareListsMatch(shareValue, paramValues = []) {
  const shareValues = normalizeShareList(shareValue);
  const values = normalizeShareList(paramValues);
  return shareValues.length === values.length && shareValues.every((value, index) => value === values[index]);
}

function shareParamsMatchRentParams(shareParams = {}, params = {}) {
  const shareType = normalizeShareValue(shareParams.type || shareParams.mode);
  if (shareType && shareType !== "rent") return false;

  const checks = [
    ["city", params.p_city],
    ["rooms", params.p_rooms_count],
    ["area", params.p_area_m2],
    ["floor", params.p_floor],
    ["renovation", params.p_renovation],
    ["bathrooms", params.p_bathrooms_count],
  ];

  return checks.every(([key, value]) => normalizeShareValue(shareParams[key]) === normalizeShareValue(value))
    && shareListsMatch(shareParams.district ?? shareParams.districts, params.p_districts)
    && shareListsMatch(shareParams.building_type ?? shareParams.building_types, params.p_building_types);
}

function makeEstimateRentCacheKey(params) {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(params))
    .digest("hex")
    .slice(0, 32);

  return `${ESTIMATE_RENT_CACHE_PREFIX}${hash}`;
}

async function getCachedEstimateRent(key) {
  const sharedCache = await getSharedCache(key);
  if (sharedCache?.value) {
    estimateRentCache.set(key, {
      data: sharedCache.value,
      cached_at: Date.now(),
    });
    return sharedCache.value;
  }

  const local = estimateRentCache.get(key);
  if (!local) return null;

  if (Date.now() - local.cached_at > ESTIMATE_RENT_CACHE_TTL_MS) {
    estimateRentCache.delete(key);
    return null;
  }

  return local.data;
}

async function setCachedEstimateRent(key, data) {
  estimateRentCache.set(key, {
    data,
    cached_at: Date.now(),
  });

  if (estimateRentCache.size > ESTIMATE_RENT_CACHE_MAX_ENTRIES) {
    const oldestKey = estimateRentCache.keys().next().value;
    if (oldestKey) estimateRentCache.delete(oldestKey);
  }

  await setSharedCache(key, data, ESTIMATE_RENT_CACHE_TTL_SECONDS);
}

function logRpcError(error, params, responseTimeMs) {
  if (!error) return;
  console.error("Supabase rent estimate RPC error:", {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    params,
    responseTimeMs,
  });
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

function applyRentBoundaryFilters(query, params, filtersUsed) {
  query = query
    .eq("is_active", true)
    .eq("city", params.p_city)
    .gt("price_amount", 0)
    .not("price_amount", "is", null)
    .not("external_id", "is", null);

  if (Array.isArray(params.p_districts) && params.p_districts.length > 0) {
    query = query.in("district", params.p_districts);
  }

  if (params.p_rooms_count != null) {
    query = query.eq("rooms_count", params.p_rooms_count);
  }

  if (filtersUsed?.building_type !== false && Array.isArray(params.p_building_types) && params.p_building_types.length > 0) {
    query = query.in("building_type", params.p_building_types);
  }

  if (filtersUsed?.renovation !== false && params.p_renovation) {
    const filters = getRenovationFilters(params.p_renovation);
    const clauses = filters.map((value) => `renovation.eq.${value}`);
    clauses.push("renovation.is.null", "renovation.eq.");
    query = query.or(clauses.join(","));
  }

  if (filtersUsed?.floor !== false && (params.p_floor != null || params.p_first_floor || params.p_last_floor)) {
    if (params.p_first_floor) {
      query = query.eq("floor", 1);
    } else if (params.p_last_floor) {
      if (params.p_total_floors != null) {
        query = query.eq("floor", params.p_total_floors).eq("total_floors", params.p_total_floors);
      }
    } else if (params.p_floor === 1) {
      query = query.eq("floor", 1);
    } else if (params.p_total_floors != null && params.p_floor === params.p_total_floors) {
      query = query.eq("floor", params.p_total_floors).eq("total_floors", params.p_total_floors);
    } else {
      const minFloor = Math.max(2, params.p_floor - 2);
      const maxFloor = params.p_total_floors != null
        ? Math.min(params.p_total_floors - 1, params.p_floor + 2)
        : params.p_floor + 2;
      query = query.gte("floor", minFloor).lte("floor", maxFloor);
    }
  }

  if (filtersUsed?.area !== false && params.p_area_m2 != null) {
    const tolerance = Number(filtersUsed?.area_tolerance) || 0.2;
    query = query
      .gte("area_m2", params.p_area_m2 * (1 - tolerance))
      .lte("area_m2", params.p_area_m2 * (1 + tolerance));
  }

  return query;
}

function normalizeBoundaryListing(listing) {
  if (!listing) return null;
  const priceAmount = Number(listing.price_amount);
  const areaM2 = Number(listing.area_m2);
  const pricePerM2 = Number(listing.price_per_m2);

  return {
    ...listing,
    price_per_m2: Number.isFinite(pricePerM2) && pricePerM2 > 0
      ? pricePerM2
      : (Number.isFinite(priceAmount) && Number.isFinite(areaM2) && areaM2 > 0 ? priceAmount / areaM2 : listing.price_per_m2),
  };
}

async function getRentLevelListings(params, data) {
  if (data?.rent_level_listings?.low?.external_id && data?.rent_level_listings?.high?.external_id) {
    return data.rent_level_listings;
  }

  const selectedFields = `
    external_id,
    title,
    price_amount,
    price_per_m2,
    area_m2,
    rooms_count,
    floor,
    total_floors,
    building_type,
    renovation,
    city,
    district,
    sector,
    images_count
  `;

  const lowQuery = applyRentBoundaryFilters(
    supabaseAdmin.from("listing_rent").select(selectedFields),
    params,
    data?.filters_used
  )
    .order("price_amount", { ascending: true })
    .order("external_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  const highQuery = applyRentBoundaryFilters(
    supabaseAdmin.from("listing_rent").select(selectedFields),
    params,
    data?.filters_used
  )
    .order("price_amount", { ascending: false })
    .order("external_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  const [{ data: low, error: lowError }, { data: high, error: highError }] = await Promise.all([lowQuery, highQuery]);

  if (lowError || highError) {
    console.error("Supabase rent boundary listing query error:", {
      low: lowError ? { code: lowError.code, message: lowError.message, details: lowError.details } : null,
      high: highError ? { code: highError.code, message: highError.message, details: highError.details } : null,
      params,
      filtersUsed: data?.filters_used,
    });
  }

  return {
    low: normalizeBoundaryListing(low) || data?.rent_level_listings?.low || null,
    high: normalizeBoundaryListing(high) || data?.rent_level_listings?.high || null,
  };
}

async function enrichRentEstimate(params, data) {
  if (!data || data.error) return data;

  const rentLevelListings = await getRentLevelListings(params, data);
  if (!rentLevelListings) return data;

  return {
    ...data,
    rent_level_listings: rentLevelListings,
    estimate: {
      ...(data.estimate || {}),
      ...(rentLevelListings.low?.price_amount ? { low: rentLevelListings.low.price_amount } : {}),
      ...(rentLevelListings.high?.price_amount ? { high: rentLevelListings.high.price_amount } : {}),
    },
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildRentDistrictComparisonPreview(items) {
  const districts = Array.isArray(items) ? items : [];
  const medians = districts
    .map((item) => Number(item?.median_price))
    .filter((value) => Number.isFinite(value) && value > 0);

  const maxMedian = medians.length > 0 ? Math.max(...medians) : null;

  return districts.map((item) => {
    const district = item?.district || null;
    const median = Number(item?.median_price);

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

function buildRentEstimatePreview(payload) {
  return {
    ...payload,
    estimate: {
      ...(payload.estimate || {}),
      price_per_m2: null,
      low: null,
      high: null,
    },
    range: {
      low: null,
      high: null,
    },
    market_stats: {
      ...(payload.market_stats || {}),
      avg_price: null,
      avg_price_per_m2: null,
      median_price_per_m2: null,
      min_price_per_m2: null,
      max_price_per_m2: null,
    },
    district_comparison: buildRentDistrictComparisonPreview(payload.district_comparison),
    rent_level_listings: {},
    relevant_listings: [],
    locked_sections: {
      rent_levels: true,
      market_stats_values: true,
      district_comparison_values: true,
      listing_details: true,
    },
  };
}

function buildRentUsageMetadata({ params, body }) {
  return {
    feature: "full_rent_evaluation",
    params,
    evaluation_group_id: body.evaluation_group_id || null,
    log_id: body.log_id || null,
    language: body.language || null,
  };
}

function makeYieldCalculatorUsageKey(body, params) {
  if (!body.calculator_usage) return null;

  return makePaidFeatureUsageKey(YIELD_CALCULATOR_FEATURE_KEY, {
    params,
    calculator: {
      apartment_price: body.calculator_usage.apartment_price ?? null,
      additional_investments: body.calculator_usage.additional_investments ?? null,
      include_rent_tax: body.calculator_usage.include_rent_tax === true,
    },
  });
}

function buildYieldCalculatorUsageMetadata({ params, body }) {
  return {
    feature: "yield_calculator",
    params,
    calculator_usage: body.calculator_usage || {},
  };
}

async function precheckYieldCalculatorAccess(request, body, params) {
  const idempotencyKey = makeYieldCalculatorUsageKey(body, params);
  if (!idempotencyKey) return null;

  const access = await resolveAccessTier(request);
  const check = await checkPaidFeatureAccess({
    userId: access.user_id,
    featureKey: YIELD_CALCULATOR_FEATURE_KEY,
    idempotencyKey,
  });

  return { access, idempotencyKey, check };
}

async function consumeYieldCalculatorCredit(calculatorAccess, body, params) {
  if (!calculatorAccess) return null;

  return consumePaidFeatureCredit({
    userId: calculatorAccess.access.user_id,
    featureKey: YIELD_CALCULATOR_FEATURE_KEY,
    idempotencyKey: calculatorAccess.idempotencyKey,
    metadata: buildYieldCalculatorUsageMetadata({ params, body }),
  });
}

async function resolveRentEstimateAccess(request, body, params) {
  const access = await resolveAccessTier(request);
  let hasFullAccess = isPaidAccessTier(access.tier);
  let accessSource = hasFullAccess ? "paid" : null;
  let freeMonthlyUsage = null;
  let paidCreditUsage = null;
  let paidCreditBalance = null;
  let sharedLink = null;

  if (!hasFullAccess && body.share_slug) {
    const { data: shareData } = await supabaseAdmin
      .from("shared_links")
      .select("params, sharer_is_paid")
      .eq("slug", String(body.share_slug))
      .maybeSingle();
    if (!shareData || !shareParamsMatchRentParams(shareData.params, params)) {
      throw new Error("invalid_share_params");
    }
    if (shareData?.sharer_is_paid) {
      hasFullAccess = true;
      accessSource = "shared_paid";
    }
    sharedLink = { slug: String(body.share_slug), locked: true };
  }

  if (!hasFullAccess && access.user_id) {
    const idempotencyKey = makePaidFeatureUsageKey(RENT_EVALUATION_FEATURE_KEY, params);
    paidCreditUsage = await consumePaidFeatureCredit({
      userId: access.user_id,
      featureKey: RENT_EVALUATION_FEATURE_KEY,
      idempotencyKey,
      metadata: buildRentUsageMetadata({ params, body }),
    });

    if (paidCreditUsage.allowed) {
      hasFullAccess = true;
      accessSource = "paid_credit";
    }
  }

  if (!hasFullAccess && access.user_id) {
    paidCreditBalance = await getUserFeatureCreditBalance({
      userId: access.user_id,
      featureKey: RENT_EVALUATION_FEATURE_KEY,
    });
  }

  if (!hasFullAccess && access.user_id && Number(paidCreditBalance?.total_granted) <= 0) {
    const idempotencyKey = makeMonthlyFeatureUsageKey(RENT_EVALUATION_FEATURE_KEY, params);
    freeMonthlyUsage = await consumeFreeMonthlyFeatureUsage({
      userId: access.user_id,
      featureKey: RENT_EVALUATION_FEATURE_KEY,
      idempotencyKey,
      metadata: buildRentUsageMetadata({ params, body }),
      limit: FREE_MONTHLY_FULL_EVALUATION_LIMIT,
    });

    if (freeMonthlyUsage.allowed) {
      hasFullAccess = true;
      accessSource = freeMonthlyUsage.source || "free_monthly";
    }
  }

  return { access, hasFullAccess, accessSource, freeMonthlyUsage, paidCreditUsage, paidCreditBalance, sharedLink };
}

function buildRentEstimateAccessPayload(data, estimateAccess) {
  const usage = estimateAccess.freeMonthlyUsage;
  const paidEvaluationLimitReached = Number(estimateAccess.paidCreditBalance?.total_granted) > 0;
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
      ...(estimateAccess.sharedLink ? { shared_link: estimateAccess.sharedLink } : {}),
    };
  }

  return {
    ...buildRentEstimatePreview(data),
    access_tier: "free",
    full_access: false,
    ...(estimateAccess.sharedLink ? { shared_link: estimateAccess.sharedLink } : {}),
    access_limit: paidEvaluationLimitReached
      ? {
        reason: "paid_evaluation_limit_reached",
        purchase: getEvaluationPurchaseOffer(RENT_EVALUATION_FEATURE_KEY),
      }
      : usage?.reason === "free_monthly_limit_reached"
      ? {
        reason: usage.reason,
        limit: usage.limit,
        remaining: usage.remaining_uses,
        reset_at: usage.reset_at,
        purchase: getEvaluationPurchaseOffer(RENT_EVALUATION_FEATURE_KEY),
      }
      : null,
  };
}

function buildYieldCalculatorPreviewPayload(data, calculatorAccess) {
  const preview = buildRentEstimatePreview(data);
  const reason = calculatorAccess?.check?.reason || "no_credit";

  return {
    ...preview,
    estimate: {
      ...(preview.estimate || {}),
      market_rate: null,
    },
    access_tier: calculatorAccess?.access?.tier || "free",
    full_access: false,
    access_limit: {
      reason,
      purchase: reason === "unauthorized" ? null : getFeaturePurchaseOffer(YIELD_CALCULATOR_FEATURE_KEY),
    },
    locked_sections: {
      ...(preview.locked_sections || {}),
      rent_yield_calculation: true,
    },
  };
}

/**
 * Resolves the rent-estimate response payload and the access record used for tracking.
 *
 * The rent-yield calculator (requests carrying `calculator_usage`) is a separate paid
 * product and is never subject to the free monthly evaluare limit. Missing calculator
 * credit returns a preview payload so the UI can use the same blur/lock pattern as
 * evaluation results.
 */
async function resolveRentResponse(request, body, params, rawData, calculatorAccess = null) {
  if (body.calculator_usage) {
    if (calculatorAccess?.check?.allowed !== true) {
      return {
        access: calculatorAccess?.access || await resolveAccessTier(request),
        payload: buildYieldCalculatorPreviewPayload(rawData, calculatorAccess),
      };
    }

    const paidCreditUsage = await consumeYieldCalculatorCredit(calculatorAccess, body, params);
    if (!paidCreditUsage?.allowed) {
      return {
        access: calculatorAccess.access,
        payload: buildYieldCalculatorPreviewPayload(rawData, {
          ...calculatorAccess,
          check: {
            allowed: false,
            reason: paidCreditUsage?.reason || "no_credit",
          },
        }),
      };
    }

    return {
      access: calculatorAccess.access,
      payload: {
        ...rawData,
        access_tier: calculatorAccess.access.tier,
        full_access: true,
        access_source: "paid_credit",
        paid_credit_usage: {
          remaining: paidCreditUsage.remaining_uses,
        },
        locked_sections: {},
      },
    };
  }

  const estimateAccess = await resolveRentEstimateAccess(request, body, params);
  return {
    access: estimateAccess.access,
    estimateAccess,
    payload: buildRentEstimateAccessPayload(rawData, estimateAccess),
  };
}

async function persistRentEvaluationSnapshot(rentResponse, params) {
  const estimateAccess = rentResponse?.estimateAccess;
  const usageEventId = estimateAccess?.paidCreditUsage?.usage_event_id;
  const userId = estimateAccess?.access?.user_id;
  if (estimateAccess?.accessSource !== "paid_credit" || !usageEventId || !userId) return;

  try {
    await persistPaidEvaluationSnapshot({
      usageEventId,
      userId,
      featureKey: RENT_EVALUATION_FEATURE_KEY,
      estimateType: "rent",
      params,
      result: rentResponse.payload,
    });
  } catch (error) {
    console.error("[estimate-rent] paid snapshot persist failed:", error?.message || String(error));
  }
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

  const districtValidation = normalizeDistricts(body);
  if (!districtValidation.valid) {
    return NextResponse.json(
      { error: districtValidation.reason, field: districtValidation.field },
      { status: 400 }
    );
  }

  const validation = validateEstimateInput({
    city: districtValidation.city,
    district: districtValidation.districts[0] || null,
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

  const buildingTypeValidation = normalizeBuildingTypes(body);
  if (!buildingTypeValidation.valid) {
    return NextResponse.json(
      { error: buildingTypeValidation.reason, field: buildingTypeValidation.field },
      { status: 400 }
    );
  }

  const v = validation.data;
  const params = {
    p_city: v.city,
    p_districts: districtValidation.districts,
    p_rooms_count: v.rooms_count,
    p_area_m2: v.area_m2 ?? null,
    p_floor: v.floor ?? null,
    ...(v.first_floor ? { p_first_floor: true } : {}),
    ...(v.last_floor ? { p_last_floor: true } : {}),
    p_total_floors: v.total_floors ?? null,
    p_building_types: buildingTypeValidation.buildingTypes,
    p_renovation: v.renovation ?? null,
    p_bathrooms_count: v.bathrooms_count ?? null,
    p_balconies_count: v.balconies_count ?? null,
  };

  let calculatorAccess = null;
  try {
    calculatorAccess = await precheckYieldCalculatorAccess(request, body, params);
  } catch (error) {
    console.error("[estimate-rent] calculator access check failed:", error?.message || String(error));
    return NextResponse.json(
      { error: "feature_credit_check_failed" },
      { status: 500 }
    );
  }

  const requestStart = Date.now();
  const cacheKey = makeEstimateRentCacheKey(params);
  const cachedData = await getCachedEstimateRent(cacheKey);
  if (cachedData) {
    let rentResponse;
    try {
      rentResponse = await resolveRentResponse(request, body, params, cachedData, calculatorAccess);
    } catch (accessError) {
      console.error("[estimate-rent] free monthly access check failed:", accessError?.message || String(accessError));
      return NextResponse.json(
        { error: "free_monthly_limit_check_failed" },
        { status: 500 }
      );
    }
    trackRentEstimate({
      body,
      access: rentResponse.access,
      data: cachedData,
      ip,
      params,
      responseTimeMs: Date.now() - requestStart,
      validationData: v,
    });
    await logCalculatorUsageEvent(request, {
      calculator_usage: body.calculator_usage,
      data: cachedData,
      params,
    });
    await persistRentEvaluationSnapshot(rentResponse, params);

    const res = NextResponse.json(rentResponse.payload);
    res.headers.set("X-RateLimit-Remaining", String(remaining));
    res.headers.set("X-Estimate-Cache", "HIT");
    return res;
  }

  const rpcStart = Date.now();
  const { data, error } = await supabaseAdmin.rpc("estimate_rent", params);
  const responseTimeMs = Date.now() - rpcStart;

  if (error) {
    logRpcError(error, params, responseTimeMs);
    return NextResponse.json(
      { error: "Failed to compute rent estimate" },
      { status: 500 }
    );
  }

  if (data?.error) {
    return NextResponse.json(
      { error: data.error, message: data.message },
      { status: 422 }
    );
  }

  const enrichedData = await enrichRentEstimate(params, data);

  await setCachedEstimateRent(cacheKey, enrichedData);
  let rentResponse;
  try {
    rentResponse = await resolveRentResponse(request, body, params, enrichedData, calculatorAccess);
  } catch (accessError) {
    console.error("[estimate-rent] free monthly access check failed:", accessError?.message || String(accessError));
    return NextResponse.json(
      { error: "free_monthly_limit_check_failed" },
      { status: 500 }
    );
  }
  trackRentEstimate({
    body,
    access: rentResponse.access,
    data: enrichedData,
    ip,
    params,
    responseTimeMs,
    validationData: v,
  });
  await logCalculatorUsageEvent(request, {
    calculator_usage: body.calculator_usage,
    data: enrichedData,
    params,
  });
  await persistRentEvaluationSnapshot(rentResponse, params);

  const res = NextResponse.json(rentResponse.payload);
  res.headers.set("X-RateLimit-Remaining", String(remaining));
  res.headers.set("X-Estimate-Cache", "MISS");
  return res;
}
