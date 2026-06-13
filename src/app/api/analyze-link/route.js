import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { resolveAccessTier } from "@/lib/access-tier";
import { getCachedListing, setCachedListing } from "@/lib/listing-cache";
import { fetchExternal999Listing } from "@/lib/listing999-external-api";
import { logListingLinkAnalysisEvent } from "@/lib/listing-link-analysis-events";
import {
  buildFeatureCreditRequiredPayload,
  checkPaidFeatureAccess,
  consumePaidFeatureCredit,
  makePaidFeatureUsageKey,
} from "@/lib/paid-feature-usage";
import {
  build999ListingUrl,
  extractListingIdFromUrl,
  getParsedListingAddress,
  hasExactListingAddress,
  parse999Listing,
} from "@/lib/parse-999-listing";
import {
  matchBuildingType,
  matchCity,
  matchDistrict,
  matchRenovation,
  normalizeDiacritics,
} from "@/lib/validation";

const limiter = rateLimit({ interval: 60_000, limit: 15 });
const FETCH_TIMEOUT_MS = 8_000;
const MAX_FETCH_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 600;
const MAX_BACKOFF_MS = 4_000;
const LISTING_ANALYSIS_FEATURE_KEY = "listing_analysis";

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,ru;q=0.8,en;q=0.7",
  Referer: "https://999.md/",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
};

const FEATURE_KEYS = {
  dealType: ["Tip ofertă", "Tipul ofertei", "Tip anunț"],
  category: ["Categorie", "Categoria"],
  realEstateType: ["Tip imobil", "Tipul imobilului"],
  objectType: ["Tip obiect", "Tipul obiectului"],
  propertyType: ["Tip proprietate", "Tipul proprietății"],
  rooms: "Număr de camere",
  area: "Suprafață totală",
  buildingType: "Fond locativ",
  renovation: "Starea apartamentului",
  floor: "Etaj",
  totalFloors: "Număr de etaje",
  bathrooms: "Grup sanitar",
  balconies: "Balcon/ lojie",
};

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function pickFeature(features, label) {
  const target = normalizeDiacritics(label);
  for (const [key, value] of Object.entries(features)) {
    if (normalizeDiacritics(key) === target) return value;
  }
  return null;
}

function pickAnyFeature(features, labels) {
  for (const label of labels) {
    const value = pickFeature(features, label);
    if (value) return value;
  }
  return null;
}

function parseFirstInt(value) {
  const match = String(value || "").match(/-?\d+/);
  return match ? parseInt(match[0], 10) : null;
}

function clampInt(value, min, max) {
  if (!Number.isInteger(value)) return null;
  return Math.max(min, Math.min(max, value));
}

function detectChisinau(parsed) {
  return parsed.location_parts.some(
    (part) => normalizeDiacritics(part.replace(/mun\.?/i, "")) === "chisinau"
  );
}

function textIncludesAny(value, needles) {
  const normalized = normalizeDiacritics(value || "");
  return needles.some((needle) => normalized.includes(needle));
}

function detectSellApartment(parsed) {
  const features = parsed.features || {};
  const titleText = [parsed.title, parsed.name].filter(Boolean).join(" ");

  const dealType = pickAnyFeature(features, FEATURE_KEYS.dealType);
  if (dealType ? !textIncludesAny(dealType, ["vand"]) : !textIncludesAny(titleText, ["vand"])) {
    return { error: "unsupported_listing_type" };
  }

  const categoryValues = [
    pickAnyFeature(features, FEATURE_KEYS.category),
    pickAnyFeature(features, FEATURE_KEYS.realEstateType),
    pickAnyFeature(features, FEATURE_KEYS.objectType),
    pickAnyFeature(features, FEATURE_KEYS.propertyType),
  ].filter(Boolean);
  if (categoryValues.length > 0 && !categoryValues.some((value) => textIncludesAny(value, ["apartament"]))) {
    return { error: "unsupported_listing_type" };
  }

  if (textIncludesAny(titleText, ["anchir", "inchir", "chirie", "arenda", "rent"])) {
    return { error: "unsupported_listing_type" };
  }

  if (!textIncludesAny(titleText, ["apartament"]) && categoryValues.length === 0) {
    return { error: "unsupported_listing_type" };
  }

  return { valid: true };
}

function mapToParams(parsed) {
  const supportedType = detectSellApartment(parsed);
  if (supportedType.error) return supportedType;

  const isChisinau = detectChisinau(parsed);
  if (!isChisinau) return { error: "not_chisinau" };

  const city = "Chișinău";
  let district = null;
  for (const part of parsed.location_parts) {
    const matched = matchDistrict(part, city);
    if (matched) {
      district = matched;
      break;
    }
  }
  if (!district) return { error: "insufficient_data" };

  const features = parsed.features || {};
  const rooms = clampInt(parseFirstInt(pickFeature(features, FEATURE_KEYS.rooms)), 1, 5);
  if (!rooms) return { error: "insufficient_data" };

  const params = { city, district, rooms: String(rooms) };

  const area = parseFloat(String(pickFeature(features, FEATURE_KEYS.area) || "").replace(",", "."));
  if (Number.isFinite(area) && area > 0 && area <= 1000) params.area = String(area);

  const buildingType = matchBuildingType(pickFeature(features, FEATURE_KEYS.buildingType));
  if (buildingType) params.building_type = buildingType;

  const renovation = matchRenovation(pickFeature(features, FEATURE_KEYS.renovation));
  if (renovation) params.renovation = renovation;

  const floor = parseFirstInt(pickFeature(features, FEATURE_KEYS.floor));
  if (Number.isInteger(floor) && floor >= -1 && floor <= 100) params.floor = String(floor);

  const totalFloors = parseFirstInt(pickFeature(features, FEATURE_KEYS.totalFloors));
  if (Number.isInteger(totalFloors) && totalFloors >= 1 && totalFloors <= 100) {
    params.total_floors = String(totalFloors);
  }

  const bathrooms = clampInt(parseFirstInt(pickFeature(features, FEATURE_KEYS.bathrooms)), 0, 3);
  if (bathrooms != null) params.bathrooms = String(bathrooms);

  const balconies = clampInt(parseFirstInt(pickFeature(features, FEATURE_KEYS.balconies)), 0, 3);
  if (balconies != null) params.balconies = String(balconies);

  return { params };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(header) {
  if (!header) return null;
  const seconds = parseInt(header, 10);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

async function fetchListingHtml(url) {
  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: REQUEST_HEADERS,
      });

      if (res.ok) return { html: await res.text() };

      if (res.status === 429 || res.status === 503) {
        if (attempt === MAX_FETCH_ATTEMPTS - 1) return { error: "blocked" };
        const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
        const wait = Math.min(retryAfter ?? BACKOFF_BASE_MS * 2 ** attempt, MAX_BACKOFF_MS);
        await sleep(wait);
        continue;
      }

      if (res.status === 403) return { error: "blocked" };

      return { error: "fetch_failed" };
    } catch {
      if (attempt === MAX_FETCH_ATTEMPTS - 1) return { error: "fetch_failed" };
      await sleep(Math.min(BACKOFF_BASE_MS * 2 ** attempt, MAX_BACKOFF_MS));
    } finally {
      clearTimeout(timeout);
    }
  }
  return { error: "fetch_failed" };
}

function buildSuccessPayload(externalId, parsed, params) {
  return {
    external_id: externalId,
    listing_price: parsed.price_amount,
    listing_currency: parsed.price_currency,
    listing_address: getParsedListingAddress(parsed),
    listing_url: build999ListingUrl(externalId, "ro"),
    params,
  };
}

function buildFallbackCachedPayload(externalId, parsed) {
  if (!parsed) return null;
  const mapped = mapToParams(parsed);
  if (mapped.error) return null;
  return { parsed, params: mapped.params, payload: buildSuccessPayload(externalId, parsed, mapped.params) };
}

function featureCreditRequiredResponse(reason) {
  return NextResponse.json(
    buildFeatureCreditRequiredPayload(LISTING_ANALYSIS_FEATURE_KEY, reason),
    { status: reason === "unauthorized" ? 401 : 402 }
  );
}

async function fetchAndParseListing(externalId, listingUrl) {
  try {
    const parsed = await fetchExternal999Listing(externalId);
    return parsed ? { parsed, source: "external" } : { error: "not_a_listing" };
  } catch (error) {
    if (!error?.fallbackEligible) return { error: error?.code || "fetch_failed" };
  }

  const result = await fetchListingHtml(listingUrl);
  if (result.error) return { error: result.error };
  if (!result.html) return { error: "fetch_failed" };

  const parsed = parse999Listing(result.html);
  if (!parsed) return { error: "not_a_listing" };

  return { parsed, source: "local" };
}

export async function POST(request) {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = limiter.check(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  const externalId = extractListingIdFromUrl(body?.url);
  if (!externalId) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  const listingUrl = build999ListingUrl(externalId, "ro");
  const logEvent = (event) =>
    logListingLinkAnalysisEvent(request, { externalId, listingUrl, ...event });
  const idempotencyKey = makePaidFeatureUsageKey(LISTING_ANALYSIS_FEATURE_KEY, { external_id: externalId });
  const access = await resolveAccessTier(request);
  const creditCheck = await checkPaidFeatureAccess({
    userId: access.user_id,
    featureKey: LISTING_ANALYSIS_FEATURE_KEY,
    idempotencyKey,
  });
  if (!creditCheck.allowed) {
    return featureCreditRequiredResponse(creditCheck.reason);
  }

  const respondWithSuccess = async ({ parsed, params, payload }) => {
    const creditUsage = await consumePaidFeatureCredit({
      userId: access.user_id,
      featureKey: LISTING_ANALYSIS_FEATURE_KEY,
      idempotencyKey,
      metadata: {
        feature: "listing_analysis",
        external_id: externalId,
        listing_url: listingUrl,
        params,
      },
    });

    if (!creditUsage.allowed) {
      return featureCreditRequiredResponse(creditUsage.reason || "no_credit");
    }

    await logEvent({ status: "success", parsed, params });
    return NextResponse.json(payload);
  };

  let parsed = await getCachedListing(externalId);
  if (!parsed || !hasExactListingAddress(getParsedListingAddress(parsed))) {
    const result = await fetchAndParseListing(externalId, listingUrl);
    if (result.error === "blocked") {
      const fallback = buildFallbackCachedPayload(externalId, parsed);
      if (fallback) {
        return respondWithSuccess(fallback);
      }
      await logEvent({ status: "upstream_blocked" });
      return NextResponse.json({ error: "upstream_blocked" }, { status: 503 });
    }
    if (result.error === "upstream_blocked") {
      const fallback = buildFallbackCachedPayload(externalId, parsed);
      if (fallback) {
        return respondWithSuccess(fallback);
      }
      await logEvent({ status: "upstream_blocked" });
      return NextResponse.json({ error: "upstream_blocked" }, { status: 503 });
    }
    if (result.error === "not_a_listing") {
      const fallback = buildFallbackCachedPayload(externalId, parsed);
      if (fallback) {
        return respondWithSuccess(fallback);
      }
      await logEvent({ status: "not_a_listing" });
      return NextResponse.json({ error: "not_a_listing" }, { status: 422 });
    }
    if (result.error) {
      const fallback = buildFallbackCachedPayload(externalId, parsed);
      if (fallback) {
        return respondWithSuccess(fallback);
      }
      await logEvent({ status: "fetch_failed" });
      return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
    }
    parsed = result.parsed;
    await setCachedListing(externalId, parsed);
  }

  const mapped = mapToParams(parsed);
  if (mapped.error) {
    await logEvent({ status: mapped.error, parsed });
    return NextResponse.json({ error: mapped.error }, { status: 422 });
  }

  return respondWithSuccess({
    parsed,
    params: mapped.params,
    payload: buildSuccessPayload(externalId, parsed, mapped.params),
  });
}
