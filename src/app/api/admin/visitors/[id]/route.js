import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeVisitorId } from "@/lib/visitor";

const SOURCES = [
  ["estimate_log", "Estimation", true, "estimate_type, city, district"],
  ["cadastru_search_events", "Cadastru search", false, "search_address, cadastral_number, result_type"],
  ["external_api_usage_events", "API call", false, "service, status"],
  ["calculator_usage_events", "Calculator", true, "city, district"],
  ["pdf_generation_events", "PDF report", true, "included_cadastral"],
  ["listing_link_analysis_events", "999 link analysis", false, "listing_url, status"],
  ["payment_checkout_events", "Checkout", true, "event_type"],
  ["ad_source_events", "Ad visit", true, "source, event_name"],
  ["user_feedback", "Feedback", false, "status"],
  ["user_listing_alerts", "Listing alert", false, "label"],
];

export async function GET(request, { params }) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;
  const id = normalizeVisitorId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid browser ID." }, { status: 400 });
  try {
    const events = (await Promise.all(SOURCES.map(async ([source, label, legacyId, columns]) => {
      let query = supabaseAdmin.from(source).select(`id, user_id, visitor, created_at, ${columns}`);
      query = legacyId ? query.or(`visitor->>device_id.eq.${id},device_id.eq.${id}`) : query.eq("visitor->>device_id", id);
      if (source === "cadastru_search_events") query = query.is("duplicate_of", null);
      const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
      if (error) throw new Error(`${source}: ${error.message}`);
      return (data || []).map((row) => ({
        id: row.id, source, label, user_id: row.user_id, visitor: row.visitor,
        created_at: row.created_at,
        summary: [row.label, row.estimate_type, row.city, row.district, row.search_address || row.cadastral_number,
          row.result_type, row.service, row.status, row.listing_url, row.event_type, row.source, row.event_name,
          source === "pdf_generation_events" && row.included_cadastral ? "Includes cadastral" : null].filter(Boolean).join(" · "),
      }));
    }))).flat().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 100);
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
