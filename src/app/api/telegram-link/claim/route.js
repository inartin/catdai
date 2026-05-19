import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { telegramLinkSecret } from "@/lib/telegram-link-secret";

function normalizeText(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function normalizeTelegramId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function getSecret(request) {
  return request.headers.get("x-catdai-telegram-secret") || "";
}

export async function POST(request) {
  if (getSecret(request) !== telegramLinkSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = normalizeText(body.token);
  const telegramUserId = normalizeTelegramId(body.telegram_user_id);
  const telegramChatId = normalizeTelegramId(body.telegram_chat_id);

  if (!token || !telegramUserId || !telegramChatId) {
    return NextResponse.json(
      { error: "Missing required fields: token, telegram_user_id, telegram_chat_id" },
      { status: 400 }
    );
  }

  const tokenHash = hashToken(token);

  const { data: tokenRow, error: tokenError } = await supabaseAdmin
    .from("user_telegram_link_tokens")
    .select("id, user_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenError) {
    console.error("[telegram-link] token lookup failed:", tokenError.message);
    return NextResponse.json({ error: "Failed to verify link token." }, { status: 500 });
  }

  if (!tokenRow) {
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 400 });
  }

  if (Date.parse(tokenRow.expires_at) <= Date.now()) {
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 400 });
  }

  const telegramUsername = normalizeText(body.telegram_username);
  const telegramFirstName = normalizeText(body.telegram_first_name);
  const telegramLastName = normalizeText(body.telegram_last_name);
  const telegramLanguageCode = normalizeText(body.telegram_language_code);

  const { data: existingConnection, error: existingError } = await supabaseAdmin
    .from("user_telegram_connections")
    .select("user_id")
    .or(`telegram_user_id.eq.${telegramUserId},telegram_chat_id.eq.${telegramChatId}`)
    .maybeSingle();

  if (existingError) {
    console.error("[telegram-link] connection lookup failed:", existingError.message);
    return NextResponse.json({ error: "Failed to verify Telegram account." }, { status: 500 });
  }

  if (existingConnection && existingConnection.user_id !== tokenRow.user_id) {
    return NextResponse.json(
      { error: "This Telegram account is already linked to another user." },
      { status: 409 }
    );
  }

  const { error: connectionError } = await supabaseAdmin
    .from("user_telegram_connections")
    .upsert(
      {
        user_id: tokenRow.user_id,
        telegram_user_id: telegramUserId,
        telegram_chat_id: telegramChatId,
        telegram_username: telegramUsername,
        telegram_first_name: telegramFirstName,
        telegram_last_name: telegramLastName,
        telegram_language_code: telegramLanguageCode,
        linked_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (connectionError) {
    console.error("[telegram-link] connection save failed:", connectionError.message);
    return NextResponse.json({ error: "Failed to link Telegram account." }, { status: 500 });
  }

  const { error: deleteError } = await supabaseAdmin
    .from("user_telegram_link_tokens")
    .delete()
    .eq("id", tokenRow.id);

  if (deleteError) {
    console.error("[telegram-link] token cleanup failed:", deleteError.message);
  }

  return NextResponse.json({ linked: true });
}
