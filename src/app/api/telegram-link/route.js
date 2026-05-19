import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { buildTelegramAlertsStartUrl } from "../../../../db/constants";
import { resolveAccessTier } from "@/lib/access-tier";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TOKEN_TTL_MS = 15 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export async function GET(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ connection: null });
  }

  const { data, error } = await supabaseAdmin
    .from("user_telegram_connections")
    .select("telegram_user_id, telegram_chat_id, telegram_username, telegram_first_name, telegram_last_name, telegram_language_code, linked_at")
    .eq("user_id", access.user_id)
    .maybeSingle();

  if (error) {
    console.error("[telegram-link] status failed:", error.message);
    return NextResponse.json({ connection: null });
  }

  return NextResponse.json({
    connection: data
      ? {
          connected: true,
          ...data,
        }
      : null,
  });
}

export async function POST(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { error: deleteError } = await supabaseAdmin
    .from("user_telegram_link_tokens")
    .delete()
    .eq("user_id", access.user_id);

  if (deleteError) {
    console.error("[telegram-link] token cleanup failed:", deleteError.message);
  }

  const { error } = await supabaseAdmin
    .from("user_telegram_link_tokens")
    .insert({
      user_id: access.user_id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

  if (error) {
    console.error("[telegram-link] token create failed:", error.message);
    return NextResponse.json({ error: "Failed to create Telegram link." }, { status: 500 });
  }

  return NextResponse.json({
    url: buildTelegramAlertsStartUrl(token),
    expires_at: expiresAt,
  });
}
