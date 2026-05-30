import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

const PAGE = 1000;
const LIST_LIMIT = 200;
const CACHE_TTL_MS = 60 * 1000;
const ESTIMATE_COLUMNS = "id, user_id, city, district, rooms_count, area_m2, building_type, renovation, floor, total_floors, bathrooms_count, balconies_count, estimated_price, price_per_m2, created_at";
const ESTIMATE_COLUMNS_WITH_TYPE = `${ESTIMATE_COLUMNS}, estimate_type`;
let cache = new Map();

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42703" || code === "42P01";
}

function isMissingEstimateTypeError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (code === "PGRST204" || code === "42703") && message.includes("estimate_type");
}

function estimateParams(row) {
  const params = {
    ...(row.estimate_type === "rent" ? { type: "rent" } : {}),
    city: row.city,
    district: row.district,
    rooms: row.rooms_count,
    area: row.area_m2,
    floor: row.floor,
    total_floors: row.total_floors,
    building_type: row.building_type,
    renovation: row.renovation,
    bathrooms: row.bathrooms_count,
    balconies: row.balconies_count,
  };

  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value != null && value !== "")
      .map(([key, value]) => [key, normalizeParamValue(value)])
  );
}

function applyEstimateTypeFilter(query, type) {
  if (type === "rent") return query.eq("estimate_type", "rent");
  if (type === "sale") return query.neq("estimate_type", "rent");
  return query;
}

function normalizedSearch(params) {
  const normalized = Object.fromEntries(
    Object.entries(params || {})
      .filter(([, value]) => value != null && value !== "")
      .map(([key, value]) => [key, normalizeParamValue(value)])
  );
  const search = new URLSearchParams(normalized);
  search.sort();
  return search.toString();
}

function normalizeParamValue(value) {
  const stringValue = String(value);
  if (!stringValue.trim()) return stringValue;

  const numberValue = Number(stringValue);
  if (Number.isFinite(numberValue) && String(numberValue) === String(parseFloat(stringValue))) {
    return String(numberValue);
  }

  return stringValue;
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

async function fetchSharedLinks() {
  const { data, error } = await supabaseAdmin
    .from("shared_links")
    .select("id, params, sharer_user_id");

  if (error) {
    if (isMissingSchemaError(error)) return [];
    throw new Error(`shared_links query failed: ${error.message}`);
  }

  return data || [];
}

async function fetchFavorites() {
  const { data, error } = await supabaseAdmin
    .from("user_favorites")
    .select("id, user_id, url_path");

  if (error) {
    if (isMissingSchemaError(error)) return [];
    throw new Error(`user_favorites query failed: ${error.message}`);
  }

  return data || [];
}

function buildSharedSet(rows) {
  const set = new Set();
  for (const row of rows) {
    if (!row?.params) continue;
    const search = normalizedSearch(row.params);
    set.add(`${row.sharer_user_id || "anonymous"}|${search}`);
  }
  return set;
}

function buildFavoriteSet(rows) {
  const set = new Set();
  for (const row of rows) {
    if (!row?.url_path) continue;
    const query = String(row.url_path).split("?")[1] || "";
    if (!query) continue;
    const params = new URLSearchParams(query);
    params.delete("_new");
    params.delete("share_slug");
    set.add(`${row.user_id}|${normalizedSearch(Object.fromEntries(params.entries()))}`);
  }
  return set;
}

async function fetchEstimateRows(type) {
  const typedQuery = applyEstimateTypeFilter(
    supabaseAdmin
      .from("estimate_log")
      .select(ESTIMATE_COLUMNS_WITH_TYPE)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT),
    type
  );
  const typedRes = await typedQuery;

  if (!typedRes.error) return typedRes;

  if (!isMissingEstimateTypeError(typedRes.error)) {
    return typedRes;
  }

  if (type === "rent") {
    return { data: [], error: null };
  }

  return supabaseAdmin
    .from("estimate_log")
    .select(ESTIMATE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
}

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const requestedType = request.nextUrl.searchParams.get("type");
  const type = requestedType === "rent" ? "rent" : requestedType === "all" ? "all" : "sale";
  const cached = cache.get(type);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const [estimateRes, users, sharedRows, favoriteRows] = await Promise.all([
      fetchEstimateRows(type),
      listAllUsers(),
      fetchSharedLinks(),
      fetchFavorites(),
    ]);

    if (estimateRes.error) {
      throw new Error(`estimate_log query failed: ${estimateRes.error.message}`);
    }

    const usersById = new Map(users.map((user) => [user.id, userDisplayName(user)]));
    const sharedSet = buildSharedSet(sharedRows);
    const favoriteSet = buildFavoriteSet(favoriteRows);

    const estimations = (estimateRes.data || []).map((row) => {
      const search = normalizedSearch(estimateParams(row));
      const actorKey = row.user_id || "anonymous";

      return {
        id: row.id,
        userId: row.user_id || null,
        userName: row.user_id ? usersById.get(row.user_id) || row.user_id : null,
        isAnonymous: !row.user_id,
        city: row.city,
        district: row.district,
        roomsCount: row.rooms_count,
        areaM2: row.area_m2,
        buildingType: row.building_type,
        renovation: row.renovation,
        floor: row.floor,
        totalFloors: row.total_floors,
        bathroomsCount: row.bathrooms_count,
        balconiesCount: row.balconies_count,
        estimatedPrice: row.estimated_price,
        pricePerM2: row.price_per_m2,
        estimateType: row.estimate_type === "rent" ? "rent" : "sale",
        createdAt: row.created_at,
        shared: sharedSet.has(`${actorKey}|${search}`),
        favorited: row.user_id ? favoriteSet.has(`${row.user_id}|${search}`) : false,
      };
    });

    const data = { estimations, type };
    cache.set(type, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (err) {
    console.error("Failed to load admin estimations:", err);
    return NextResponse.json({ error: "Failed to load estimations" }, { status: 500 });
  }
}
