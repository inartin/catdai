import { AD_TRACKING_SOURCES, fetchAdSourceStats } from "@/lib/admin-ad-tracking";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { getSharedCache, setSharedCache } from "@/lib/cache";
import { NextResponse } from "next/server";

const AD_TRACKING_CACHE_TTL_SECONDS = 10 * 60;
const AD_TRACKING_CACHE_PREFIX = "catdai:admin-ad-tracking:v1";

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const journeyLimit = request.nextUrl.searchParams.get("limit");
  const journeyOffset = request.nextUrl.searchParams.get("offset");
  const source = request.nextUrl.searchParams.get("source") || "zdg";
  const bypassCache = request.nextUrl.searchParams.get("fresh") === "1";
  if (!Object.prototype.hasOwnProperty.call(AD_TRACKING_SOURCES, source)) {
    return NextResponse.json({ error: "Invalid ad source." }, { status: 400 });
  }

  const cacheKey = `${AD_TRACKING_CACHE_PREFIX}:${source}:${journeyLimit || "default"}:${journeyOffset || "0"}`;
  if (!bypassCache) {
    const cached = await getSharedCache(cacheKey);
    if (cached?.value) {
      return NextResponse.json(cached.value);
    }
  }

  const ad = await fetchAdSourceStats({ source, journeyLimit, journeyOffset });
  const payload = {
    ad,
    ...(source === "zdg" ? { zdgAd: ad } : {}),
  };

  if (ad.available) {
    await setSharedCache(cacheKey, payload, AD_TRACKING_CACHE_TTL_SECONDS);
  }

  return NextResponse.json(payload);
}
