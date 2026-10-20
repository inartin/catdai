import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";

// Compatibility names remain for existing callers; only retained credits can be spent.
export const FREE_MONTHLY_FEATURE_LIMIT = 1;
export function getFreeMonthlyFeatureLimit() {
  return FREE_MONTHLY_FEATURE_LIMIT;
}
export const FREE_MONTHLY_FEATURE_KEYS = [
  "sale_estimate",
  "rent_estimate",
  "listing_analysis",
  "cadastru_lookup",
  "yield_calculator",
  "pdf_report",
];

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
  return code === "42883"
    || code === "PGRST202"
    || message.includes("consume_free_monthly_credit")
    || message.includes("free monthly usage is not supported for feature key");
}

export async function checkFreeMonthlyFeatureUsage({
  userId,
  featureKey,
  idempotencyKey,
  limit = FREE_MONTHLY_FEATURE_LIMIT,
}) {
  const featureLimit = Math.min(limit, getFreeMonthlyFeatureLimit(featureKey));

  if (!userId) {
    return { allowed: false, reason: "unauthorized", remaining_uses: 0 };
  }

  if (!FREE_MONTHLY_FEATURE_KEYS.includes(featureKey)) {
    return { allowed: false, reason: "unknown_feature", remaining_uses: 0 };
  }

  if (featureLimit <= 0) {
    return { allowed: false, reason: "free_monthly_limit_reached", remaining_uses: 0 };
  }

  if (!shouldPersistRuntimeData()) {
    return { allowed: false, reason: "free_monthly_limit_reached", remaining_uses: 0 };
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("user_feature_usage_events")
    .select("id, source")
    .eq("user_id", userId)
    .eq("feature_key", featureKey)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    return {
      allowed: true,
      reason: "already_consumed",
      source: existing.source,
      usage_event_id: existing.id,
      remaining_uses: null,
    };
  }

  const { data: retained, error } = await supabaseAdmin
    .from("user_retained_free_credits")
    .select("remaining_uses")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const remaining = Math.min(featureLimit, retained?.remaining_uses || 0);
  return remaining > 0
    ? { allowed: true, reason: "has_free_credit", remaining_uses: remaining }
    : { allowed: false, reason: "free_monthly_limit_reached", remaining_uses: 0 };
}

export async function consumeFreeMonthlyFeatureUsage({
  userId,
  featureKey,
  idempotencyKey,
  metadata = {},
  limit = FREE_MONTHLY_FEATURE_LIMIT,
}) {
  const { startIso, endIso } = getFreeMonthlyFeatureUsageWindow();
  const resetAt = null; // Retained credits never renew.
  const featureLimit = Math.min(limit, getFreeMonthlyFeatureLimit(featureKey));

  if (!userId) {
    return {
      allowed: false,
      reason: "unauthorized",
      limit: featureLimit,
      used_count: 0,
      remaining_uses: 0,
      reset_at: resetAt,
    };
  }

  if (!FREE_MONTHLY_FEATURE_KEYS.includes(featureKey)) {
    return {
      allowed: false,
      reason: "unknown_feature",
      limit: featureLimit,
      used_count: 0,
      remaining_uses: 0,
      reset_at: resetAt,
    };
  }

  if (featureLimit <= 0) {
    return {
      allowed: false,
      reason: "free_monthly_limit_reached",
      limit: 0,
      used_count: 0,
      remaining_uses: 0,
      reset_at: resetAt,
    };
  }

  if (!shouldPersistRuntimeData()) {
    return {
      allowed: false,
      reason: "free_monthly_limit_reached",
      source: "free_monthly",
      limit: featureLimit,
      used_count: 0,
      remaining_uses: 0,
      reset_at: resetAt,
    };
  }

  const rpcArgs = {
    p_user_id: userId,
    p_feature_key: featureKey,
    p_idempotency_key: idempotencyKey,
    p_month_start: startIso,
    p_month_end: endIso,
    p_limit: featureLimit,
    p_metadata: metadata || {},
  };

  const { data, error } = await supabaseAdmin.rpc("consume_free_monthly_credit", rpcArgs);
  let result;

  if (error && isMissingFreeUsageRpc(error)) {
    throw new Error("Credit schema incomplete: apply the universal_paid_credits migration.");
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
    limit: featureLimit,
    used_count: Number(result?.used_count) || 0,
    remaining_uses: Math.max(Number(result?.remaining_uses) || 0, 0),
    reset_at: resetAt,
  };
}
