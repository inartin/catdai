import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveAccessTier } from "@/lib/access-tier";
import { normalizePaidEvaluationSnapshot, PAID_EVALUATION_FEATURE_KEYS } from "@/lib/evaluation-snapshots";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request, { params }) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(String(id || ""))) {
    return NextResponse.json({ error: "Invalid snapshot id." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("user_feature_usage_events")
    .select("id, feature_key, metadata, created_at")
    .eq("id", id)
    .eq("user_id", access.user_id)
    .eq("source", "paid_credit")
    .in("feature_key", PAID_EVALUATION_FEATURE_KEYS)
    .maybeSingle();

  if (error) {
    console.error("[evaluation-snapshot] fetch failed:", error.message);
    return NextResponse.json({ error: "Snapshot unavailable." }, { status: 500 });
  }

  const snapshot = normalizePaidEvaluationSnapshot(data);
  if (!snapshot) {
    return NextResponse.json({ error: "Snapshot not found." }, { status: 404 });
  }

  return NextResponse.json({ snapshot });
}
