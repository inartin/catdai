import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";

export const FREE_MONTHLY_FULL_EVALUATION_LIMIT = 1;
export const FREE_MONTHLY_FULL_EVALUATION_FEATURE_KEYS = ["sale_estimate", "rent_estimate"];

export function getFreeMonthlyFeatureUsageWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    monthKey: start.toISOString().slice(0, 7),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function makeMonthlyFeatureUsageKey(featureKey, payload) {
  const { monthKey } = getFreeMonthlyFeatureUsageWindow();
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(payload || {}))
    .digest("hex")
    .slice(0, 32);

  return `${monthKey}:${featureKey}:${hash}`;
}

function isMissingFreeUsageRpc(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42883" || code === "PGRST202" || message.includes("consume_free_monthly_feature_usage");
}

async function consumeFreeMonthlyFeatureUsageFallback({
  userId,
  featureKey,
  idempotencyKey,
  limit,
  metadata,
  monthStart,
  monthEnd,
}) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("user_feature_usage_events")
    .select("id, source")
    .eq("user_id", userId)
    .eq("feature_key", featureKey)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingError) throw existingError;

  const countQuery = supabaseAdmin
    .from("user_feature_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature_key", featureKey)
    .eq("source", "free_monthly")
    .gte("created_at", monthStart)
    .lt("created_at", monthEnd);

  const { count, error: countError } = await countQuery;
  if (countError) throw countError;

  const used = count || 0;
  if (existing) {
    return {
      allowed: true,
      usage_event_id: existing.id,
      source: existing.source,
      used_count: used,
      remaining_uses: Math.max(limit - used, 0),
      reason: "already_consumed",
    };
  }

  if (used >= limit) {
    return {
      allowed: false,
      usage_event_id: null,
      source: null,
      used_count: used,
      remaining_uses: 0,
      reason: "free_monthly_limit_reached",
    };
  }

  const { data, error } = await supabaseAdmin
    .from("user_feature_usage_events")
    .insert({
      user_id: userId,
      feature_key: featureKey,
      source: "free_monthly",
      idempotency_key: idempotencyKey,
      metadata: metadata || {},
    })
    .select("id")
    .single();

  if (error) throw error;

  return {
    allowed: true,
    usage_event_id: data?.id || null,
    source: "free_monthly",
    used_count: used + 1,
    remaining_uses: Math.max(limit - used - 1, 0),
    reason: "consumed",
  };
}

export async function consumeFreeMonthlyFeatureUsage({
  userId,
  featureKey,
  idempotencyKey,
  metadata = {},
  limit = FREE_MONTHLY_FULL_EVALUATION_LIMIT,
}) {
  const { startIso, endIso } = getFreeMonthlyFeatureUsageWindow();
  const resetAt = endIso;

  if (!userId) {
    return {
      allowed: false,
      reason: "unauthorized",
      limit,
      used_count: 0,
      remaining_uses: 0,
      reset_at: resetAt,
    };
  }

  if (!shouldPersistRuntimeData()) {
    return {
      allowed: true,
      reason: "runtime_persistence_disabled",
      source: "free_monthly",
      limit,
      used_count: 0,
      remaining_uses: limit,
      reset_at: resetAt,
    };
  }

  const rpcArgs = {
    p_user_id: userId,
    p_feature_key: featureKey,
    p_idempotency_key: idempotencyKey,
    p_month_start: startIso,
    p_month_end: endIso,
    p_limit: limit,
    p_metadata: metadata || {},
  };

  const { data, error } = await supabaseAdmin.rpc("consume_free_monthly_feature_usage", rpcArgs);
  let result;

  if (error && isMissingFreeUsageRpc(error)) {
    result = await consumeFreeMonthlyFeatureUsageFallback({
      userId,
      featureKey,
      idempotencyKey,
      limit,
      metadata,
      monthStart: startIso,
      monthEnd: endIso,
    });
  } else if (error) {
    throw error;
  } else {
    result = Array.isArray(data) ? data[0] : data;
  }

  return {
    allowed: result?.allowed === true,
    usage_event_id: result?.usage_event_id || null,
    source: result?.source || "free_monthly",
    reason: result?.reason || null,
    limit,
    used_count: Number(result?.used_count) || 0,
    remaining_uses: Math.max(Number(result?.remaining_uses) || 0, 0),
    reset_at: resetAt,
  };
}
