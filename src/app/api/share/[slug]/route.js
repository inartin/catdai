import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function GET(_request, { params }) {
  const { slug } = await params;

  const { data, error } = await supabaseAdmin
    .from("shared_links")
    .select("params, sharer_is_paid")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "shared_link_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    params: data.params || {},
    sharer_is_paid: data.sharer_is_paid === true,
  });
}
