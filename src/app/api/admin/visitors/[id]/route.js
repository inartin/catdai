import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeVisitorId } from "@/lib/visitor";
import { fetchVisitorHistory } from "@/lib/admin-visitor-history";

export async function GET(request, { params }) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;
  const id = normalizeVisitorId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid browser ID." }, { status: 400 });
  try {
    const events = await fetchVisitorHistory({ deviceId: id });
    const userIds = [...new Set(events.map((event) => event.user_id).filter(Boolean))];
    const names = new Map(await Promise.all(userIds.map(async (id) => {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
      if (error) return [id, id];
      const user = data?.user;
      const meta = user?.user_metadata || {};
      return [id, meta.full_name || meta.name || meta.display_name || [meta.first_name, meta.last_name].filter(Boolean).join(" ") || user?.email || id];
    })));
    return NextResponse.json({ events: events.map((event) => ({ ...event, user_name: names.get(event.user_id) || null })) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[admin-visitors] history read failed:", error.message);
    return NextResponse.json({ error: "Failed to load browser history." }, { status: 500 });
  }
}
