import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveAccessTier } from "@/lib/access-tier";
import { normalizePaidEvaluationSnapshot, PAID_EVALUATION_FEATURE_KEYS } from "@/lib/evaluation-snapshots";
import { NextResponse } from "next/server";

const DEFAULT_HISTORY_LIMIT = 10;
const MAX_HISTORY_LIMIT = 30;
const ESTIMATE_COLUMNS = "id, estimate_type, city, district, rooms_count, area_m2, building_type, renovation, floor, total_floors, bathrooms_count, balconies_count, estimated_price, price_per_m2, created_at";
const CADASTRU_COLUMNS = "id, search_type, city, district, cadastral_number, result_type, lookup_source, created_at";
const PAID_USAGE_COLUMNS = "id, feature_key, metadata, created_at";

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
    city: row.city,
    district: row.district,
    cadastralNumber: row.cadastral_number,
    resultType: row.result_type,
    lookupSource: row.lookup_source,
    createdAt: row.created_at,
  };
}

function normalizePaidSnapshotRow(row) {
  const snapshot = normalizePaidEvaluationSnapshot(row);
  if (!snapshot) return null;

  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const input = snapshot.result.input || {};
  const estimate = snapshot.result.estimate || {};
  return {
    id: `paid-evaluation-${row.id}`,
    type: "estimate",
    isSnapshot: true,
    snapshotId: row.id,
    href: `/evaluare?snapshot_id=${encodeURIComponent(row.id)}`,
    estimateType: snapshot.estimateType,
    city: input.city,
    district: input.district,
    districts: Array.isArray(input.districts) ? input.districts : null,
    roomsCount: input.rooms_count,
    areaM2: input.area_m2,
    buildingType: input.building_type,
    buildingTypes: Array.isArray(input.building_types) ? input.building_types : null,
    renovation: input.renovation,
    floor: input.floor,
    totalFloors: input.total_floors,
    bathroomsCount: input.bathrooms_count,
    balconiesCount: input.balconies_count,
    estimatedPrice: estimate.market_rate,
    pricePerM2: estimate.price_per_m2,
    createdAt: snapshot.createdAt || row.created_at,
    sourceLogId: metadata.log_id || null,
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

  if (res.error && isMissingSchemaError(res.error) && String(res.error?.message || "").includes("city")) {
    return applyCursor(
      supabaseAdmin
        .from("cadastru_search_events")
        .select(CADASTRU_COLUMNS.replace("city, ", ""))
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(pageSize + 1),
      cursor
    );
  }

  if (res.error && isMissingSchemaError(res.error)) {
    return { data: [], error: null };
  }

  return res;
}

async function fetchPaidEvaluationSnapshots(userId, cursor, pageSize) {
  const res = await applyCursor(
    supabaseAdmin
      .from("user_feature_usage_events")
      .select(PAID_USAGE_COLUMNS)
      .eq("user_id", userId)
      .eq("source", "paid_credit")
      .in("feature_key", PAID_EVALUATION_FEATURE_KEYS)
      .order("created_at", { ascending: false })
      .limit(pageSize + 1),
    cursor
  );

  if (res.error && isMissingSchemaError(res.error)) {
    return { data: [], error: null };
  }

  if (res.error) return res;

  return {
    data: (res.data || []).map(normalizePaidSnapshotRow).filter(Boolean),
    error: null,
  };
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

  const [estimateRes, cadastruRes, paidSnapshotRes] = await Promise.all([
    fetchEstimateHistory(access.user_id, cursor, pageSize),
    fetchCadastruHistory(access.user_id, cursor, pageSize),
    fetchPaidEvaluationSnapshots(access.user_id, cursor, pageSize),
  ]);

  if (estimateRes.error || cadastruRes.error || paidSnapshotRes.error) {
    console.error(
      "[profile-history] history failed:",
      estimateRes.error?.message || cadastruRes.error?.message || paidSnapshotRes.error?.message
    );
    return NextResponse.json({ history: [], nextCursor: null });
  }

  const paidSnapshotRows = paidSnapshotRes.data || [];
  const paidSnapshotLogIds = new Set(
    paidSnapshotRows
      .map((paidRow) => paidRow.sourceLogId)
      .filter(Boolean)
      .map(String)
  );

  const rows = [
    ...(estimateRes.data || [])
      .filter((row) => !paidSnapshotLogIds.has(String(row.id || "")))
      .map(normalizeEstimateRow),
    ...(cadastruRes.data || []).map(normalizeCadastruRow),
    ...paidSnapshotRows.map(({ sourceLogId, ...row }) => row),
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
