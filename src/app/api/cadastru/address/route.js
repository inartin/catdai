import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { findCadastralByAddress } from "@/lib/cadastru-address-search";
import { logCadastruSearchEvent } from "@/lib/cadastru-search-events";
import { resolveAccessTier } from "@/lib/access-tier";
import { DISTRICTS_BY_CITY, matchDistrict, normalizeDiacritics } from "@/lib/validation";

const limiter = rateLimit({ interval: 60_000, limit: 10 });
const STREET_MAX_LENGTH = 80;
const HOUSE_NUMBER_MAX_LENGTH = 10;
const APARTMENT_NUMBER_MAX_LENGTH = 4;
const HOUSE_NUMBER_PATTERN = /^\d{1,4}(?:\/\d{1,4})?$/;
const APARTMENT_NUMBER_PATTERN = /^\d{1,4}$/;
const MAX_APARTMENT_NUMBER = 9999;

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

function validateAddressFields({ street, houseNumber, apartmentNumber }) {
  if (
    street.length > STREET_MAX_LENGTH ||
    houseNumber.length > HOUSE_NUMBER_MAX_LENGTH ||
    apartmentNumber.length > APARTMENT_NUMBER_MAX_LENGTH
  ) {
    return { valid: false, field: "length" };
  }

  if (!HOUSE_NUMBER_PATTERN.test(houseNumber)) {
    return { valid: false, field: "house_number" };
  }

  if (!APARTMENT_NUMBER_PATTERN.test(apartmentNumber)) {
    return { valid: false, field: "apartment_number" };
  }

  const apartmentNumberValue = Number(apartmentNumber);
  if (apartmentNumberValue < 1 || apartmentNumberValue > MAX_APARTMENT_NUMBER) {
    return { valid: false, field: "apartment_number" };
  }

  return { valid: true };
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

  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ error: "unauthorized", message: "Unauthorized" }, { status: 401 });
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

  const fieldValidation = validateAddressFields({ street, houseNumber, apartmentNumber });
  if (!fieldValidation.valid) {
    return NextResponse.json(
      {
        error: "invalid_address_fields",
        field: fieldValidation.field,
        message: "House number must use digits and an optional slash. Apartment number must be a realistic number.",
      },
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
