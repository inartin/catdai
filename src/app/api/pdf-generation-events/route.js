import { NextResponse } from "next/server";
import { resolveAccessTier } from "@/lib/access-tier";
import { rateLimit } from "@/lib/rate-limit";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { supabaseAdmin } from "@/lib/supabase-admin";

const limiter = rateLimit({ interval: 60_000, limit: 30 });

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function cleanText(value, maxLength = 120) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function POST(request) {
  const limit = limiter.check(getClientIp(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many PDF events." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!shouldPersistRuntimeData()) {
    return NextResponse.json({ ok: true, persisted: false });
  }

  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = {
    user_id: access.user_id,
    device_id: cleanText(body.device_id, 80),
    session_id: cleanText(body.session_id, 80),
    estimate_log_id: cleanText(body.estimate_log_id, 80),
    included_cadastral: body.included_cadastral === true,
  };

  let { error } = await supabaseAdmin.from("pdf_generation_events").insert(row);
  if (error?.code === "23503" && row.estimate_log_id) {
    row.estimate_log_id = null;
    ({ error } = await supabaseAdmin.from("pdf_generation_events").insert(row));
  }

  if (error) {
    console.error("[pdf-generation-events] insert failed:", error.message);
    return NextResponse.json({ error: "Failed to track PDF generation." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
