import { supabaseAdmin } from "@/lib/supabase-admin";

const SOURCES = [
  ["estimate_log", "Estimation", true, "estimate_type, city, district"],
  ["cadastru_search_events", "Cadastru search", false, "search_address, cadastral_number, result_type"],
  ["external_api_usage_events", "API call", false, "service, status"],
  ["calculator_usage_events", "Calculator", true, "city, district"],
  ["pdf_generation_events", "PDF report", true, "included_cadastral"],
  ["listing_link_analysis_events", "999 link analysis", false, "listing_url, status"],
  ["payment_checkout_events", "Checkout", true, "event_type, product_key"],
  ["ad_source_events", "Ad visit", true, "source, event_name"],
  ["user_feedback", "Feedback", false, "status"],
  ["user_listing_alerts", "Listing alert", false, "label"],
  ["user_favorites", "Saved favorite", false, "label, url_path", true],
  ["shared_links", "Shared report", false, "slug", true, "sharer_user_id"],
];

// Callers supply server-validated browser/account IDs. Reads only existing telemetry.
export async function fetchVisitorHistory({ deviceId, userIds = [], since, includeAdEvents = true }) {
  if (!deviceId && !userIds.length) return [];
  const events = (await Promise.all(SOURCES.filter(([source, , , , accountOnly]) =>
    (includeAdEvents || source !== "ad_source_events") && (!accountOnly || userIds.length)
  ).map(async ([source, label, legacyId, columns, accountOnly, userColumn = "user_id"]) => {
      const identityColumns = accountOnly ? `user_id:${userColumn}` : "user_id, visitor";
      let query = supabaseAdmin.from(source).select(`id, ${identityColumns}, created_at, ${columns}`);
      const filters = [];
      if (deviceId && !accountOnly) {
        filters.push(`visitor->>device_id.eq.${deviceId}`);
        if (legacyId) filters.push(`device_id.eq.${deviceId}`);
      }
      if (userIds.length) filters.push(`${userColumn}.in.(${userIds.join(",")})`);
      query = query.or(filters.join(","));
      if (accountOnly) query = query.eq("collect_statistics", true);
      if (since) query = query.gte("created_at", since);
      if (source === "cadastru_search_events") query = query.is("duplicate_of", null);
      const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
      if (error) throw new Error(`${source}: ${error.message}`);
      return (data || []).filter((row) =>
        // A shared browser must not attach another known account's actions.
        !userIds.length || !row.user_id || userIds.includes(row.user_id)
      ).map((row) => ({
        id: row.id, source, label, user_id: row.user_id, visitor: row.visitor,
        created_at: row.created_at,
        summary: [row.label, row.url_path, row.slug, row.estimate_type, row.city, row.district, row.search_address || row.cadastral_number,
          row.result_type, row.service, row.status, row.listing_url, row.event_type, row.product_key, row.source, row.event_name,
          source === "pdf_generation_events" && row.included_cadastral ? "Includes cadastral" : null].filter(Boolean).join(" · "),
      }));
    }))).flat().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 100);
  return events;
}
