import { scheduleCadastruRefresh } from "@/lib/cadastru-refresh";
import { cadastruLocationOriginKey } from "@/lib/cadastru-location-storage";
import { withStatisticsContext } from "@/lib/statistics-context";
import { getCadastruLookupTracking } from "@/lib/cadastru-lookup-tracking";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { fetchExternalPublicTransportData } from "@/lib/cadastru-external-api";
import { publicTransportInputFromCadastru, validPublicTransportResult } from "@/lib/cadastru-public-transport";
import { nearbyAddressFromCadastru } from "@/lib/cadastru-nearby";
import { getCadastruRecordByAddress, getCadastruRecordByNumber } from "@/lib/cadastru-records";
import { CADASTRAL_RE } from "@/lib/validation";
import { getBuildingFallback } from "@/lib/cadastru-buildings";
import { isFreshCadastru } from "@/lib/cadastru-cache";
import { getStoredPublicTransport, storePublicTransport, publicTransportFromStorage } from "@/lib/cadastru-public-transport-storage";

const limiter = rateLimit({ interval: 60_000, limit: 15, namespace: "cadastru-public-transport" });

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

  const input = entry ? publicTransportInputFromCadastru(entry.payload)
    : nearbyAddressFromCadastru({ request_address: address });
  if (!input) return NextResponse.json({ error: "location_unavailable" }, { status: 422 });

  const stored = await getStoredPublicTransport(input);
  const refresh = async () => {
    try {
      const publicTransport = await fetchExternalPublicTransportData(input, stored ? { trackUsage: false } : getCadastruLookupTracking(body));
      if (!validPublicTransportResult(publicTransport)) throw new Error("Invalid public transport response");
      // A partial source outage must not replace the last complete saved response.
      if ((publicTransport.incomplete || publicTransport.cache?.stale) && stored) {
        return NextResponse.json({ public_transport: publicTransportFromStorage(stored) });
      }
      const saved = await storePublicTransport(input, publicTransport);
      return NextResponse.json({ public_transport: saved ? publicTransportFromStorage(saved) : publicTransport });
    } catch (error) {
      console.error("[cadastru/public-transport] lookup failed:", {
        code: error?.code || "unknown",
        status: error?.status || null,
        message: error?.message || String(error),
      });
      if (stored) return NextResponse.json({ public_transport: publicTransportFromStorage(stored) });
      return NextResponse.json({ error: "public_transport_unavailable" }, { status: 503 });
    }
  };
  if (stored) {
    if (!isFreshCadastru(stored.expiresAt)) {
      scheduleCadastruRefresh(`public-transport:${cadastruLocationOriginKey(input)}`, refresh);
    }
    return NextResponse.json({ public_transport: publicTransportFromStorage(stored) });
  }
  return refresh();
}

export const POST = withStatisticsContext(handlePost);
