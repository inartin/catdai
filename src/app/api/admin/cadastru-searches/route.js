import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function DELETE(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid cadastru search id." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("cadastru_search_events")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[admin-cadastru-searches] delete failed:", error.message);
    return NextResponse.json({ error: "Failed to delete cadastru search." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
