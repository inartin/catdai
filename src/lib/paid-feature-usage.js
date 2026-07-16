import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  checkFreeMonthlyFeatureUsage,
  consumeFreeMonthlyFeatureUsage,
  makeMonthlyFeatureUsageKey,
} from "@/lib/free-monthly-feature-usage";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { getFeaturePurchaseOffer, isKnownPaymentFeature } from "@/lib/payment-products";

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  const json = JSON.stringify(value);
  return json === undefined ? "null" : json;
}

export function makePaidFeatureUsageKey(featureKey, payload) {
  const normalizedFeatureKey = String(featureKey || "").trim();
  const hash = crypto
    .createHash("sha256")
    .update(stableStringify(payload || {}))
    .digest("hex")
    .slice(0, 32);

  return `paid:${normalizedFeatureKey}:${hash}`;
}

export function buildFeatureCreditRequiredPayload(featureKey, reason = "no_credit") {
  return {
    error: reason === "unauthorized" ? "unauthorized" : "feature_credit_required",
    reason,
    feature_key: featureKey,
    purchase: getFeaturePurchaseOffer(featureKey),
  };
}

function isMissingPaidUsageRpc(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "42883" || code === "PGRST202" || message.includes("consume_user_feature_credit");
}

async function consumePaidFeatureCreditFallback({ userId, featureKey, idempotencyKey, metadata }) {
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
      usage_event_id: existing.id,
      source: existing.source,
      remaining_uses: null,
      reason: "already_consumed",
    };
  }

  const { data: credit, error: creditError } = await supabaseAdmin
    .from("user_feature_credits")
    .select("remaining_uses, total_used")
    .eq("user_id", userId)
    .eq("feature_key", featureKey)
    .gt("remaining_uses", 0)
    .maybeSingle();

  if (creditError) throw creditError;
  if (!credit?.remaining_uses) {
    return {
      allowed: false,
      usage_event_id: null,
      source: null,
      remaining_uses: 0,
      reason: "no_credit",
    };
  }

  const nextRemaining = Math.max(Number(credit.remaining_uses) - 1, 0);
  const { error: updateError } = await supabaseAdmin
    .from("user_feature_credits")
    .update({
      remaining_uses: nextRemaining,
      total_used: Math.max(Number(credit.total_used) || 0, 0) + 1,
    })
    .eq("user_id", userId)
    .eq("feature_key", featureKey);

  if (updateError) throw updateError;

  const { data: usage, error: usageError } = await supabaseAdmin
    .from("user_feature_usage_events")
    .insert({
      user_id: userId,
      feature_key: featureKey,
      source: "paid_credit",
      idempotency_key: idempotencyKey,
      metadata: metadata || {},
    })
    .select("id")
    .single();

  if (usageError) throw usageError;

  return {
    allowed: true,
    usage_event_id: usage?.id || null,
    source: "paid_credit",
    remaining_uses: nextRemaining,
    reason: "consumed",
  };
}

export async function getPaidFeatureUsageEvent({ userId, featureKey, idempotencyKey }) {
  if (!userId || !featureKey || !idempotencyKey || !shouldPersistRuntimeData()) return null;

  const { data, error } = await supabaseAdmin
    .from("user_feature_usage_events")
    .select("id, source")
    .eq("user_id", userId)
    .eq("feature_key", featureKey)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function getUserFeatureCreditBalance({ userId, featureKey }) {
  if (!userId || !featureKey || !shouldPersistRuntimeData()) {
    return {
      remaining_uses: 0,
      total_granted: 0,
      total_used: 0,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("user_feature_credits")
    .select("remaining_uses, total_granted, total_used")
    .eq("user_id", userId)
    .eq("feature_key", featureKey)
    .maybeSingle();

  if (error) throw error;

  return {
    remaining_uses: Math.max(Number(data?.remaining_uses) || 0, 0),
    total_granted: Math.max(Number(data?.total_granted) || 0, 0),
    total_used: Math.max(Number(data?.total_used) || 0, 0),
  };
}

export async function checkPaidFeatureAccess({ userId, featureKey, idempotencyKey }) {
  if (!userId) {
    return {
      allowed: false,
      reason: "unauthorized",
      remaining_uses: 0,
    };
  }

  if (!isKnownPaymentFeature(featureKey)) {
    return {
      allowed: false,
      reason: "unknown_feature",
      remaining_uses: 0,
    };
  }

  const existing = await getPaidFeatureUsageEvent({ userId, featureKey, idempotencyKey });
  if (existing) {
    return {
      allowed: true,
      reason: "already_consumed",
      source: existing.source,
      usage_event_id: existing.id,
      remaining_uses: null,
    };
  }

  const balance = await getUserFeatureCreditBalance({ userId, featureKey });
  if (balance.remaining_uses <= 0) {
    return {
      allowed: false,
      reason: "no_credit",
      remaining_uses: 0,
    };
  }

  return {
    allowed: true,
    reason: "has_credit",
    remaining_uses: balance.remaining_uses,
  };
}

export async function checkFeatureAccess({ userId, featureKey, idempotencyKey }) {
  const paidAccess = await checkPaidFeatureAccess({ userId, featureKey, idempotencyKey });
  if (paidAccess.allowed || paidAccess.reason !== "no_credit") return paidAccess;

  const balance = await getUserFeatureCreditBalance({ userId, featureKey });
  if (balance.total_granted > 0) return paidAccess;

  const freeAccess = await checkFreeMonthlyFeatureUsage({
    userId,
    featureKey,
    idempotencyKey: makeMonthlyFeatureUsageKey(featureKey, { idempotencyKey }),
  });
  return freeAccess.reason === "free_monthly_limit_reached"
    ? { ...freeAccess, reason: "no_credit" }
    : freeAccess;
}

export async function consumePaidFeatureCredit({
  userId,
  featureKey,
  idempotencyKey,
  metadata = {},
}) {
  if (!userId) {
    return {
      allowed: false,
      reason: "unauthorized",
      remaining_uses: 0,
    };
  }

  if (!shouldPersistRuntimeData()) {
    return {
      allowed: false,
      reason: "runtime_persistence_disabled",
      remaining_uses: 0,
    };
  }

  const rpcArgs = {
    p_user_id: userId,
    p_feature_key: featureKey,
    p_idempotency_key: idempotencyKey,
    p_metadata: metadata || {},
  };

  const { data, error } = await supabaseAdmin.rpc("consume_user_feature_credit", rpcArgs);
  let result;

  if (error && isMissingPaidUsageRpc(error)) {
    result = await consumePaidFeatureCreditFallback({
      userId,
      featureKey,
      idempotencyKey,
      metadata,
    });
  } else if (error) {
    throw error;
  } else {
    result = Array.isArray(data) ? data[0] : data;
  }

  return {
    allowed: result?.allowed === true,
    usage_event_id: result?.usage_event_id || null,
    source: result?.source || null,
    reason: result?.reason || null,
    remaining_uses: result?.remaining_uses == null
      ? null
      : Math.max(Number(result.remaining_uses) || 0, 0),
  };
}

export async function consumeFeatureCredit({
  userId,
  featureKey,
  idempotencyKey,
  metadata = {},
}) {
  const paidUsage = await consumePaidFeatureCredit({
    userId,
    featureKey,
    idempotencyKey,
    metadata,
  });
  if (paidUsage.allowed || !["no_credit", "runtime_persistence_disabled"].includes(paidUsage.reason)) {
    return paidUsage;
  }

  const balance = await getUserFeatureCreditBalance({ userId, featureKey });
  if (balance.total_granted > 0) return paidUsage;

  const freeUsage = await consumeFreeMonthlyFeatureUsage({
    userId,
    featureKey,
    idempotencyKey: makeMonthlyFeatureUsageKey(featureKey, { idempotencyKey }),
    metadata,
  });
  return freeUsage.reason === "free_monthly_limit_reached"
    ? { ...freeUsage, reason: "no_credit" }
    : freeUsage;
}
