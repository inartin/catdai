import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

const PAGE = 1000;
const CACHE_TTL_MS = 60 * 1000;
const CACHE_VERSION = 2;
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

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  if (cache.data?.version === CACHE_VERSION && Date.now() - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const [users, estimationRows, sharedRows, favoriteRows, activityRows] = await Promise.all([
      listAllUsers(),
      fetchUserIdRows("estimate_log", "user_id"),
      fetchUserIdRows("shared_links", "sharer_user_id"),
      fetchUserIdRows("user_favorites", "user_id"),
      fetchActivityRows(),
    ]);

    const estimationsByUser = toCountMap(estimationRows, "user_id");
    const sharedByUser = toCountMap(sharedRows, "sharer_user_id");
    const favoritesByUser = toCountMap(favoriteRows, "user_id");
    const lastVisitByUser = toLatestTimestampMap(activityRows, "user_id", "last_seen_at");

    const data = {
      version: CACHE_VERSION,
      users: users.map((user) => ({
        id: user.id,
        name: userDisplayName(user),
        authProvider: userAuthProvider(user),
        registeredAt: userRegisteredAt(user),
        totalEstimations: estimationsByUser.get(user.id) || 0,
        sharedLinks: sharedByUser.get(user.id) || 0,
        favorites: favoritesByUser.get(user.id) || 0,
        lastVisitAt: lastVisitByUser.get(user.id) || null,
      })),
    };

    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to load admin users stats:", err);
    return NextResponse.json({ error: "Failed to load users stats" }, { status: 500 });
  }
}
