import { NextResponse } from "next/server";
import { mapmdResourceUrl, proxyMapmdResources } from "@/lib/mapmd";
import { rateLimit } from "@/lib/rate-limit";

const limiter = rateLimit({ interval: 60_000, limit: 600, namespace: "cadastru-map" });

export async function GET(request, { params }) {
  const url = mapmdResourceUrl((await params).path);
  const error = (code, status) => NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "no-store" } });
  if (!url) return error("invalid_map_resource", 400);
  if (!process.env.MAPMD_API) return error("map_unavailable", 503);
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = limiter.check(ip);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429,
    headers: { "Cache-Control": "no-store", "Retry-After": String(limit.retryAfter) } });
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Basic ${Buffer.from(`${process.env.MAPMD_API}:`).toString("base64")}` },
      redirect: "error", signal: AbortSignal.timeout(10_000),
      next: { revalidate: 3600 },
    });
    if (!response.ok) return error("map_unavailable", response.status === 404 ? 404 : 503);
    const headers = { "Cache-Control": "public, max-age=3600, s-maxage=3600" };
    if (url.endsWith(".json")) {
      const body = proxyMapmdResources(await response.json());
      // The provider's satellite style uses Google imagery; retain its credit.
      if (body.sources?.["simple-tiles"]) body.sources["simple-tiles"].attribution = "© Google";
      return NextResponse.json(body, { headers });
    }
    return new Response(await response.arrayBuffer(), { headers: { ...headers,
      "Content-Type": url.endsWith(".png") ? "image/png" : "application/x-protobuf" } });
  } catch {
    // Never log upstream URLs/headers or return provider authentication errors.
    return error("map_unavailable", 503);
  }
}
