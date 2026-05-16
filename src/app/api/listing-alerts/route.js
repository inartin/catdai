import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveAccessTier } from "@/lib/access-tier";
import { rateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const limiter = rateLimit({ interval: 60_000, limit: 20 });

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function GET(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ alerts: [] });
  }

  const { data, error } = await supabaseAdmin
    .from("user_listing_alerts")
    .select("id, label, is_active, website_enabled, telegram_enabled, base_filters, alert_filters, created_at, last_notified_at")
    .eq("user_id", access.user_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[listing-alerts] list failed:", error.message);
    return NextResponse.json({ alerts: [] });
  }

  return NextResponse.json({ alerts: data || [] });
}

export async function POST(request) {
  const ip = getClientIp(request);
  const { allowed } = limiter.check(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429 }
    );
  }

  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const baseFilters = body?.base_filters;
  const alertFilters = body?.alert_filters;

  if (!isObject(baseFilters)) {
    return NextResponse.json(
      { error: "Missing or invalid field: base_filters" },
      { status: 400 }
    );
  }

  if (!isObject(alertFilters)) {
    return NextResponse.json(
      { error: "Missing or invalid field: alert_filters" },
      { status: 400 }
    );
  }

  const telegramEnabled = body.telegram_enabled === true;
  const telegramChatId = normalizeText(body.telegram_chat_id);

  if (telegramEnabled && !telegramChatId) {
    return NextResponse.json(
      { error: "Missing required field: telegram_chat_id" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("user_listing_alerts")
    .insert({
      user_id: access.user_id,
      label: normalizeText(body.label),
      website_enabled: body.website_enabled !== false,
      telegram_enabled: telegramEnabled,
      telegram_chat_id: telegramEnabled ? telegramChatId : null,
      base_filters: baseFilters,
      alert_filters: alertFilters,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[listing-alerts] insert failed:", error.message);
    return NextResponse.json(
      { error: "Failed to save listing alert." },
      { status: 500 }
    );
  }

  return NextResponse.json({ alert: data }, { status: 201 });
}

export async function DELETE(request) {
  const ip = getClientIp(request);
  const { allowed } = limiter.check(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429 }
    );
  }

  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  let alertId = normalizeText(searchParams.get("id"));

  if (!alertId) {
    try {
      const body = await request.json();
      alertId = normalizeText(body?.id);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  if (!alertId) {
    return NextResponse.json(
      { error: "Missing required field: id" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("user_listing_alerts")
    .delete()
    .eq("id", alertId)
    .eq("user_id", access.user_id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[listing-alerts] delete failed:", error.message);
    return NextResponse.json(
      { error: "Failed to delete listing alert." },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: !!data });
}
