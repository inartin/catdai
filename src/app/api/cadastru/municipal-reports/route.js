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

export async function POST(request) {
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

  const stored = await getStoredMunicipalReports(input);
  if (stored && isFreshCadastru(stored.expiresAt)) {
    return NextResponse.json({ municipal_reports: municipalReportsFromStorage(stored) });
  }

  try {
    const reports = await fetchExternalMunicipalReportsData(input, getCadastruLookupTracking(body));
    if (!validMunicipalReportsResult(reports)) throw new Error("Invalid municipal reports response");
    if (stored && (reports.incomplete || reports.cache?.stale)) {
      return NextResponse.json({ municipal_reports: municipalReportsFromStorage(stored) });
    }
    const saved = await storeMunicipalReports(input, reports);
    return NextResponse.json({ municipal_reports: saved ? municipalReportsFromStorage(saved) : reports });
  } catch (error) {
    console.error("[cadastru/municipal-reports] lookup failed:", {
      code: error?.code || "unknown",
      status: error?.status || null,
      message: error?.message || String(error),
    });
    if (stored) return NextResponse.json({ municipal_reports: municipalReportsFromStorage(stored) });
    return NextResponse.json({ error: "municipal_reports_unavailable" }, { status: 503 });
  }
}
