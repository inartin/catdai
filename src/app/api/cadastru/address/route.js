import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { findCadastralByAddress } from "@/lib/cadastru-address-search";
import { logCadastruSearchEvent } from "@/lib/cadastru-search-events";
import { DISTRICTS_BY_CITY, matchDistrict, normalizeDiacritics } from "@/lib/validation";

const limiter = rateLimit({ interval: 60_000, limit: 10 });

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function normalizeSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeRoadType(value) {
  if (value === "bulevard") return "bd";
  return "str";
}

function findDistrictInText(value) {
  const text = String(value || "");
  const cleaned = text
    .replace(/\bSector\b/gi, "")
    .replace(/^sectorul\s*/i, "")
    .replace(/^sect\.\s*/i, "")
    .trim();
  const direct = matchDistrict(cleaned, "Chișinău");
  if (direct) return direct;

  const normalized = normalizeDiacritics(text);
  return (DISTRICTS_BY_CITY["Chișinău"] || []).find((district) =>
    normalized.includes(normalizeDiacritics(district))
  ) || null;
}

function resolveDistrictFromLookupResult(result) {
  const candidates = [
    result?.matched_address,
    result?.building_address,
    result?.geocoded_address,
  ];

  for (const value of candidates) {
    if (!value) continue;

    const sectorMatch = String(value).match(/(?:sect\.|sector(?:ul)?)\s*([^,\s][^,]*?)(?:\s+(?:str|bd|bulevard|sos|al)\b|,|$)/i);
    const district = findDistrictInText(sectorMatch?.[1]?.trim() || value);
    if (district) return district;
  }

  return null;
}

export async function POST(request) {
  const ip = getClientIp(request);
  const { allowed, remaining, retryAfter } = limiter.check(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: "too_many_requests", message: "Too many requests. Please try again later." },
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
    return NextResponse.json({ error: "invalid_json", message: "Invalid JSON body" }, { status: 400 });
  }

  const city = normalizeSpaces(body.city || "Chișinău");
  const roadType = normalizeRoadType(body.road_type);
  const street = normalizeSpaces(body.street);
  const houseNumber = normalizeSpaces(body.house_number);
  const apartmentNumber = normalizeSpaces(body.apartment_number);

  if (city !== "Chișinău") {
    return NextResponse.json(
      { error: "unsupported_city", message: "Only Chișinău is supported for now." },
      { status: 400 }
    );
  }

  if (!street || !houseNumber || !apartmentNumber) {
    return NextResponse.json(
      { error: "missing_fields", message: "Street, house number, and apartment number are required." },
      { status: 400 }
    );
  }

  const rawAddress = normalizeSpaces(`${city}, ${roadType} ${street} ${houseNumber} ap ${apartmentNumber}`);

  try {
    const result = await findCadastralByAddress(rawAddress);
    await logCadastruSearchEvent(request, "address", {
      district: resolveDistrictFromLookupResult(result),
    });
    const response = NextResponse.json({
      ...result,
      method: "address",
      request_address: rawAddress,
    });
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return response;
  } catch (error) {
    console.error("[cadastru/address] lookup failed:", {
      message: error?.message || String(error),
      address: rawAddress,
    });

    await logCadastruSearchEvent(request, "address");

    const isTimeout = error?.name === "TimeoutError" || error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
    return NextResponse.json(
      {
        error: "not_found",
        message: "Could not find cadastral data for this address.",
      },
      { status: isTimeout ? 504 : 404 }
    );
  }
}
