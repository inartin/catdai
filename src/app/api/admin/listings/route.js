import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

const PAGE_SIZE = 25;

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const active = searchParams.get("active") || "all";
  const rooms = searchParams.get("rooms") || "";
  const sortBy = searchParams.get("sortBy") || "created_at";
  const sortAsc = searchParams.get("sortAsc") === "true";
  const page = parseInt(searchParams.get("page") || "0", 10);

  let query = supabaseAdmin
    .from("listing")
    .select(
      "id, title, price_amount, price_currency, price_per_m2, area_m2, rooms_count, floor, total_floors, district, sector, city, renovation, is_active, created_at, source_url, owner_id",
      { count: "exact" }
    );

  if (search) query = query.ilike("title", `%${search}%`);
  if (active === "active") query = query.eq("is_active", true);
  if (active === "inactive") query = query.eq("is_active", false);
  if (rooms) query = query.eq("rooms_count", Number(rooms));

  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count, error } = await query
    .order(sortBy, { ascending: sortAsc })
    .range(from, to);

  if (error) {
    console.error("Failed to load admin listings:", error);
    return NextResponse.json({ error: "Failed to load listings" }, { status: 500 });
  }

  return NextResponse.json({ data: data || [], total: count || 0 });
}
