import crypto from "node:crypto";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
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
    .insert(row)
    .then(({ error }) => {
      if (error) console.error("estimate_log insert failed:", error.message);
    });
}

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
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

  if (body.device_id) {
    logEstimate({
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

  const res = NextResponse.json(data);
  res.headers.set("X-RateLimit-Remaining", String(remaining));
  return res;
}
