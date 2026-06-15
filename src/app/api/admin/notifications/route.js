import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 1000;
const limiter = rateLimit({ interval: 60_000, limit: 20 });

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}

export async function POST(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const limit = limiter.check(getClientIp(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many notification requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const userId = cleanText(body?.userId, 80);
  const title = cleanText(body?.title, MAX_TITLE_LENGTH);
  const message = cleanText(body?.message ?? body?.body, MAX_BODY_LENGTH);

  if (!userId || !title || !message) {
    return NextResponse.json({ error: "Missing userId, title, or message." }, { status: 400 });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userData?.user?.id) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("user_notifications")
    .insert({
      user_id: userId,
      title,
      body: message,
      source: "admin",
    })
    .select("id, user_id, title, body, source, created_at")
    .single();

  if (error) {
    console.error("[admin-notifications] create failed:", error.message);
    return NextResponse.json({ error: "Failed to create notification." }, { status: 500 });
  }

  return NextResponse.json({ notification: data }, { status: 201 });
}
