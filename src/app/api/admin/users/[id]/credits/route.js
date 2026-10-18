import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { UUID, sameOrigin } from "@/lib/maib/http";

export async function PATCH(request, context) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  if (!UUID.test(id || "") || !["add", "remove"].includes(body?.action)
    || !Number.isInteger(body?.amount) || body.amount < 1 || body.amount > 1000) {
    return NextResponse.json({ error: "Alege între 1 și 1000 de credite și o acțiune validă." }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin.rpc("adjust_user_credits", {
    p_user_id: id,
    p_delta: body.action === "add" ? body.amount : -body.amount,
  });
  if (error) {
    if (error.message?.includes("insufficient credits")) {
      return NextResponse.json({ error: "Soldul disponibil este insuficient. Reîncarcă utilizatorul." }, { status: 409 });
    }
    console.error("[admin-user-credits] adjustment failed:", error.message);
    return NextResponse.json({ error: "Nu s-au putut modifica creditele." }, { status: 500 });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, sharedCredits: {
    remainingUses: row.remaining_uses, totalGranted: row.total_granted, totalUsed: row.total_used,
  } });
}
