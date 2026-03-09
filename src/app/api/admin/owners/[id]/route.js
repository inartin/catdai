import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  const { id } = await params;

  const [ownerRes, listingsRes] = await Promise.all([
    supabaseAdmin.from("owner").select("*").eq("id", id).single(),
    supabaseAdmin
      .from("listing")
      .select(
        "id, title, price_amount, price_currency, area_m2, rooms_count, floor, total_floors, district, sector, is_active, created_at, source_url"
      )
      .eq("owner_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (ownerRes.error) {
    return NextResponse.json({ error: "Owner not found" }, { status: 404 });
  }

  return NextResponse.json({
    owner: ownerRes.data,
    listings: listingsRes.data || [],
  });
}
