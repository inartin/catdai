import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { fetchExternalCadastruAddressData } from "@/lib/cadastru-external-api";
import { findCadastralByAddress } from "@/lib/cadastru-address-search";
import { buildCadastruPreviewPayload } from "@/lib/cadastru-preview";
import { logCadastruSearchEvent } from "@/lib/cadastru-search-events";
import { getCadastruRecordByAddress, persistCadastruRecord } from "@/lib/cadastru-records";
import { resolveAccessTier } from "@/lib/access-tier";
import { getSharedCache, setSharedCache } from "@/lib/cache";
import {
  consumeFeatureCredit,
  makePaidFeatureUsageKey,
} from "@/lib/paid-feature-usage";
import { CADASTRU_SUPPORTED_CITIES } from "@/lib/cadastru-supported-cities";

const limiter = rateLimit({ interval: 60_000, limit: 10 });
const CADASTRU_LOOKUP_FEATURE_KEY = "cadastru_lookup";
const STREET_MAX_LENGTH = 80;
const HOUSE_NUMBER_MAX_LENGTH = 10;
const APARTMENT_NUMBER_MAX_LENGTH = 4;
const HOUSE_NUMBER_PATTERN = /^\d{1,4}(?:\/\d{1,4})?$/;
const APARTMENT_NUMBER_PATTERN = /^\d{1,4}$/;
const MAX_APARTMENT_NUMBER = 9999;
const CADASTRU_ADDRESS_CACHE_PREFIX = "catdai:cadastru-address:v1:";
const CADASTRU_ADDRESS_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

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

function displayRoadType(value) {
  if (value === "bulevard") return "Bulevard";
  return "Strada";
}

function hasAddressPayloadDetails(payload) {
  return Boolean(
    payload?.apartment_area_m2 ||
      payload?.apartment_floor ||
      payload?.apartment_type ||
      payload?.estimated_value_lei ||
      payload?.apartment?.area_m2 ||
      payload?.apartment?.floor ||
      payload?.apartment?.type ||
      payload?.apartment?.estimated_value_lei ||
      payload?.building?.total_floors ||
      payload?.building?.construction_year
  );
}

function classifyAddressPayload(payload) {
  return hasAddressPayloadDetails(payload) ? "apartment_only" : "address_only";
}

function resolvePayloadDistrict(payload) {
  return payload?.form_fields?.district || null;
}

function makeCadastruAddressCacheKey(rawAddress) {
  const hash = crypto
    .createHash("sha256")
    .update(normalizeSpaces(rawAddress).toLowerCase())
    .digest("hex")
    .slice(0, 32);

  return `${CADASTRU_ADDRESS_CACHE_PREFIX}${hash}`;
}

function makeCadastruAddressUsageKey(rawAddress) {
  return makePaidFeatureUsageKey(CADASTRU_LOOKUP_FEATURE_KEY, {
    address: normalizeSpaces(rawAddress).toLowerCase(),
  });
}

function makeCadastruNumberUsageKey(cadastralNumber) {
  return makePaidFeatureUsageKey(CADASTRU_LOOKUP_FEATURE_KEY, {
    cadastral_number: String(cadastralNumber || "").trim(),
  });
}

async function getCachedCadastruAddress(rawAddress) {
  const cached = await getSharedCache(makeCadastruAddressCacheKey(rawAddress));
  if (!cached?.value) return null;
  if (cached.value?.payload) {
    return {
      payload: cached.value.payload,
      lookupSource: cached.value.lookup_source === "api" || cached.value.lookup_source === "local"
        ? cached.value.lookup_source
        : null,
    };
  }
  return { payload: cached.value, lookupSource: null };
}

async function setCachedCadastruAddress(rawAddress, payload, lookupSource) {
  await setSharedCache(
    makeCadastruAddressCacheKey(rawAddress),
    {
      payload,
      lookup_source: lookupSource === "api" || lookupSource === "local" ? lookupSource : null,
    },
    CADASTRU_ADDRESS_CACHE_TTL_SECONDS
  );
}

function buildStructuredAddress({ city, roadType, street, houseNumber, apartmentNumber }) {
  return {
    city,
    region: city === "Chișinău" ? "mun. Chișinău" : null,
    street: normalizeSpaces(`${displayRoadType(roadType)} ${street}`),
    houseNumber,
    apartmentNumber,
  };
}

async function persistAddressResult(payload, options = {}) {
  if (!payload?.cadastral_number) return;
  await persistCadastruRecord(payload, {
    cadastralNumber: payload.cadastral_number,
    requestAddress: options.rawAddress,
    structuredAddress: options.structuredAddress,
    lookupSource: options.lookupSource,
    resultType: "address_only",
    officialFetch: options.officialFetch === true,
    countLookup: options.countLookup === true,
  });
}

function validateAddressFields({ street, houseNumber, apartmentNumber }) {
  if (
    street.length > STREET_MAX_LENGTH ||
    houseNumber.length > HOUSE_NUMBER_MAX_LENGTH ||
    (apartmentNumber && apartmentNumber.length > APARTMENT_NUMBER_MAX_LENGTH)
  ) {
    return { valid: false, field: "length" };
  }

  if (!HOUSE_NUMBER_PATTERN.test(houseNumber)) {
    return { valid: false, field: "house_number" };
  }

  if (apartmentNumber && !APARTMENT_NUMBER_PATTERN.test(apartmentNumber)) {
    return { valid: false, field: "apartment_number" };
  }

  if (apartmentNumber) {
    const apartmentNumberValue = Number(apartmentNumber);
    if (apartmentNumberValue < 1 || apartmentNumberValue > MAX_APARTMENT_NUMBER) {
      return { valid: false, field: "apartment_number" };
    }
  }

  return { valid: true };
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

  const access = await resolveAccessTier(request);
  const shouldTrackCadastruSearch = body?.search_context === "cadastru";
  if (!access.user_id && !shouldTrackCadastruSearch) {
    return NextResponse.json({ error: "unauthorized", message: "Unauthorized" }, { status: 401 });
  }

  const city = normalizeSpaces(body.city || "Chișinău");
  const roadType = normalizeRoadType(body.road_type);
  const street = normalizeSpaces(body.street);
  const houseNumber = normalizeSpaces(body.house_number);
  const apartmentNumber = normalizeSpaces(body.apartment_number);

  if (!CADASTRU_SUPPORTED_CITIES.includes(city)) {
    return NextResponse.json(
      { error: "unsupported_city", message: "This city is not supported." },
      { status: 400 }
    );
  }

  if (!street || !houseNumber) {
    return NextResponse.json(
      { error: "missing_fields", message: "Street and house number are required." },
      { status: 400 }
    );
  }

  const fieldValidation = validateAddressFields({ street, houseNumber, apartmentNumber });
  if (!fieldValidation.valid) {
    return NextResponse.json(
      {
        error: "invalid_address_fields",
        field: fieldValidation.field,
        message: "House number must use digits and an optional slash. Apartment number, when provided, must be a realistic number.",
      },
      { status: 400 }
    );
  }

  const rawAddress = normalizeSpaces(
    `${city}, ${roadType} ${street} ${houseNumber}${apartmentNumber ? ` ap ${apartmentNumber}` : ""}`
  );
  const skipCache = body?.skip_cache === true || body?.skipcache === true;
  const structuredAddress = buildStructuredAddress({
    city,
    roadType: body.road_type,
    street,
    houseNumber,
    apartmentNumber,
  });
  const consumeCadastruCredit = async (payload, lookupSource) => {
    const idempotencyKey = payload?.cadastral_number
      ? makeCadastruNumberUsageKey(payload.cadastral_number)
      : makeCadastruAddressUsageKey(rawAddress);
    const creditUsage = await consumeFeatureCredit({
      userId: access.user_id,
      featureKey: CADASTRU_LOOKUP_FEATURE_KEY,
      idempotencyKey,
      metadata: {
        feature: "cadastru_lookup",
        search_type: "address",
        raw_address: rawAddress,
        cadastral_number: payload?.cadastral_number || null,
        lookup_source: lookupSource || null,
      },
    });
    if (creditUsage.allowed) return null;
    const response = NextResponse.json(
      buildCadastruPreviewPayload(payload, creditUsage.reason || "no_credit", {
        maskCadastralNumber: true,
      })
    );
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return response;
  };

  const cached = skipCache ? null : await getCachedCadastruAddress(rawAddress);
  if (cached) {
    const creditResponse = await consumeCadastruCredit(cached.payload, cached.lookupSource);
    if (creditResponse) return creditResponse;

    await persistAddressResult(cached.payload, {
      rawAddress,
      structuredAddress,
      lookupSource: cached.lookupSource,
      countLookup: false,
    });
    if (shouldTrackCadastruSearch) {
      await logCadastruSearchEvent(request, "address", {
        city,
        cadastralNumber: cached.payload?.cadastral_number,
        district: resolvePayloadDistrict(cached.payload),
        resultType: classifyAddressPayload(cached.payload),
        lookupSource: cached.lookupSource,
      });
    }
    const response = NextResponse.json(cached.payload);
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return response;
  }

  const stored = !skipCache && apartmentNumber
    ? await getCadastruRecordByAddress(rawAddress, { structuredAddress })
    : null;
  if (stored?.payload?.cadastral_number) {
    const payload = {
      ...stored.payload,
      method: "address",
      request_address: rawAddress,
    };
    const creditResponse = await consumeCadastruCredit(payload, stored.lookupSource);
    if (creditResponse) return creditResponse;

    await setCachedCadastruAddress(rawAddress, payload, stored.lookupSource);
    await persistAddressResult(payload, {
      rawAddress,
      structuredAddress,
      lookupSource: stored.lookupSource,
      countLookup: false,
    });
    if (shouldTrackCadastruSearch) {
      await logCadastruSearchEvent(request, "address", {
        city,
        cadastralNumber: payload?.cadastral_number,
        district: resolvePayloadDistrict(payload),
        resultType: stored.resultType || classifyAddressPayload(payload),
        lookupSource: stored.lookupSource,
      });
    }
    const response = NextResponse.json(payload);
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return response;
  }

  try {
    const externalResult = await fetchExternalCadastruAddressData({
      city,
      road_type: body.road_type,
      street,
      house_number: houseNumber,
      ...(apartmentNumber ? { apartment_number: apartmentNumber } : {}),
    });
    const payload = {
      ...externalResult,
      method: "address",
      request_address: rawAddress,
    };
    const creditResponse = await consumeCadastruCredit(payload, "api");
    if (creditResponse) return creditResponse;

    await setCachedCadastruAddress(rawAddress, payload, "api");
    await persistAddressResult(payload, {
      rawAddress,
      structuredAddress,
      lookupSource: "api",
      officialFetch: true,
      countLookup: false,
    });
    if (shouldTrackCadastruSearch) {
      await logCadastruSearchEvent(request, "address", {
        city,
        cadastralNumber: payload?.cadastral_number,
        district: resolvePayloadDistrict(payload),
        resultType: classifyAddressPayload(payload),
        lookupSource: "api",
      });
    }
    const response = NextResponse.json(payload);
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return response;
  } catch (error) {
    const details = {
      code: error?.code || error?.name || "external_cadastru_failed",
      status: error?.status || null,
      message: error?.message || String(error),
      fallback: Boolean(error?.fallbackEligible),
    };

    if (!error?.fallbackEligible) {
      console.error("[cadastru/address] external cadastru API failed:", details);
      if (error?.status === 404 || error?.code === "not_found") {
        if (shouldTrackCadastruSearch) {
          await logCadastruSearchEvent(request, "address", { city, resultType: "no_data", lookupSource: "api" });
        }
        return NextResponse.json(
          {
            error: "not_found",
            message: "Could not find cadastral data for this address.",
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          error: "upstream_failed",
          message: "Could not find cadastral data for this address.",
        },
        { status: error?.status === 400 ? 400 : 502 }
      );
    }

    // console.error("[cadastru/address] external cadastru API unavailable, using local backup:", details);
  }

  try {
    const result = await findCadastralByAddress(rawAddress);
    const payload = {
      ...result,
      method: "address",
      request_address: rawAddress,
    };
    const creditResponse = await consumeCadastruCredit(payload, "local");
    if (creditResponse) return creditResponse;

    await setCachedCadastruAddress(rawAddress, payload, "local");
    await persistAddressResult(payload, {
      rawAddress,
      structuredAddress,
      lookupSource: "local",
      officialFetch: true,
      countLookup: false,
    });
    if (shouldTrackCadastruSearch) {
      await logCadastruSearchEvent(request, "address", {
        city,
        cadastralNumber: payload?.cadastral_number,
        district: resolvePayloadDistrict(payload),
        resultType: classifyAddressPayload(payload),
        lookupSource: "local",
      });
    }
    const response = NextResponse.json(payload);
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return response;
  } catch (error) {
    console.error("[cadastru/address] lookup failed:", {
      message: error?.message || String(error),
      address: rawAddress,
    });

    if (shouldTrackCadastruSearch) {
      await logCadastruSearchEvent(request, "address", { city, resultType: "no_data", lookupSource: "local" });
    }

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
