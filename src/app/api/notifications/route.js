import { NextResponse } from "next/server";
import { resolveAccessTier } from "@/lib/access-tier";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_LIMIT = 50;

function parseLimit(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return 20;
  return Math.min(number, MAX_LIMIT);
}

function normalizeAction(value) {
  const action = String(value || "").trim();
  return action === "read" || action === "archive" ? action : null;
}

function normalizeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || "").trim()).filter(Boolean))].slice(0, MAX_LIMIT);
}

export async function GET(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseLimit(searchParams.get("limit"));

  const { data, error } = await supabaseAdmin
    .from("user_notifications")
    .select("id, title, body, source, read_at, created_at")
    .eq("user_id", access.user_id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[notifications] list failed:", error.message);
    return NextResponse.json({ error: "Failed to load notifications." }, { status: 500 });
  }

  return NextResponse.json({
    notifications: data || [],
    unreadCount: (data || []).filter((notification) => !notification.read_at).length,
  });
}

export async function PATCH(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = normalizeAction(body?.action);
  if (!action) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const ids = normalizeIds(body?.ids);
  const updates =
    action === "read"
      ? { read_at: new Date().toISOString() }
      : { archived_at: new Date().toISOString(), read_at: new Date().toISOString() };

  let query = supabaseAdmin
    .from("user_notifications")
    .update(updates)
    .eq("user_id", access.user_id)
    .is("archived_at", null);

  if (ids.length > 0) {
    query = query.in("id", ids);
  }

  const { error } = await query;

  if (error) {
    console.error("[notifications] update failed:", error.message);
    return NextResponse.json({ error: "Failed to update notifications." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
