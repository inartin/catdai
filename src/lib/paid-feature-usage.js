import { supabaseAdmin } from "@/lib/supabase-admin";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";

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
