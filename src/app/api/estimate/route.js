import { supabase } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const limiter = rateLimit({ interval: 60_000, limit: 30 });
const REQUIRED_FIELDS = ["city", "district", "rooms_count", "area_m2"];

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

  const { data, error } = await supabase.rpc("estimate_price", params);

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

  const res = NextResponse.json(data);
  res.headers.set("X-RateLimit-Remaining", String(remaining));
  return res;
}
