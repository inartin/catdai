import { redactCadastruMapData } from "@/lib/cadastru-map";
import { canReadCadastruMapData } from "@/lib/cadastru-map-access";
import { scheduleCadastruRefresh } from "@/lib/cadastru-refresh";
import { cadastruLocationOriginKey } from "@/lib/cadastru-location-storage";
import { withStatisticsContext } from "@/lib/statistics-context";
import { getCadastruLookupTracking } from "@/lib/cadastru-lookup-tracking";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { fetchExternalMunicipalReportsData } from "@/lib/cadastru-external-api";
import { municipalReportsInputFromCadastru, validMunicipalReportsResult } from "@/lib/cadastru-municipal-reports";
import { getCadastruRecordByAddress, getCadastruRecordByNumber } from "@/lib/cadastru-records";
import { CADASTRAL_RE } from "@/lib/validation";
import { getBuildingFallback } from "@/lib/cadastru-buildings";
import { isFreshCadastru } from "@/lib/cadastru-cache";
import { getStoredMunicipalReports, storeMunicipalReports, municipalReportsFromStorage } from "@/lib/cadastru-municipal-reports-storage";

const limiter = rateLimit({ interval: 60_000, limit: 15, namespace: "cadastru-municipal-reports" });

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

  const input = municipalReportsInputFromCadastru(entry?.payload || { request_address: address });
  if (!input) return NextResponse.json({ error: "location_unavailable" }, { status: 422 });

  const mapAccess = await canReadCadastruMapData(request, { payload: entry?.payload, number, address });
  const respond = (reports) => NextResponse.json({ municipal_reports: mapAccess ? reports : redactCadastruMapData(reports) }, {
    headers: { "Cache-Control": "private, no-store" },
  });

  const stored = await getStoredMunicipalReports(input);
  const refresh = async () => {
    try {
      const reports = await fetchExternalMunicipalReportsData(input, stored ? { trackUsage: false } : getCadastruLookupTracking(body));
      if (!validMunicipalReportsResult(reports)) throw new Error("Invalid municipal reports response");
      if (stored && (reports.incomplete || reports.cache?.stale)) {
        return respond(municipalReportsFromStorage(stored));
      }
      const saved = await storeMunicipalReports(input, reports);
      return respond(saved ? municipalReportsFromStorage(saved) : reports);
    } catch (error) {
      console.error("[cadastru/municipal-reports] lookup failed:", {
        code: error?.code || "unknown",
        status: error?.status || null,
        message: error?.message || String(error),
      });
      if (stored) return respond(municipalReportsFromStorage(stored));
      return NextResponse.json({ error: "municipal_reports_unavailable" }, { status: 503 });
    }
  };
  if (stored) {
    if (!isFreshCadastru(stored.expiresAt)) {
      scheduleCadastruRefresh(`municipal-reports:${cadastruLocationOriginKey(input)}`, refresh);
    }
    return respond(municipalReportsFromStorage(stored));
  }
  return refresh();
}

export const POST = withStatisticsContext(handlePost);
