import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PAGE_SIZE = 100;

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const { data, error } = await supabaseAdmin
    .from("user_feedback")
    .select("id, user_id, message, image_name, image_type, image_size, image_data, status, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (error) {
    console.error("[admin-feedback] list failed:", error.message);
    return NextResponse.json({ error: "Failed to load feedback." }, { status: 500 });
  }

  return NextResponse.json({ feedback: data || [] });
}
