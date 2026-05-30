import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSharedCache, setSharedCache } from "@/lib/cache";
import { rateLimit } from "@/lib/rate-limit";
import { DISTRICTS_BY_CITY, matchBuildingType, matchCity, matchDistrict, validateEstimateInput } from "@/lib/validation";
import { NextResponse } from "next/server";

const limiter = rateLimit({ interval: 60_000, limit: 30 });
const ESTIMATE_RENT_CACHE_PREFIX = "catdai:estimate-rent:v7:";
const ESTIMATE_RENT_CACHE_TTL_MS = 30 * 60 * 1000;
const ESTIMATE_RENT_CACHE_TTL_SECONDS = 30 * 60;
const ESTIMATE_RENT_CACHE_MAX_ENTRIES = 250;

let estimateRentCache = new Map();

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

  const cacheKey = makeEstimateRentCacheKey(params);
  const cachedData = await getCachedEstimateRent(cacheKey);
  if (cachedData) {
    const res = NextResponse.json(cachedData);
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

  const res = NextResponse.json(enrichedData);
  res.headers.set("X-RateLimit-Remaining", String(remaining));
  res.headers.set("X-Estimate-Cache", "MISS");
  return res;
}
