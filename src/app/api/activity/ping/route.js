import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveAccessTier } from "@/lib/access-tier";
import { NextResponse } from "next/server";

const LAST_SEEN_THROTTLE_MS = 10 * 60 * 1000;

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42703" || code === "42P01";
}

export async function POST(request) {
  const access = await resolveAccessTier(request);
  const userId = access.user_id;

  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { data: current, error: currentError } = await supabaseAdmin
    .from("user_activity")
    .select("last_seen_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (currentError) {
    if (isMissingSchemaError(currentError)) {
      return NextResponse.json({ error: "user_activity table is missing." }, { status: 500 });
    }
    console.error("[activity] read failed:", currentError.message);
    return NextResponse.json({ error: "Failed to track activity." }, { status: 500 });
  }

  if (!current) {
    const { error: insertError } = await supabaseAdmin
      .from("user_activity")
      .insert({ user_id: userId, last_seen_at: nowIso });

    if (insertError && insertError.code !== "23505") {
      console.error("[activity] insert failed:", insertError.message);
      return NextResponse.json({ error: "Failed to track activity." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: true });
  }

  const lastSeenTs = Date.parse(current.last_seen_at || "");
  if (Number.isNaN(lastSeenTs) || now - lastSeenTs >= LAST_SEEN_THROTTLE_MS) {
    const { error: updateError } = await supabaseAdmin
      .from("user_activity")
      .update({ last_seen_at: nowIso })
      .eq("user_id", userId);

    if (updateError) {
      console.error("[activity] update failed:", updateError.message);
      return NextResponse.json({ error: "Failed to track activity." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated: true });
  }

  return NextResponse.json({ ok: true, updated: false });
}
