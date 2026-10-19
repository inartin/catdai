import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(_request, { params }) {
  const { slug } = await params;
  const headers = { "Cache-Control": "no-store" };
  if (!/^[a-f0-9]{48}$/.test(slug)) {
    return NextResponse.json({ error: "shared_report_not_found" }, { status: 404, headers });
  }
  const { data, error } = await supabaseAdmin.from("cadastru_shared_reports")
    .select("payload").eq("slug", slug).maybeSingle();
  if (error) {
    console.error("[cadastru/share] read failed:", error.message);
    return NextResponse.json({ error: "sharing_unavailable" }, { status: 503, headers });
  }
  if (!data) return NextResponse.json({ error: "shared_report_not_found" }, { status: 404, headers });
  return NextResponse.json({ cadastral: data.payload }, { headers });
}
