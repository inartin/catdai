import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { UUID, sameOrigin } from "@/lib/maib/http";

export async function PATCH(request, context) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!UUID.test(id || "") || typeof body?.isAdmin !== "boolean") {
    return NextResponse.json({ error: "Invalid user or admin status." }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
    if (error?.status === 404 || (!error && !data?.user)) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    if (error) throw error;

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      app_metadata: { ...data.user.app_metadata, catdai_is_admin: body.isAdmin },
    });
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, isAdmin: body.isAdmin });
  } catch (error) {
    console.error("[admin-user-status] update failed:", error.message);
    return NextResponse.json({ error: "Nu s-a putut salva statutul de admin." }, { status: 500 });
  }
}
