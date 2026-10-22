import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadCadastruFavorites } from "@/lib/admin-cadastru-favorites";
import { loadCadastruShareStatistics } from "@/lib/cadastru-share-statistics";

const PAGE_SIZE = 50;
const SEARCH_COLUMNS = "id, search_type, user_id, visitor, district, cadastral_number, search_address, result_type, valuation_clicked_at, valuation_completed_at, created_at";

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const userId = request.nextUrl.searchParams.get("userId") || "";
  const rawOffset = request.nextUrl.searchParams.get("offset") ?? "0";
  const offset = Number(rawOffset);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
    || !/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset > Number.MAX_SAFE_INTEGER - PAGE_SIZE) {
    return NextResponse.json({ error: "Invalid user or offset." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("cadastru_search_events")
    .select(SEARCH_COLUMNS).is("duplicate_of", null)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + PAGE_SIZE);

  if (error) {
    console.error("[admin-cadastru-searches] read failed:", error.message);
    return NextResponse.json({ error: "Failed to load cadastru searches." }, { status: 500 });
  }

  try {
    const searches = await loadCadastruShareStatistics(await loadCadastruFavorites((data || []).slice(0, PAGE_SIZE)));
    return NextResponse.json({ searches, hasMore: (data || []).length > PAGE_SIZE });
  } catch (error) {
    console.error("[admin-cadastru-searches] statistics read failed:", error.message);
    return NextResponse.json({ error: "Failed to load cadastru search statistics." }, { status: 500 });
  }
}

export async function DELETE(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid cadastru search id." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("cadastru_search_events")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[admin-cadastru-searches] delete failed:", error.message);
    return NextResponse.json({ error: "Failed to delete cadastru search." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
