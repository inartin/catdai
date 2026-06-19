import { NextResponse } from "next/server";
import { resolveAccessTier } from "@/lib/access-tier";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const limiter = rateLimit({ interval: 60_000, limit: 120, namespace: "payment-checkout-events" });
const ALLOWED_EVENTS = new Set(["checkout_popup_opened", "checkout_page_opened", "pricing_page_opened"]);

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function cleanText(value, maxLength = 200) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanUuid(value) {
  const text = cleanText(value, 80);
  if (!text) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function cleanPaddleTransactionId(value) {
  const text = cleanText(value, 80);
  if (!text) return null;
  return /^txn_[A-Za-z0-9]+$/.test(text) ? text : null;
}

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42P01" || code === "42703" || code === "PGRST204" || code === "PGRST205" || message.includes("schema cache");
}

export async function POST(request) {
  const ip = getClientIp(request);
  const limit = limiter.check(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many checkout events." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const eventType = cleanText(body.event_type, 80);
  if (!ALLOWED_EVENTS.has(eventType)) {
    return NextResponse.json({ error: "Invalid checkout event." }, { status: 400 });
  }

  const access = await resolveAccessTier(request);
  const row = {
    event_type: eventType,
    user_id: access.user_id || null,
    device_id: cleanText(body.device_id, 80),
    session_id: cleanText(body.session_id, 80),
    order_id: cleanUuid(body.order_id),
    paddle_transaction_id: cleanPaddleTransactionId(body.paddle_transaction_id),
    product_key: cleanText(body.product_key, 80),
    source_product_key: cleanText(body.source_product_key, 80),
    path: cleanText(body.path, 500),
    referrer: cleanText(body.referrer, 500),
  };

  let { error } = await supabaseAdmin.from("payment_checkout_events").insert(row);
  if (error?.code === "23503" && row.order_id) {
    row.order_id = null;
    ({ error } = await supabaseAdmin.from("payment_checkout_events").insert(row));
  }
  if (error) {
    if (isMissingSchemaError(error)) {
      return NextResponse.json({ ok: true, persisted: false });
    }
    console.error("[payment-checkout-events] insert failed:", error.message);
    return NextResponse.json({ error: "Failed to track checkout event." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
