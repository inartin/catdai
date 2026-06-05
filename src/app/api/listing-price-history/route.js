import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const limiter = rateLimit({ interval: 60_000, limit: 60 });

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function normalizeExternalId(value) {
  const externalId = String(value || "").trim();
  return /^\d{5,}$/.test(externalId) ? externalId : null;
}

function normalizeHistory(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: row.id,
      price_amount: row.price_amount,
      price_currency: row.price_currency,
      observed_at: row.observed_at,
      source_updated_at: row.source_updated_at,
    }))
    .filter((row) => row.id && row.price_amount != null && row.observed_at);
}

export async function GET(request) {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = limiter.check(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const externalId = normalizeExternalId(new URL(request.url).searchParams.get("external_id"));
  if (!externalId) {
    return NextResponse.json({ error: "invalid_external_id" }, { status: 400 });
  }

  const { data: listings, error: listingError } = await supabaseAdmin
    .from("listing")
    .select("id, external_id")
    .eq("external_id", externalId)
    .order("last_seen_at", { ascending: false })
    .limit(1);

  if (listingError) {
    return NextResponse.json({ error: "listing_lookup_failed" }, { status: 500 });
  }

  const listing = listings?.[0] || null;
  if (!listing?.id) {
    return NextResponse.json({ listing_found: false, price_history: [] });
  }

  const { data: history, error: historyError } = await supabaseAdmin
    .from("listing_price_history")
    .select("id, price_amount, price_currency, observed_at, source_updated_at")
    .eq("listing_id", listing.id)
    .order("observed_at", { ascending: true });

  if (historyError) {
    return NextResponse.json({ error: "history_lookup_failed" }, { status: 500 });
  }

  return NextResponse.json({
    listing_found: true,
    price_history: normalizeHistory(history),
  });
}
