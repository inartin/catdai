import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { validateCadastralNumber } from "@/lib/validation";
import { getCadastruRecordByAddress, getCadastruRecordByNumber } from "@/lib/cadastru-records";
import { getBuildingFallback } from "@/lib/cadastru-buildings";
import { nearbyInputFromCadastru } from "@/lib/cadastru-nearby";
import { getStoredNearby } from "@/lib/cadastru-nearby-storage";
import { cadastruMapLocation } from "@/lib/cadastru-map";
import { renderCadastruMapPreview } from "@/lib/cadastru-map-preview";

export const runtime = "nodejs";
const limiter = rateLimit({ interval: 60_000, limit: 15, namespace: "cadastru-map-preview" });
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request) {
  const ip = request.headers.get("cf-connecting-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = limiter.check(ip);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429,
    headers: { ...headers, "Retry-After": String(limit.retryAfter) } });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400, headers }); }
  const address = typeof body?.address === "string" ? body.address.trim() : "";
  const number = validateCadastralNumber(typeof body?.cadastral_number === "string" ? body.cadastral_number : "");
  if (address.length > 500 || (!address && !number.valid)) return NextResponse.json({ error: "invalid_search" }, { status: 400, headers });
  try {
    let entry = address ? await getCadastruRecordByAddress(address, { allowExpired: true })
      : await getCadastruRecordByNumber(number.value, { allowExpired: true });
    if (!entry && number.valid) entry = await getCadastruRecordByNumber(number.value, { allowExpired: true });
    let payload = entry?.payload || await getBuildingFallback(address ? { address } : { number: number.value });
    if (!cadastruMapLocation(payload)) {
      const input = nearbyInputFromCadastru(payload || { request_address: address });
      const nearby = input ? await getStoredNearby(input) : null;
      const location = nearby?.payload?.location;
      if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) payload = { ...payload, map_location: location };
    }
    const image = await renderCadastruMapPreview(payload);
    if (!image) return NextResponse.json({ error: "location_unavailable" }, { status: 404, headers });
    // No query parameters, upstream URLs, geographic metadata, or unblurred variant.
    return new Response(image, { headers: { ...headers, "Content-Type": "image/webp" } });
  } catch {
    return NextResponse.json({ error: "map_preview_unavailable" }, { status: 503, headers });
  }
}
