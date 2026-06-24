import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { resolveAccessTier } from "@/lib/access-tier";

const limiter = rateLimit({ interval: 60_000, limit: 120 });
const TRACKING_SALT = process.env.TRACKING_SALT || "catdai-default-salt";
const ALLOWED_SOURCES = new Set(["zdg", "reddit", "vtememd"]);
const ALLOWED_EVENTS = new Set([
  "source_landing_visit",
  "page_view",
  "landing_estimate_cta",
  "estimate_form_view",
  "estimate_submit",
  "estimate_result_view",
  "signed_in",
]);

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip + TRACKING_SALT).digest("hex").slice(0, 16);
}

function cleanText(value, maxLength = 200) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};

  return Object.fromEntries(
    Object.entries(metadata)
      .slice(0, 20)
      .map(([key, value]) => {
        const cleanKey = String(key).slice(0, 60);
        if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
          return [cleanKey, typeof value === "string" ? value.slice(0, 500) : value];
        }
        return [cleanKey, String(value).slice(0, 500)];
      })
  );
}

export async function POST(request) {
  const ip = getClientIp(request);
  const limit = limiter.check(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many tracking events." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const source = cleanText(body.source, 40);
  const eventName = cleanText(body.event_name, 80);

  if (!ALLOWED_SOURCES.has(source) || !ALLOWED_EVENTS.has(eventName)) {
    return NextResponse.json({ error: "Invalid tracking event." }, { status: 400 });
  }

  const row = {
    source,
    event_name: eventName,
    user_id: null,
    device_id: cleanText(body.device_id, 80),
    session_id: cleanText(body.session_id, 80),
    path: cleanText(body.path, 500),
    referrer: cleanText(body.referrer, 500),
    ip_hash: hashIp(ip),
    metadata: cleanMetadata(body.metadata),
  };

  const access = await resolveAccessTier(request);
  if (access.user_id) row.user_id = access.user_id;

  const { error } = await supabaseAdmin.from("ad_source_events").insert(row);
  if (error) {
    console.error("[ad-source-events] insert failed:", error.message);
    return NextResponse.json({ error: "Failed to track event." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
