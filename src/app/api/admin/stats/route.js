import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

const PAGE = 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { data: null, ts: 0 };

const PERIODS = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

async function fetchAllRows(buildQuery) {
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function countAllUsers() {
  let total = 0;
  let page = 1;
  try {
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error("Failed to list users:", error);
        break;
      }
      if (!data || !data.users) break;
      total += data.users.length;
      if (data.users.length < 1000) break;
      page++;
    }
  } catch (err) {
    console.error("Error in countAllUsers:", err);
  }
  return total;
}

async function fetchTelegramAlerts() {
  return fetchAllRows(() =>
    supabaseAdmin
      .from("user_listing_alerts")
      .select(
        "id, user_id, label, is_active, website_enabled, telegram_chat_id, base_filters, alert_filters, created_at, last_notified_at"
      )
      .eq("telegram_enabled", true)
      .order("created_at", { ascending: false })
  );
}

function isMissingEstimateTypeError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (code === "PGRST204" || code === "42703") && message.includes("estimate_type");
}

async function fetchEstimationCounts() {
  const totalRes = await supabaseAdmin
    .from("estimate_log")
    .select("*", { count: "exact", head: true });

  if (totalRes.error) {
    throw new Error(`estimate_log total query failed: ${totalRes.error.message}`);
  }

  const total = totalRes.count || 0;
  const rentRes = await supabaseAdmin
    .from("estimate_log")
    .select("*", { count: "exact", head: true })
    .eq("estimate_type", "rent");

  if (rentRes.error) {
    if (isMissingEstimateTypeError(rentRes.error)) {
      return { total, sale: total, rent: 0 };
    }
    throw new Error(`estimate_log rent query failed: ${rentRes.error.message}`);
  }

  const rent = rentRes.count || 0;
  return {
    total,
    sale: Math.max(total - rent, 0),
    rent,
  };
}

function buildPdfStats(rows, cutoffs) {
  const recent = rows.slice(0, 50);
  return {
    total: rows.length,
    registered: rows.filter((row) => row.user_id).length,
    anonymous: rows.filter((row) => !row.user_id).length,
    withCadastral: rows.filter((row) => row.included_cadastral).length,
    periods: Object.fromEntries(
      Object.entries(cutoffs).map(([period, cutoff]) => [
        period,
        rows.filter((row) => row.created_at && row.created_at >= cutoff).length,
      ])
    ),
    recent,
  };
}

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const bypassCache = request.nextUrl.searchParams.get("fresh") === "1";

  if (!bypassCache && cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const now = Date.now();
  const cutoffs = Object.fromEntries(
    Object.entries(PERIODS).map(([k, ms]) => [k, new Date(now - ms).toISOString()])
  );

  let dataResults;
  try {
    dataResults = await Promise.all([
      countAllUsers(),
      fetchEstimationCounts(),
      supabaseAdmin.from("shared_links").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("user_favorites").select("*", { count: "exact", head: true }),
      fetchTelegramAlerts(),
      fetchAllRows(() =>
        supabaseAdmin
          .from("pdf_generation_events")
          .select("id, user_id, device_id, session_id, estimate_log_id, included_cadastral, created_at")
          .order("created_at", { ascending: false })
      ),
    ]);
  } catch (err) {
    console.error("Failed to load stats:", err);
    return NextResponse.json({ error: "Failed to load complete stats from database" }, { status: 500 });
  }

  const [
    totalUsers,
    estimationCounts,
    countSharedLinks,
    countFavorites,
    telegramAlerts,
    pdfEvents,
  ] = dataResults;

  const result = {
    totalUsers: totalUsers || 0,
    totalEstimations: estimationCounts.sale || 0,
    totalSaleEstimations: estimationCounts.sale || 0,
    totalRentEstimations: estimationCounts.rent || 0,
    totalAllEstimations: estimationCounts.total || 0,
    estimationStats: estimationCounts,
    totalSharedLinks: countSharedLinks.count || 0,
    totalFavorites: countFavorites.count || 0,
    totalTelegramAlerts: telegramAlerts.length,
    telegramAlerts,
    pdfGeneration: buildPdfStats(pdfEvents, cutoffs),
  };

  if (!bypassCache) {
    cache = { data: result, ts: Date.now() };
  }
  return NextResponse.json(result);
}
