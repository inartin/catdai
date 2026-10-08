import { suggestStreets } from "@/lib/cadastru-street-suggestions";
import { createSuggestionRecoveryToken, readSuggestionRecoveryToken, recordSuggestionRecovery } from "@/lib/cadastru-suggestion-recovery";
import { resolveStreet, inspectStreetAddress } from "@/lib/cadastru-streets/street-resolver";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { fetchExternalCadastruAddressData } from "@/lib/cadastru-external-api";
import { findCadastralByAddress } from "@/lib/cadastru-address-search";
import { buildCadastruPreviewPayload } from "@/lib/cadastru-preview";
import { logCadastruSearchEvent } from "@/lib/cadastru-search-events";
import { getCadastruRecordByAddress, persistCadastruAddressResult } from "@/lib/cadastru-records";
import { resolveAccessTier } from "@/lib/access-tier";
import {
  checkFeatureAccess,
  consumeFeatureCredit,
  makePaidFeatureUsageKey,
} from "@/lib/paid-feature-usage";
import { CADASTRU_SUPPORTED_CITIES, resolveCadastruSupportedCity } from "@/lib/cadastru-supported-cities";

const limiter = rateLimit({ interval: 60_000, limit: 10 });
const CADASTRU_LOOKUP_FEATURE_KEY = "cadastru_lookup";
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
  if (value === "str-la") return "str-la";
  return "str";
}

function displayRoadType(value) {
  if (value === "bulevard") return "Bulevard";
  if (value === "str-la") return "Str-la";
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
  return payload?.district || payload?.form_fields?.district || null;
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

function buildStructuredAddress({ city, roadType, street, houseNumber, apartmentNumber }) {
  return {
    city,
    region: city === "Chișinău" ? "mun. Chișinău" : null,
    street: normalizeSpaces(`${displayRoadType(roadType)} ${street}`),
    houseNumber,
    apartmentNumber,
  };
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

  const city = resolveCadastruSupportedCity(body.city || "Chișinău") || normalizeSpaces(body.city);
  const roadType = normalizeRoadType(body.road_type);
  const street = normalizeSpaces(body.street);
  const houseNumber = normalizeSpaces(body.house_number);
  const apartmentInput = normalizeSpaces(body.apartment_number);
  const apartmentNumber = /^\d{1,4}$/.test(apartmentInput) ? String(Number(apartmentInput)) : apartmentInput;

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
  const streetInput = inspectStreetAddress({ city, roadType, street, houseNumber });
  if (streetInput.status === "conflict") {
    return NextResponse.json({ error: "address_fields_conflict", field: "house_number",
      embedded_house_number: streetInput.embeddedHouseNumber, house_number: houseNumber,
      corrections: streetInput.corrections }, { status: 422 });
  }
  const resolution = streetInput.status === "cleaned"
    ? streetInput : resolveStreet({ city, roadType, street });
  if (resolution.status === "ambiguous") {
    return NextResponse.json({ error: "ambiguous_street", suggestions: resolution.suggestions }, { status: 422 });
  }
  const lookupAddress = normalizeSpaces(
    `${city}, ${roadType} ${resolution.street} ${houseNumber}${apartmentNumber ? ` ap ${apartmentNumber}` : ""}`
  );
  const suggestionAddress = { city, roadType, street, houseNumber, apartmentNumber };
  const recovery = shouldTrackCadastruSearch
    ? readSuggestionRecoveryToken(body.suggestion_recovery_token, suggestionAddress) : null;
  const recoverSuggestion = async (payload, lookupSource) => {
    if (!payload?.cadastral_number && !payload?.lands?.length && !payload?.buildings?.length) return;
    await recordSuggestionRecovery(recovery, {
      address: { ...suggestionAddress, resolvedAddress: lookupAddress }, lookupSource,
    });
  };
  let failedUsageEventId = null;
  const noResultSuggestions = () => {
    const suggestions = suggestStreets({ city, roadType, street, excludeStreet: resolution.street });
    const token = shouldTrackCadastruSearch && process.env.NODE_ENV !== "development"
      ? createSuggestionRecoveryToken(failedUsageEventId, suggestionAddress, suggestions) : null;
    return { suggestions, ...(token ? { suggestion_recovery_token: token } : {}) };
  };
  const withResolution = (payload) => ({
    ...payload,
    method: "address",
    request_address: rawAddress,
    resolved_address: lookupAddress,
    street_resolution: { status: resolution.status, original: street, resolved: resolution.street },
  });
  const publicPayload = (payload) => {
    const { district_lookup_checked, ...data } = payload;
    return data;
  };
  const skipCache = body?.skip_cache === true || body?.skipcache === true;
  const structuredAddress = buildStructuredAddress({
    city,
    roadType: body.road_type,
    street: resolution.street,
    houseNumber,
    apartmentNumber,
  });
  const recordAddressSearch = (payload, lookupSource, resultType) => shouldTrackCadastruSearch
    ? logCadastruSearchEvent(request, "address", {
        city,
        searchAddress: rawAddress,
        cadastralNumber: payload?.cadastral_number,
        district: resolvePayloadDistrict(payload),
        resultType,
        lookupSource,
      })
    : null;
  const consumeCadastruCredit = async (payload, lookupSource, evaluationToken) => {
    const idempotencyKey = payload?.cadastral_number
      ? makeCadastruNumberUsageKey(payload.cadastral_number)
      : makeCadastruAddressUsageKey(lookupAddress);
    const creditArgs = {
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
    };
    const creditUsage = process.env.NODE_ENV === "development" && shouldTrackCadastruSearch
      ? await checkFeatureAccess(creditArgs)
      : await consumeFeatureCredit(creditArgs);
    if (creditUsage.allowed) return null;
    const response = NextResponse.json(
      {
        ...buildCadastruPreviewPayload(payload, creditUsage.reason || "no_credit", {
          maskCadastralNumber: true,
        }),
        cadastru_evaluation_token: evaluationToken,
      }
    );
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return response;
  };

  const stored = skipCache ? null : await getCadastruRecordByAddress(lookupAddress, { structuredAddress });
  const shouldRefreshStoredDistrict = Boolean(stored && city === "Chișinău" && apartmentNumber &&
    !stored.payload?.district && !stored.payload?.form_fields?.district && !stored.payload?.district_lookup_checked);
  const respondWithStored = async () => {
    const payload = withResolution(stored.payload);
    const evaluationToken = await recordAddressSearch(payload, stored.lookupSource, stored.resultType || classifyAddressPayload(payload));
    const creditResponse = await consumeCadastruCredit(payload, stored.lookupSource, evaluationToken);
    await recoverSuggestion(payload, "cache");
    if (creditResponse) return creditResponse;
    const response = NextResponse.json({ ...publicPayload(payload), cadastru_evaluation_token: evaluationToken });
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return response;
  };
  if (stored && !shouldRefreshStoredDistrict) return respondWithStored();

  let externalUnavailable = false;
  try {
    const externalResult = await fetchExternalCadastruAddressData({
      city,
      road_type: body.road_type,
      street: resolution.street,
      house_number: houseNumber,
      ...(apartmentNumber ? { apartment_number: apartmentNumber } : {}),
    }, {
      trackUsage: !(process.env.NODE_ENV === "development" && shouldTrackCadastruSearch),
      captureUsageEventId: shouldTrackCadastruSearch,
      userId: access.user_id || null,
    });
    let payload = withResolution({ ...externalResult, district_lookup_checked: true });
    payload = await persistCadastruAddressResult(payload, {
      requestAddress: rawAddress,
      resolvedAddress: lookupAddress,
      structuredAddress,
      lookupSource: "api",
      officialFetch: true,
    });
    payload = withResolution(payload);
    const evaluationToken = await recordAddressSearch(payload, "api", classifyAddressPayload(payload));
    const creditResponse = await consumeCadastruCredit(payload, "api", evaluationToken);
    await recoverSuggestion(payload, "api");
    if (creditResponse) return creditResponse;

    const response = NextResponse.json({ ...publicPayload(payload), cadastru_evaluation_token: evaluationToken });
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return response;
  } catch (error) {
    if (shouldRefreshStoredDistrict) return respondWithStored();
    failedUsageEventId = error?.usageEventId || null;
    externalUnavailable = ["service_unavailable", "external_cadastru_timeout", "external_cadastru_unreachable"].includes(error?.code);
    const details = {
      code: error?.code || error?.name || "external_cadastru_failed",
      status: error?.status || null,
      message: error?.message || String(error),
      fallback: Boolean(error?.fallbackEligible),
    };

    if (error?.code === "ambiguous_street" && error?.status === 422) {
      return NextResponse.json({ error: "ambiguous_street", suggestions: error.suggestions || [] }, { status: 422 });
    }
    if (!error?.fallbackEligible) {
      console.error("[cadastru/address] external cadastru API failed:", details);
      if (error?.status === 404 || error?.code === "not_found") {
        if (shouldTrackCadastruSearch) {
          await logCadastruSearchEvent(request, "address", { city, searchAddress: rawAddress, resultType: "no_data", lookupSource: "api" });
        }
        return NextResponse.json(
          {
            error: "not_found",
            ...noResultSuggestions(),
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
    const result = await findCadastralByAddress(lookupAddress);
    let payload = withResolution(result);
    payload = await persistCadastruAddressResult(payload, {
      requestAddress: rawAddress,
      resolvedAddress: lookupAddress,
      structuredAddress,
      lookupSource: "local",
      officialFetch: true,
    });
    payload = withResolution(payload);
    const evaluationToken = await recordAddressSearch(payload, "local", classifyAddressPayload(payload));
    const creditResponse = await consumeCadastruCredit(payload, "local", evaluationToken);
    await recoverSuggestion(payload, "local");
    if (creditResponse) return creditResponse;

    const response = NextResponse.json({ ...publicPayload(payload), cadastru_evaluation_token: evaluationToken });
    response.headers.set("X-RateLimit-Remaining", String(remaining));
    return response;
  } catch (error) {
    console.error("[cadastru/address] lookup failed:", {
      message: error?.message || String(error),
      address: rawAddress,
    });

    const isUnavailable = externalUnavailable || error?.code === "service_unavailable" ||
      error?.name === "TimeoutError" || error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
    if (isUnavailable) {
      return NextResponse.json(
        { error: "service_unavailable", message: "Cadastral service is temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }

    const isNotFound = error?.code === "not_found";
    if (isNotFound && shouldTrackCadastruSearch) {
      await logCadastruSearchEvent(request, "address", { city, searchAddress: rawAddress, resultType: "no_data", lookupSource: "local" });
    }

    return NextResponse.json(
      {
        error: isNotFound ? "not_found" : "upstream_failed",
        ...(isNotFound ? noResultSuggestions() : {}),
        message: isNotFound ? "Could not find cadastral data for this address." : "Cadastral lookup failed.",
      },
      { status: isNotFound ? 404 : 502 }
    );
  }
}
