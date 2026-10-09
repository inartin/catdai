import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { fetchExternalPublicTransportData } from "@/lib/cadastru-external-api";
import { publicTransportInputFromCadastru, validPublicTransportResult } from "@/lib/cadastru-public-transport";
import { getCadastruRecordByAddress, getCadastruRecordByNumber } from "@/lib/cadastru-records";
import { CADASTRAL_RE } from "@/lib/validation";

const limiter = rateLimit({ interval: 60_000, limit: 15, namespace: "cadastru-public-transport" });

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
    ? await getCadastruRecordByAddress(address)
    : await getCadastruRecordByNumber(number);
  if (!entry && address && CADASTRAL_RE.test(number)) entry = await getCadastruRecordByNumber(number);
  if (!entry) return NextResponse.json({ error: "result_not_found" }, { status: 404 });

  const input = publicTransportInputFromCadastru(entry.payload);
  if (!input) return NextResponse.json({ error: "location_unavailable" }, { status: 422 });

  try {
    const publicTransport = await fetchExternalPublicTransportData(input);
    if (!validPublicTransportResult(publicTransport)) throw new Error("Invalid public transport response");
    return NextResponse.json({ public_transport: publicTransport });
  } catch (error) {
    console.error("[cadastru/public-transport] lookup failed:", {
      code: error?.code || "unknown",
      status: error?.status || null,
      message: error?.message || String(error),
    });
    return NextResponse.json({ error: "public_transport_unavailable" }, { status: 503 });
  }
}
