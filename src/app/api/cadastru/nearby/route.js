import { redactCadastruMapData } from "@/lib/cadastru-map";
import { canReadCadastruMapData } from "@/lib/cadastru-map-access";
import { scheduleCadastruRefresh } from "@/lib/cadastru-refresh";
import { cadastruLocationOriginKey } from "@/lib/cadastru-location-storage";
import { withStatisticsContext } from "@/lib/statistics-context";
import { getCadastruLookupTracking } from "@/lib/cadastru-lookup-tracking";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { fetchExternalNearbyData } from "@/lib/cadastru-external-api";
import { nearbyInputFromCadastru, validNearbyResult } from "@/lib/cadastru-nearby";
import { getCadastruRecordByAddress, getCadastruRecordByNumber } from "@/lib/cadastru-records";
import { CADASTRU_TTL_SECONDS, isFreshCadastru } from "@/lib/cadastru-cache";
import { getStoredNearby, storeNearby, nearbyFromStorage } from "@/lib/cadastru-nearby-storage";
import { CADASTRAL_RE } from "@/lib/validation";
import { getBuildingFallback } from "@/lib/cadastru-buildings";

const limiter = rateLimit({ interval: 60_000, limit: 15, namespace: "cadastru-nearby" });

function clientIp(request) {
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}

async function handlePost(request) {
  const { allowed, retryAfter } = await limiter.check(clientIp(request));
  if (!allowed) return NextResponse.json({ error: "rate_limited" }, {
    status: 429, headers: { "Retry-After": String(retryAfter) },
  });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const number = typeof body?.cadastral_number === "string" ? body.cadastral_number.trim() : "";
  if (address ? address.length > 500 : !CADASTRAL_RE.test(number)) {
    return NextResponse.json({ error: "invalid_search" }, { status: 400 });
  }

  let entry = address
    ? await getCadastruRecordByAddress(address, { allowExpired: true })
    : await getCadastruRecordByNumber(number, { allowExpired: true });
  if (!entry && address && CADASTRAL_RE.test(number)) entry = await getCadastruRecordByNumber(number, { allowExpired: true });
  if (!entry) {
    const partial = await getBuildingFallback(address ? { address } : { number });
    if (partial) entry = { payload: partial };
  }
  if (!entry && !address) return NextResponse.json({ error: "result_not_found" }, { status: 404 });

  const input = nearbyInputFromCadastru(entry?.payload || { request_address: address });
  if (!input) return NextResponse.json({ error: "location_unavailable" }, { status: 422 });

  const [mapAccess, cached] = await Promise.all([
    canReadCadastruMapData(request, { payload: entry?.payload, number, address }),
    getStoredNearby(input),
  ]);
  const respond = (nearby) => NextResponse.json({ nearby: mapAccess ? nearby : {
    ...redactCadastruMapData(nearby),
    map_preview: { available: Number.isFinite(nearby?.location?.latitude) && Number.isFinite(nearby?.location?.longitude) },
  } }, {
    headers: { "Cache-Control": "private, no-store" },
  });

  let stored = cached;
  // Lazily move valid legacy snapshots to the shared building store without renewing them.
  if (!stored && validNearbyResult(entry?.payload.nearby) && Number.isFinite(Date.parse(entry.expiresAt))) {
    stored = await storeNearby(input, entry.payload.nearby, {
      fetchedAt: entry.fetchedAt || new Date(Date.parse(entry.expiresAt) - CADASTRU_TTL_SECONDS * 1000).toISOString(),
      expiresAt: entry.expiresAt,
    });
  }
  const refresh = async () => {
    try {
      const nearby = await fetchExternalNearbyData(input, stored ? { trackUsage: false } : getCadastruLookupTracking(body));
      if (!validNearbyResult(nearby)) throw new Error("Invalid nearby response");
      if ((nearby.incomplete || nearby.cache?.stale) && stored) return respond(nearbyFromStorage(stored));
      const saved = await storeNearby(input, nearby);
      return respond(saved ? nearbyFromStorage(saved) : nearby);
    } catch (error) {
      console.error("[cadastru/nearby] lookup failed:", {
        code: error?.code || "unknown",
        status: error?.status || null,
        message: error?.message || String(error),
      });
      if (stored) return respond(nearbyFromStorage(stored));
      return NextResponse.json({ error: "nearby_unavailable" }, { status: 503 });
    }
  };
  if (stored) {
    if (!isFreshCadastru(stored.expiresAt)) {
      scheduleCadastruRefresh(`nearby:${cadastruLocationOriginKey(input)}`, refresh);
    }
    return respond(nearbyFromStorage(stored));
  }
  return refresh();
}

export const POST = withStatisticsContext(handlePost);
