import { NextResponse } from "next/server";
import { findListingDuplicates } from "@/lib/listing-duplicates";
import { resolveAccessTier } from "@/lib/access-tier";
import { buildFeatureCreditRequiredPayload, checkPaidFeatureAccess, makePaidFeatureUsageKey } from "@/lib/paid-feature-usage";
import { extractListingIdFromUrl } from "@/lib/parse-999-listing";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const limiter = rateLimit({ interval: 60_000, limit: 30 });
const LISTING_ANALYSIS_FEATURE_KEY = "listing_analysis";
const LOCKED_DUPLICATE_TEMPLATES = [
  {
    title: "Apartament cu 2 camere in bloc nou",
    address_text: "str. Alba Iulia 99",
    city: "chisinau",
    district: "buiucani",
    floor: 9,
    total_floors: 12,
    price_amount: 99999,
    price_currency: "EUR",
    price_per_m2: 9999,
    area_m2: 99,
    rooms_count: 2,
    building_type: "new",
    renovation: null,
  },
  {
    title: "Apartament luminos langa parc",
    address_text: "bd. Dacia 99",
    city: "chisinau",
    district: "botanica",
    floor: 6,
    total_floors: 9,
    price_amount: 99999,
    price_currency: "EUR",
    price_per_m2: 9999,
    area_m2: 99,
    rooms_count: 2,
    building_type: null,
    renovation: "euro",
  },
  {
    title: "Apartament renovat, zona centrala",
    address_text: "str. Bucuresti 99",
    city: "chisinau",
    district: "centru",
    floor: 4,
    total_floors: 9,
    price_amount: 99999,
    price_currency: "EUR",
    price_per_m2: 9999,
    area_m2: 99,
    rooms_count: 2,
    building_type: null,
    renovation: null,
  },
];

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function withUrlExternalId(body) {
  if (body?.external_id || body?.listing_id) return body;
  const listing = body?.listing && typeof body.listing === "object" ? body.listing : {};
  const url = body?.url || body?.source_url || body?.listing_url || listing.source_url || listing.listing_url;
  if (!url) return body;
  const externalId = extractListingIdFromUrl(url);
  return externalId ? { ...body, external_id: externalId } : body;
}

function getListingDuplicateExternalId(body) {
  const listing = body?.listing && typeof body.listing === "object" ? body.listing : {};
  const externalId = body?.external_id || body?.listing_id || listing.external_id || listing.listing_id;
  return externalId ? String(externalId).trim() : null;
}

async function requireListingAnalysisAccess(request, body) {
  const externalId = getListingDuplicateExternalId(body);
  if (!externalId) {
    return {
      allowed: false,
      response: NextResponse.json(
        { error: "missing_external_id" },
        { status: 400 }
      ),
    };
  }

  const access = await resolveAccessTier(request);
  const check = await checkPaidFeatureAccess({
    userId: access.user_id,
    featureKey: LISTING_ANALYSIS_FEATURE_KEY,
    idempotencyKey: makePaidFeatureUsageKey(LISTING_ANALYSIS_FEATURE_KEY, { external_id: externalId }),
  });

  if (check.allowed) return { allowed: true };

  return {
    allowed: false,
    reason: check.reason || "no_credit",
  };
}

function buildLockedDuplicateListings(count, probability, offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const template = LOCKED_DUPLICATE_TEMPLATES[(offset + index) % LOCKED_DUPLICATE_TEMPLATES.length];
    return {
      ...template,
      id: `locked-${probability}-${index + 1}`,
      external_id: `99900000${offset + index + 1}`,
      source_url: `https://999.md/ro/99900000${offset + index + 1}`,
      match: {
        probability,
        score: probability === "high" ? 90 : 70,
        reasons: probability === "high" ? ["same_owner", "same_address"] : [],
      },
    };
  });
}

function buildLockedDuplicateResponse(result, reason) {
  const highCount = Array.isArray(result.high) ? result.high.length : 0;
  const mediumCount = Array.isArray(result.medium) ? result.medium.length : 0;

  return {
    listing_type: result.listing_type,
    source_listing_found: result.source_listing_found,
    locked: true,
    access_limit: buildFeatureCreditRequiredPayload(LISTING_ANALYSIS_FEATURE_KEY, reason),
    counts: {
      high: highCount,
      medium: mediumCount,
      truncated: result.counts?.truncated === true,
    },
    high: buildLockedDuplicateListings(highCount, "high"),
    medium: buildLockedDuplicateListings(mediumCount, "medium", highCount),
  };
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
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    body = withUrlExternalId(body);
    const access = await requireListingAnalysisAccess(request, body);
    if (access.response) return access.response;

    const result = await findListingDuplicates(supabaseAdmin, body);
    if (result.error === "listing_not_found") {
      return NextResponse.json(result, { status: 404 });
    }
    if (result.error === "insufficient_data") {
      return NextResponse.json(result, { status: 422 });
    }
    if (!access.allowed) {
      return NextResponse.json(buildLockedDuplicateResponse(result, access.reason));
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[listing-duplicates] lookup failed:", {
      code: error?.code,
      message: error?.message || String(error),
      details: error?.details,
    });
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
