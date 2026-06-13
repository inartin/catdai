import { supabaseAdmin } from "@/lib/supabase-admin";

export const PAID_EVALUATION_FEATURE_KEYS = ["sale_estimate", "rent_estimate"];

export function isPaidEvaluationFeatureKey(featureKey) {
  return PAID_EVALUATION_FEATURE_KEYS.includes(String(featureKey || ""));
}

export function getSnapshotEstimateType(featureKey) {
  return String(featureKey || "") === "rent_estimate" ? "rent" : "sale";
}

function stripRuntimeFields(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const { snapshot, ...rest } = payload;
  return rest;
}

export function normalizePaidEvaluationSnapshot(row) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const snapshot = metadata.evaluation_snapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  if (!isPaidEvaluationFeatureKey(row?.feature_key || snapshot.feature_key)) return null;

  const result = snapshot.result && typeof snapshot.result === "object" ? snapshot.result : null;
  if (!result?.estimate || !result?.input) return null;

  const featureKey = row?.feature_key || snapshot.feature_key;
  const createdAt = row?.created_at || snapshot.created_at || null;

  return {
    id: row?.id,
    featureKey,
    estimateType: snapshot.estimate_type || getSnapshotEstimateType(featureKey),
    createdAt,
    params: snapshot.params || null,
    result: {
      ...result,
      full_access: true,
      locked_sections: {},
      snapshot: {
        id: row?.id,
        created_at: createdAt,
        immutable: true,
      },
    },
  };
}

export async function persistPaidEvaluationSnapshot({
  usageEventId,
  userId,
  featureKey,
  estimateType,
  params,
  result,
}) {
  if (!usageEventId || !userId || !isPaidEvaluationFeatureKey(featureKey)) return;
  if (!result?.estimate || !result?.input) return;

  const { data, error } = await supabaseAdmin
    .from("user_feature_usage_events")
    .select("metadata")
    .eq("id", usageEventId)
    .eq("user_id", userId)
    .eq("source", "paid_credit")
    .maybeSingle();

  if (error || !data) {
    throw error || new Error("Paid usage event not found");
  }

  const metadata = data.metadata && typeof data.metadata === "object" ? data.metadata : {};
  if (metadata.evaluation_snapshot) return;

  const nextMetadata = {
    ...metadata,
    evaluation_snapshot: {
      version: 1,
      feature_key: featureKey,
      estimate_type: estimateType || getSnapshotEstimateType(featureKey),
      created_at: new Date().toISOString(),
      params: params || null,
      result: stripRuntimeFields(result),
    },
  };

  const { error: updateError } = await supabaseAdmin
    .from("user_feature_usage_events")
    .update({ metadata: nextMetadata })
    .eq("id", usageEventId)
    .eq("user_id", userId)
    .eq("source", "paid_credit");

  if (updateError) throw updateError;
}
