import { NextResponse } from "next/server";
import { findListingDuplicates } from "@/lib/listing-duplicates";
import { extractListingIdFromUrl } from "@/lib/parse-999-listing";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const limiter = rateLimit({ interval: 60_000, limit: 30 });

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
    const result = await findListingDuplicates(supabaseAdmin, withUrlExternalId(body));
    if (result.error === "listing_not_found") {
      return NextResponse.json(result, { status: 404 });
    }
    if (result.error === "insufficient_data") {
      return NextResponse.json(result, { status: 422 });
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
