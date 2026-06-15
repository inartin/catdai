import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PAGE_SIZE = 100;

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  let { data, error } = await supabaseAdmin
    .from("user_feedback")
    .select("id, user_id, message, contact_email, contact_phone, image_name, image_type, image_size, image_data, status, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (error?.message?.includes("Could not find") && error.message.includes("contact_email")) {
    ({ data, error } = await supabaseAdmin
      .from("user_feedback")
      .select("id, user_id, message, image_name, image_type, image_size, image_data, status, created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE));
  }

  if (error) {
    console.error("[admin-feedback] list failed:", error.message);
    return NextResponse.json({ error: "Failed to load feedback." }, { status: 500 });
  }

  return NextResponse.json({ feedback: data || [] });
}

export async function DELETE(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid feedback id." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("user_feedback")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[admin-feedback] delete failed:", error.message);
    return NextResponse.json({ error: "Failed to delete feedback." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
