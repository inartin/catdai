import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

const PAGE_SIZE = 25;

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "0", 10);

  let query = supabaseAdmin
    .from("owner")
    .select("*, listing(count)", { count: "exact" });

  if (search) {
    query = query.or(
      `display_name.ilike.%${search}%,login.ilike.%${search}%`
    );
  }

  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("Failed to load admin owners:", error);
    return NextResponse.json({ error: "Failed to load owners" }, { status: 500 });
  }

  return NextResponse.json({ data: data || [], total: count || 0 });
}
