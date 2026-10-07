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
    .from("user_feature_credit_balances")
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
  if (paidAccess.reason === "already_consumed" || (!paidAccess.allowed && paidAccess.reason !== "no_credit")) {
    return paidAccess;
  }

  const freeAccess = await checkFreeMonthlyFeatureUsage({
    userId,
    featureKey,
    idempotencyKey: makeMonthlyFeatureUsageKey(featureKey, { idempotencyKey }),
  });
  if (freeAccess.allowed || freeAccess.reason !== "free_monthly_limit_reached") return freeAccess;
  return paidAccess.allowed ? paidAccess : { ...freeAccess, reason: "no_credit" };
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
    throw new Error("Payment credit schema incomplete: apply db/maib_payments.sql.");
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
  if (!userId) return { allowed: false, reason: "unauthorized", remaining_uses: 0 };
  if (!isKnownPaymentFeature(featureKey)) return { allowed: false, reason: "unknown_feature", remaining_uses: 0 };

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

  const freeUsage = await consumeFreeMonthlyFeatureUsage({
    userId,
    featureKey,
    idempotencyKey: makeMonthlyFeatureUsageKey(featureKey, { idempotencyKey }),
    metadata,
  });
  if (freeUsage.allowed || freeUsage.reason !== "free_monthly_limit_reached") return freeUsage;

  const paidUsage = await consumePaidFeatureCredit({
    userId,
    featureKey,
    idempotencyKey,
    metadata,
  });
  return ["no_credit", "runtime_persistence_disabled"].includes(paidUsage.reason)
    ? { ...paidUsage, reason: "no_credit" }
    : paidUsage;
}
