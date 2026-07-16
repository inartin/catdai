import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const limiter = rateLimit({
  interval: 60_000,
  limit: 120,
  namespace: "market-trends-popup-events",
});

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function isMissingStorageError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42P01"
    || code === "42883"
    || code === "PGRST202"
    || code === "PGRST205"
    || message.includes("schema cache");
}

export async function POST(request) {
  const limit = limiter.check(getClientIp(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many popup events." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const { error } = await supabaseAdmin.rpc("increment_market_trends_popup_daily");

  if (error) {
    if (isMissingStorageError(error)) {
      return NextResponse.json({ ok: true, persisted: false });
    }
    console.error("[market-trends-popup-events] insert failed:", error.message);
    return NextResponse.json({ error: "Failed to track popup event." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
