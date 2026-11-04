import { AD_TRACKING_SOURCES, fetchAdSourceStats, fetchAdJourneyActivity } from "@/lib/admin-ad-tracking";
import { normalizeVisitorId } from "@/lib/visitor";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { getSharedCache, setSharedCache } from "@/lib/cache";
import { NextResponse } from "next/server";

const AD_TRACKING_CACHE_TTL_SECONDS = 10 * 60;
const AD_TRACKING_CACHE_PREFIX = "catdai:admin-ad-tracking:v4";
const PERIODS = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  all: null,
};

function parsePeriod(value) {
  return Object.prototype.hasOwnProperty.call(PERIODS, value) ? value : "all";
}

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const journeyLimit = request.nextUrl.searchParams.get("limit");
  const journeyOffset = request.nextUrl.searchParams.get("offset");
  const source = request.nextUrl.searchParams.get("source") || "zdg";
  const period = parsePeriod(request.nextUrl.searchParams.get("period"));
  const since = PERIODS[period] ? new Date(Date.now() - PERIODS[period]).toISOString() : null;
  const bypassCache = request.nextUrl.searchParams.get("fresh") === "1";
  if (!Object.prototype.hasOwnProperty.call(AD_TRACKING_SOURCES, source)) {
    return NextResponse.json({ error: "Invalid ad source." }, { status: 400 });
  }

  if (request.nextUrl.searchParams.has("sessionId") || request.nextUrl.searchParams.has("deviceId")) {
    const sessionId = normalizeVisitorId(request.nextUrl.searchParams.get("sessionId"));
    const deviceId = normalizeVisitorId(request.nextUrl.searchParams.get("deviceId"));
    if (!sessionId && !deviceId) return NextResponse.json({ error: "Invalid visit ID." }, { status: 400 });
    try {
      const events = await fetchAdJourneyActivity({ source, sessionId, deviceId, since });
      return NextResponse.json({ events }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      console.error("[admin-ad-tracking] activity read failed:", error.message);
      return NextResponse.json({ error: "Failed to load visitor activity." }, { status: 500 });
    }
  }

  const cacheKey = `${AD_TRACKING_CACHE_PREFIX}:${source}:${period}:${journeyLimit || "default"}:${journeyOffset || "0"}`;
  if (!bypassCache) {
    const cached = await getSharedCache(cacheKey);
    if (cached?.value) {
      return NextResponse.json(cached.value);
    }
  }

  const ad = await fetchAdSourceStats({ source, journeyLimit, journeyOffset, since });
  const payload = {
    ad,
    ...(source === "zdg" ? { zdgAd: ad } : {}),
  };

  if (ad.available) {
    await setSharedCache(cacheKey, payload, AD_TRACKING_CACHE_TTL_SECONDS);
  }

  return NextResponse.json(payload);
}
