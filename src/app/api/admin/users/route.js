import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

const PAGE = 1000;
const CACHE_TTL_MS = 60 * 1000;
const CACHE_VERSION = 9;
const PACKAGE_PRODUCT_KEYS = new Set(["standard_pack", "pro_pack", "extra_pack"]);
let cache = { data: null, ts: 0 };

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42703" || code === "42P01";
}

async function listAllUsers() {
  let users = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) {
      throw new Error(`listUsers failed: ${error.message}`);
    }

    const chunk = data?.users || [];
    users = users.concat(chunk);
    if (chunk.length < PAGE) break;
    page += 1;
  }

  return users;
}

async function fetchUserIdRows(table, column) {
  let rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select(column)
      .not(column, "is", null)
      .range(from, from + PAGE - 1);

    if (error) {
      if (isMissingSchemaError(error)) return [];
      throw new Error(`${table}.${column} query failed: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    rows = rows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return rows;
}

async function fetchActivityRows() {
  let rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("user_activity")
      .select("user_id, last_seen_at")
      .not("user_id", "is", null)
      .range(from, from + PAGE - 1);

    if (error) {
      if (isMissingSchemaError(error)) return [];
      throw new Error(`user_activity query failed: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    rows = rows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return rows;
}

async function fetchPaidPackageRows() {
  let rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("paddle_payment_orders")
      .select("user_id, product_key, paid_at, created_at")
      .eq("status", "paid")
      .in("product_key", Array.from(PACKAGE_PRODUCT_KEYS))
      .not("user_id", "is", null)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      if (isMissingSchemaError(error)) return [];
      throw new Error(`paddle_payment_orders package query failed: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    rows = rows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return rows;
}

function toCountMap(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const id = row?.[key];
    if (!id) continue;
    map.set(id, (map.get(id) || 0) + 1);
  }
  return map;
}

function toLatestTimestampMap(rows, idKey, tsKey) {
  const map = new Map();
  for (const row of rows) {
    const id = row?.[idKey];
    const ts = row?.[tsKey];
    if (!id || !ts) continue;
    const next = Date.parse(ts);
    if (Number.isNaN(next)) continue;

    const prevRaw = map.get(id);
    const prev = prevRaw ? Date.parse(prevRaw) : Number.NaN;
    if (Number.isNaN(prev) || next > prev) {
      map.set(id, ts);
    }
  }
  return map;
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

function normalizeAuthProvider(provider) {
  const value = String(provider || "").trim().toLowerCase();
  if (value === "google") return "Gmail";
  if (value === "telegram") return "Telegram";
  if (value === "email") return "Email";
  if (value === "phone") return "Phone";
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : null;
}

function userAuthProvider(user) {
  const providers = [
    user?.user_metadata?.provider,
    user?.app_metadata?.provider,
    ...(Array.isArray(user?.identities)
      ? user.identities.map((identity) => identity?.provider)
      : []),
  ]
    .map(normalizeAuthProvider)
    .filter(Boolean);

  return providers[0] || "Unknown";
}

function userRegisteredAt(user) {
  return (
    user?.created_at ||
    user?.createdAt ||
    user?.registered_at ||
    user?.registration_date ||
    user?.confirmed_at ||
    user?.email_confirmed_at ||
    user?.last_sign_in_at ||
    null
  );
}

function toLatestPackageMap(rows) {
  const map = new Map();

  for (const row of rows || []) {
    const id = row?.user_id;
    const productKey = row?.product_key;
    if (!id || !PACKAGE_PRODUCT_KEYS.has(productKey)) continue;

    const rowTs = Date.parse(row.paid_at || row.created_at);
    if (Number.isNaN(rowTs)) continue;

    const prev = map.get(id);
    const prevTs = prev ? Date.parse(prev.paidAt || prev.createdAt) : Number.NaN;
    if (!prev || Number.isNaN(prevTs) || rowTs > prevTs) {
      map.set(id, {
        key: productKey,
        paidAt: row.paid_at || null,
        createdAt: row.created_at || null,
      });
    }
  }

  return map;
}

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  if (cache.data?.version === CACHE_VERSION && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const [users, estimationRows, sharedRows, favoriteRows, activityRows, cadastruSearchRows, calculatorUsageRows, pdfReportRows, listingLinkRows, packageRows] = await Promise.all([
      listAllUsers(),
      fetchUserIdRows("estimate_log", "user_id"),
      fetchUserIdRows("shared_links", "sharer_user_id"),
      fetchUserIdRows("user_favorites", "user_id"),
      fetchActivityRows(),
      fetchUserIdRows("cadastru_search_events", "user_id"),
      fetchUserIdRows("calculator_usage_events", "user_id"),
      fetchUserIdRows("pdf_generation_events", "user_id"),
      fetchUserIdRows("listing_link_analysis_events", "user_id"),
      fetchPaidPackageRows(),
    ]);

    const estimationsByUser = toCountMap(estimationRows, "user_id");
    const sharedByUser = toCountMap(sharedRows, "sharer_user_id");
    const favoritesByUser = toCountMap(favoriteRows, "user_id");
    const lastVisitByUser = toLatestTimestampMap(activityRows, "user_id", "last_seen_at");
    const cadastruSearchesByUser = toCountMap(cadastruSearchRows, "user_id");
    const calculatorUsageByUser = toCountMap(calculatorUsageRows, "user_id");
    const pdfReportsByUser = toCountMap(pdfReportRows, "user_id");
    const listingLinksByUser = toCountMap(listingLinkRows, "user_id");
    const packageByUser = toLatestPackageMap(packageRows);

    const data = {
      version: CACHE_VERSION,
      users: users.map((user) => {
        const paidPackage = packageByUser.get(user.id);

        return {
          id: user.id,
          name: userDisplayName(user),
          email: user.email || null,
          authProvider: userAuthProvider(user),
          packageKey: paidPackage?.key || "free",
          packageSource: paidPackage ? "paid" : "free",
          packagePaidAt: paidPackage?.paidAt || null,
          registeredAt: userRegisteredAt(user),
          totalEstimations: estimationsByUser.get(user.id) || 0,
          cadastruSearches: cadastruSearchesByUser.get(user.id) || 0,
          calculatorUsage: calculatorUsageByUser.get(user.id) || 0,
          pdfReports: pdfReportsByUser.get(user.id) || 0,
          listingLinks: listingLinksByUser.get(user.id) || 0,
          sharedLinks: sharedByUser.get(user.id) || 0,
          favorites: favoritesByUser.get(user.id) || 0,
          lastVisitAt: lastVisitByUser.get(user.id) || null,
        };
      }),
    };

    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to load admin users stats:", err);
    return NextResponse.json({ error: "Failed to load users stats" }, { status: 500 });
  }
}
