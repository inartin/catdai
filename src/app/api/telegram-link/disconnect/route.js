import { NextResponse } from "next/server";
import { resolveAccessTier } from "@/lib/access-tier";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { error: alertsError } = await supabaseAdmin
    .from("user_listing_alerts")
    .update({
      telegram_enabled: false,
      telegram_chat_id: null,
    })
    .eq("user_id", access.user_id)
    .eq("telegram_enabled", true);

  if (alertsError) {
    console.error("[telegram-link] alert cleanup failed:", alertsError.message);
    return NextResponse.json({ error: "Failed to disconnect Telegram." }, { status: 500 });
  }

  const { error: connectionError } = await supabaseAdmin
    .from("user_telegram_connections")
    .delete()
    .eq("user_id", access.user_id);

  if (connectionError) {
    console.error("[telegram-link] connection delete failed:", connectionError.message);
    return NextResponse.json({ error: "Failed to disconnect Telegram." }, { status: 500 });
  }

  return NextResponse.json({ disconnected: true });
}
