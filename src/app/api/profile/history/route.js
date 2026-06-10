import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveAccessTier } from "@/lib/access-tier";
import { NextResponse } from "next/server";

const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 30;
const ESTIMATE_COLUMNS = "id, estimate_type, city, district, rooms_count, area_m2, building_type, renovation, floor, total_floors, bathrooms_count, balconies_count, estimated_price, price_per_m2, created_at";
const CADASTRU_COLUMNS = "id, search_type, district, cadastral_number, result_type, lookup_source, created_at";

function isMissingEstimateTypeError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return (code === "PGRST204" || code === "42703") && message.includes("estimate_type");
}

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || code === "PGRST204";
}

function normalizeEstimateRow(row) {
  return {
    id: row.id,
    type: "estimate",
    estimateType: row.estimate_type === "rent" ? "rent" : "sale",
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
    createdAt: row.created_at,
  };
}

function normalizeCadastruRow(row) {
  return {
    id: `cadastru-${row.id}`,
    type: "cadastru",
    searchType: row.search_type,
    district: row.district,
    cadastralNumber: row.cadastral_number,
    resultType: row.result_type,
    lookupSource: row.lookup_source,
    createdAt: row.created_at,
  };
}

function parseLimit(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return DEFAULT_HISTORY_LIMIT;
  return Math.min(number, MAX_HISTORY_LIMIT);
}

function encodeCursor(row) {
  const createdAt = row?.created_at || row?.createdAt;
  if (!createdAt) return null;
  const payload = JSON.stringify({
    createdAt: new Date(createdAt).toISOString(),
  });
  return Buffer.from(payload).toString("base64url");
}

function decodeCursor(value) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const createdAt = new Date(parsed?.createdAt);
    if (Number.isNaN(createdAt.getTime())) return { error: "invalid_cursor" };
    return { createdAt: createdAt.toISOString() };
  } catch {
    return { error: "invalid_cursor" };
  }
}

function applyCursor(query, cursor) {
  if (!cursor) return query;
  return query.lt("created_at", cursor.createdAt);
}

function buildEstimateQuery(userId, columns, cursor, pageSize) {
  return applyCursor(
    supabaseAdmin
      .from("estimate_log")
      .select(columns)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(pageSize + 1),
    cursor
  );
}

async function fetchEstimateHistory(userId, cursor, pageSize) {
  const typedRes = await buildEstimateQuery(userId, ESTIMATE_COLUMNS, cursor, pageSize);

  if (!typedRes.error) return typedRes;

  if (!isMissingEstimateTypeError(typedRes.error)) {
    return typedRes;
  }

  return buildEstimateQuery(
    userId,
    ESTIMATE_COLUMNS.replace("estimate_type, ", ""),
    cursor,
    pageSize
  );
}

async function fetchCadastruHistory(userId, cursor, pageSize) {
  const res = await applyCursor(
    supabaseAdmin
      .from("cadastru_search_events")
      .select(CADASTRU_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(pageSize + 1),
    cursor
  );

  if (res.error && isMissingSchemaError(res.error)) {
    return { data: [], error: null };
  }

  return res;
}

export async function GET(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ history: [], nextCursor: null });
  }

  const { searchParams } = new URL(request.url);
  const pageSize = parseLimit(searchParams.get("limit"));
  const cursor = decodeCursor(searchParams.get("cursor"));

  if (cursor?.error) {
    return NextResponse.json({ error: cursor.error }, { status: 400 });
  }

  const [estimateRes, cadastruRes] = await Promise.all([
    fetchEstimateHistory(access.user_id, cursor, pageSize),
    fetchCadastruHistory(access.user_id, cursor, pageSize),
  ]);

  if (estimateRes.error || cadastruRes.error) {
    console.error(
      "[profile-history] history failed:",
      estimateRes.error?.message || cadastruRes.error?.message
    );
    return NextResponse.json({ history: [], nextCursor: null });
  }

  const rows = [
    ...(estimateRes.data || []).map(normalizeEstimateRow),
    ...(cadastruRes.data || []).map(normalizeCadastruRow),
  ].sort((a, b) => {
    const dateDiff = Date.parse(b.createdAt || "") - Date.parse(a.createdAt || "");
    if (dateDiff) return dateDiff;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
  const visibleRows = rows.slice(0, pageSize);
  const lastVisibleRow = visibleRows[visibleRows.length - 1];

  return NextResponse.json({
    history: visibleRows,
    nextCursor: rows.length > pageSize ? encodeCursor(lastVisibleRow) : null,
  });
}
