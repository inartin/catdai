import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function GET(request, { params }) {
  const { id } = await params;

  const [listingRes, historyRes] = await Promise.all([
    supabaseAdmin
      .from("listing")
      .select("*, owner:owner_id(id, display_name, login)")
      .eq("id", id)
      .single(),
    supabaseAdmin
      .from("listing_price_history")
      .select("*")
      .eq("listing_id", id)
      .order("observed_at", { ascending: true }),
  ]);

  if (listingRes.error) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  return NextResponse.json({
    listing: listingRes.data,
    priceHistory: historyRes.data || [],
  });
}
