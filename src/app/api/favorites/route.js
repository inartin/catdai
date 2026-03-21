import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveAccessTier } from "@/lib/access-tier";
import { rateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

const limiter = rateLimit({ interval: 60_000, limit: 30 });

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

/**
 * GET /api/favorites
 * List all favorites for the authenticated user.
 * Optional ?url_path=... to check if a specific URL is favorited.
 */
export async function GET(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ favorites: [] });
  }

  const { searchParams } = new URL(request.url);
  const urlPath = searchParams.get("url_path");

  if (urlPath) {
    const { data } = await supabaseAdmin
      .from("user_favorites")
      .select("id")
      .eq("user_id", access.user_id)
      .eq("url_path", urlPath)
      .maybeSingle();

    return NextResponse.json({ favorited: !!data });
  }

  const { data, error } = await supabaseAdmin
    .from("user_favorites")
    .select("id, url_path, label, created_at")
    .eq("user_id", access.user_id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[favorites] list failed:", error.message);
    return NextResponse.json({ favorites: [] });
  }

  return NextResponse.json({ favorites: data || [] });
}

/**
 * POST /api/favorites
 * Toggle a favorite. Body: { url_path, label }
 * If already favorited → remove. If not → add.
 * Returns { favorited: boolean }
 */
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

  const { url_path, label } = body;
  if (!url_path) {
    return NextResponse.json(
      { error: "Missing required field: url_path" },
      { status: 400 }
    );
  }

  // Check if already favorited
  const { data: existing } = await supabaseAdmin
    .from("user_favorites")
    .select("id")
    .eq("user_id", access.user_id)
    .eq("url_path", url_path)
    .maybeSingle();

  if (existing) {
    // Remove favorite
    await supabaseAdmin
      .from("user_favorites")
      .delete()
      .eq("id", existing.id);

    return NextResponse.json({ favorited: false });
  }

  // Add favorite
  const { error: insertError } = await supabaseAdmin
    .from("user_favorites")
    .insert({
      user_id: access.user_id,
      url_path,
      label: label || null,
    });

  if (insertError) {
    // Handle unique constraint violation (race condition)
    if (insertError.code === "23505") {
      return NextResponse.json({ favorited: true });
    }
    console.error("[favorites] insert failed:", insertError.message);
    return NextResponse.json(
      { error: "Failed to save favorite." },
      { status: 500 }
    );
  }

  return NextResponse.json({ favorited: true });
}
