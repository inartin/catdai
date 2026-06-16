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
const DASHBOARD_PERIODS = {
  day: { label: "Last day", ms: PERIODS["24h"] },
  week: { label: "Last week", ms: PERIODS["7d"] },
  month: { label: "Last month", ms: PERIODS["30d"] },
  all: { label: "All time", ms: null },
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

function parseDashboardPeriod(value) {
  return DASHBOARD_PERIODS[value] ? value : "all";
}

function applySince(query, column, since) {
  return since ? query.gte(column, since) : query;
}

function filterRowsSince(rows, column, since) {
  if (!since) return rows;
  return rows.filter((row) => row[column] && row[column] >= since);
}

async function listAllUsers() {
  let users = [];
  let page = 1;
  try {
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        console.error("Failed to list users:", error);
        break;
      }
      if (!data || !data.users) break;
      users = users.concat(data.users);
      if (data.users.length < 1000) break;
      page++;
    }
  } catch (err) {
    console.error("Error in listAllUsers:", err);
  }
  return users;
}

function userDisplayName(user) {
  const meta = user?.user_metadata || {};
  const composed = [meta.first_name, meta.last_name].filter(Boolean).join(" ").trim();

  return (
    meta.full_name ||
    meta.name ||
    meta.display_name ||
    composed ||
    user?.email ||
    user?.phone ||
    user?.id ||
    "Unknown"
  );
}

function buildUserNameMap(users) {
  return new Map((users || []).map((user) => [user.id, userDisplayName(user)]));
}

async function fetchTelegramAlerts(since) {
  return fetchAllRows(() =>
    applySince(
      supabaseAdmin
        .from("user_listing_alerts")
        .select(
          "id, user_id, label, is_active, website_enabled, telegram_chat_id, base_filters, alert_filters, created_at, last_notified_at"
        )
        .eq("telegram_enabled", true),
      "created_at",
      since
    ).order("created_at", { ascending: false })
  );
}

function isMissingEstimateTypeError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (code === "PGRST204" || code === "42703") && message.includes("estimate_type");
}

async function fetchEstimationCounts(since) {
  const totalRes = await applySince(
    supabaseAdmin
      .from("estimate_log")
      .select("*", { count: "exact", head: true }),
    "created_at",
    since
  );

  if (totalRes.error) {
    throw new Error(`estimate_log total query failed: ${totalRes.error.message}`);
  }

  const total = totalRes.count || 0;
  const rentRes = await applySince(
    supabaseAdmin
      .from("estimate_log")
      .select("*", { count: "exact", head: true })
      .eq("estimate_type", "rent"),
    "created_at",
    since
  );

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

function isMissingCadastruColumnError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (code === "PGRST204" || code === "42703") && (
    message.includes("district") ||
    message.includes("cadastral_number") ||
    message.includes("result_type") ||
    message.includes("lookup_source")
  );
}

async function fetchCadastruRows(columns, defaults = {}, since) {
  const buildTypedQuery = (columns) => () =>
    applySince(
      supabaseAdmin
        .from("cadastru_search_events")
        .select(columns),
      "created_at",
      since
    ).order("created_at", { ascending: false });

  const firstPage = await buildTypedQuery(columns)().range(0, PAGE - 1);
  if (!firstPage.error) {
    const rows = (!firstPage.data || firstPage.data.length < PAGE)
      ? firstPage.data || []
      : await fetchAllRows(buildTypedQuery(columns));
    return { rows: rows.map((row) => ({ ...defaults, ...row })) };
  }

  return { error: firstPage.error };
}

async function fetchCadastruSearchEvents(since) {
  const columnAttempts = [
    {
      columns: "id, search_type, user_id, district, cadastral_number, result_type, lookup_source, created_at",
      defaults: {},
    },
    {
      columns: "id, search_type, user_id, district, cadastral_number, result_type, created_at",
      defaults: { lookup_source: null },
    },
    {
      columns: "id, search_type, user_id, district, created_at",
      defaults: { cadastral_number: null, result_type: null, lookup_source: null },
    },
    {
      columns: "id, search_type, user_id, cadastral_number, result_type, created_at",
      defaults: { district: null, lookup_source: null },
    },
    {
      columns: "id, search_type, user_id, created_at",
      defaults: { district: null, cadastral_number: null, result_type: null, lookup_source: null },
    },
  ];

  for (const attempt of columnAttempts) {
    const result = await fetchCadastruRows(attempt.columns, attempt.defaults, since);
    if (!result.error) return result.rows;
    if (!isMissingCadastruColumnError(result.error)) return [];
  }

  return [];
}

function countByValue(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key];
    if (!value) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function buildCadastruSearchStats(rows, cutoffs) {
  const byType = {
    address: rows.filter((row) => row.search_type === "address").length,
    number: rows.filter((row) => row.search_type === "number").length,
  };

  return {
    total: rows.length,
    registered: rows.filter((row) => row.user_id).length,
    anonymous: rows.filter((row) => !row.user_id).length,
    address: byType.address,
    number: byType.number,
    byType,
    byResultType: countByValue(rows, "result_type"),
    byLookupSource: countByValue(rows, "lookup_source"),
    byDistrict: countByValue(rows, "district"),
    periods: Object.fromEntries(
      Object.entries(cutoffs).map(([period, cutoff]) => [
        period,
        rows.filter((row) => row.created_at && row.created_at >= cutoff).length,
      ])
    ),
    recent: rows.slice(0, 50),
  };
}

function attachUserNames(rows, usersById) {
  return rows.map((row) => ({
    ...row,
    user_name: row.user_id ? usersById.get(row.user_id) || row.user_id : null,
  }));
}

async function fetchListingLinkAnalysisEvents(since) {
  const buildQuery = () =>
    applySince(
      supabaseAdmin
        .from("listing_link_analysis_events")
        .select(
          "id, status, error_code, user_id, external_id, listing_url, city, district, rooms_count, listing_price, listing_currency, created_at"
        ),
      "created_at",
      since
    ).order("created_at", { ascending: false });

  const firstPage = await buildQuery().range(0, PAGE - 1);
  if (!firstPage.error) {
    if (!firstPage.data || firstPage.data.length < PAGE) return firstPage.data || [];
    return fetchAllRows(buildQuery);
  }

  const code = String(firstPage.error?.code || "");
  if (code === "42P01" || code === "PGRST204") return [];
  throw new Error(`listing_link_analysis_events query failed: ${firstPage.error.message}`);
}

function buildListingLinkAnalysisStats(rows, cutoffs) {
  const byStatus = countByValue(rows, "status");

  return {
    total: rows.length,
    success: byStatus.success || 0,
    unsupported: byStatus.unsupported_listing_type || 0,
    failed: rows.filter((row) => row.status !== "success" && row.status !== "unsupported_listing_type").length,
    byStatus,
    periods: Object.fromEntries(
      Object.entries(cutoffs).map(([period, cutoff]) => [
        period,
        rows.filter((row) => row.created_at && row.created_at >= cutoff).length,
      ])
    ),
    recent: rows.slice(0, 50),
  };
}

async function fetchCalculatorUsageEvents(since) {
  const buildQuery = () =>
    applySince(
      supabaseAdmin
        .from("calculator_usage_events")
        .select(
          "id, user_id, device_id, session_id, city, district, rooms_count, area_m2, building_type, renovation, apartment_price, additional_investments, total_investment, include_rent_tax, estimated_monthly_rent, annual_gross_yield_pct, effective_yield_pct, payback_years, created_at"
        ),
      "created_at",
      since
    ).order("created_at", { ascending: false });

  const firstPage = await buildQuery().range(0, PAGE - 1);
  if (!firstPage.error) {
    if (!firstPage.data || firstPage.data.length < PAGE) return firstPage.data || [];
    return fetchAllRows(buildQuery);
  }

  const code = String(firstPage.error?.code || "");
  if (code === "42P01" || code === "42703" || code === "PGRST204") return [];
  throw new Error(`calculator_usage_events query failed: ${firstPage.error.message}`);
}

function averageNumber(rows, key) {
  const values = rows
    .map((row) => Number(row[key]))
    .filter((value) => Number.isFinite(value));

  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildCalculatorUsageStats(rows, cutoffs) {
  return {
    total: rows.length,
    registered: rows.filter((row) => row.user_id).length,
    anonymous: rows.filter((row) => !row.user_id).length,
    withTax: rows.filter((row) => row.include_rent_tax).length,
    averages: {
      apartmentPrice: averageNumber(rows, "apartment_price"),
      monthlyRent: averageNumber(rows, "estimated_monthly_rent"),
      grossYieldPct: averageNumber(rows, "annual_gross_yield_pct"),
      paybackYears: averageNumber(rows, "payback_years"),
    },
    periods: Object.fromEntries(
      Object.entries(cutoffs).map(([period, cutoff]) => [
        period,
        rows.filter((row) => row.created_at && row.created_at >= cutoff).length,
      ])
    ),
    recent: rows.slice(0, 50),
  };
}

async function fetchExternalApiUsageRows(sinceDate) {
  const { data, error } = await applySince(
    supabaseAdmin
      .from("external_api_usage_daily")
      .select("usage_date, service, status, count, updated_at"),
    "usage_date",
    sinceDate
  )
    .order("usage_date", { ascending: false });

  if (!error) return data || [];

  const code = String(error?.code || "");
  if (code === "42P01" || code === "42703" || code === "PGRST204") return [];
  throw new Error(`external_api_usage_daily query failed: ${error.message}`);
}

function buildExternalApiUsageStats(rows) {
  const emptyService = () => ({ success: 0, failure: 0, total: 0 });
  const byService = {
    "999_listing": emptyService(),
    cadastru_number: emptyService(),
    cadastru_address: emptyService(),
  };

  for (const row of rows) {
    const service = byService[row.service];
    if (!service) continue;
    const count = Number(row.count) || 0;
    if (row.status === "success") service.success += count;
    if (row.status === "failure") service.failure += count;
    service.total += count;
  }

  return {
    total: Object.values(byService).reduce((sum, item) => sum + item.total, 0),
    success: Object.values(byService).reduce((sum, item) => sum + item.success, 0),
    failure: Object.values(byService).reduce((sum, item) => sum + item.failure, 0),
    byService,
    recent: rows.slice(0, 60),
  };
}

async function fetchPaidUserSummary(since) {
  const paidOrders = await fetchAllRows(() =>
    applySince(
      supabaseAdmin
        .from("paddle_payment_orders")
        .select("user_id, product_key, paid_at, created_at")
        .eq("status", "paid")
        .not("user_id", "is", null),
      "created_at",
      since
    )
      .order("created_at", { ascending: false })
  );
  const activeCredits = await fetchAllRows(() =>
    supabaseAdmin
      .from("user_feature_credits")
      .select("user_id, remaining_uses")
      .gt("remaining_uses", 0)
      .not("user_id", "is", null)
  );

  const paidUsersById = new Map();
  for (const order of paidOrders) {
    if (!order.user_id) continue;
    const current = paidUsersById.get(order.user_id) || {
      userId: order.user_id,
      paidOrders: 0,
      latestPaidAt: null,
      latestProductKey: null,
    };
    current.paidOrders += 1;

    const paidAt = order.paid_at || order.created_at || null;
    if (!current.latestPaidAt || (paidAt && Date.parse(paidAt) > Date.parse(current.latestPaidAt))) {
      current.latestPaidAt = paidAt;
      current.latestProductKey = order.product_key || null;
    }
    paidUsersById.set(order.user_id, current);
  }

  const remainingCreditsByUser = new Map();
  for (const credit of activeCredits) {
    const userId = credit.user_id;
    if (!userId) continue;
    remainingCreditsByUser.set(
      userId,
      (remainingCreditsByUser.get(userId) || 0) + Math.max(Number(credit.remaining_uses) || 0, 0)
    );
  }

  for (const [userId, paidUser] of Array.from(paidUsersById.entries())) {
    const remainingPaidCredits = remainingCreditsByUser.get(userId) || 0;
    if (remainingPaidCredits <= 0) {
      paidUsersById.delete(userId);
      continue;
    }
    paidUser.remainingPaidCredits = remainingPaidCredits;
  }

  const filteredPaidOrders = paidOrders.filter((order) => paidUsersById.has(order.user_id));

  return {
    totalPaidUsers: paidUsersById.size,
    paidOrders: filteredPaidOrders.length,
    remainingPaidCredits: Array.from(paidUsersById.values()).reduce(
      (sum, user) => sum + (Number(user.remainingPaidCredits) || 0),
      0
    ),
    users: Array.from(paidUsersById.values()).sort((a, b) =>
      Date.parse(b.latestPaidAt || 0) - Date.parse(a.latestPaidAt || 0)
    ),
  };
}

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const bypassCache = request.nextUrl.searchParams.get("fresh") === "1";
  const period = parseDashboardPeriod(request.nextUrl.searchParams.get("period"));
  const periodConfig = DASHBOARD_PERIODS[period];
  const periodSince = periodConfig.ms ? new Date(Date.now() - periodConfig.ms).toISOString() : null;
  const periodSinceDate = periodSince ? periodSince.slice(0, 10) : null;
  const cacheKey = period;

  if (!bypassCache && cache[cacheKey] && Date.now() - cache[cacheKey].ts < CACHE_TTL_MS) {
    return NextResponse.json(cache[cacheKey].data);
  }

  const now = Date.now();
  const cutoffs = Object.fromEntries(
    Object.entries(PERIODS).map(([k, ms]) => [k, new Date(now - ms).toISOString()])
  );

  let dataResults;
  try {
    dataResults = await Promise.all([
      listAllUsers(),
      fetchEstimationCounts(periodSince),
      applySince(
        supabaseAdmin.from("shared_links").select("*", { count: "exact", head: true }),
        "created_at",
        periodSince
      ),
      applySince(
        supabaseAdmin.from("user_favorites").select("*", { count: "exact", head: true }),
        "created_at",
        periodSince
      ),
      fetchTelegramAlerts(periodSince),
      fetchAllRows(() =>
        applySince(
          supabaseAdmin
            .from("pdf_generation_events")
            .select("id, user_id, device_id, session_id, estimate_log_id, included_cadastral, created_at"),
          "created_at",
          periodSince
        ).order("created_at", { ascending: false })
      ),
      fetchCadastruSearchEvents(periodSince),
      fetchListingLinkAnalysisEvents(periodSince),
      fetchCalculatorUsageEvents(periodSince),
      fetchExternalApiUsageRows(periodSinceDate),
      fetchPaidUserSummary(periodSince).catch((error) => {
        console.error("Failed to load paid user stats:", error.message);
        return { available: false, totalPaidUsers: 0, paidOrders: 0 };
      }),
    ]);
  } catch (err) {
    console.error("Failed to load stats:", err);
    return NextResponse.json({ error: "Failed to load complete stats from database" }, { status: 500 });
  }

  const [
    users,
    estimationCounts,
    countSharedLinks,
    countFavorites,
    telegramAlerts,
    pdfEvents,
    cadastruSearchEvents,
    listingLinkAnalysisEvents,
    calculatorUsageEvents,
    externalApiUsageRows,
    paidUserSummary,
  ] = dataResults;
  const usersById = buildUserNameMap(users);
  const authUsersById = new Map(users.map((user) => [user.id, user]));
  const filteredUsers = filterRowsSince(users, "created_at", periodSince);
  const cadastruSearchesWithUsers = attachUserNames(cadastruSearchEvents, usersById);
  const paidUsers = {
    ...paidUserSummary,
    users: (paidUserSummary.users || []).map((item) => {
      const user = authUsersById.get(item.userId);
      return {
        ...item,
        name: user ? userDisplayName(user) : item.userId,
        email: user?.email || null,
        registeredAt: user?.created_at || null,
      };
    }),
  };

  const result = {
    period,
    periodLabel: periodConfig.label,
    periodSince,
    totalUsers: filteredUsers.length,
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
    cadastruSearches: buildCadastruSearchStats(cadastruSearchesWithUsers, cutoffs),
    listingLinkAnalyses: buildListingLinkAnalysisStats(listingLinkAnalysisEvents, cutoffs),
    calculatorUsage: buildCalculatorUsageStats(calculatorUsageEvents, cutoffs),
    externalApiUsage: buildExternalApiUsageStats(externalApiUsageRows),
    paidUsers,
  };

  if (!bypassCache) {
    cache[cacheKey] = { data: result, ts: Date.now() };
  }
  return NextResponse.json(result);
}
