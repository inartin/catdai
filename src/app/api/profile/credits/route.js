import { NextResponse } from "next/server";
import { resolveAccessTier } from "@/lib/access-tier";
import {
  FREE_MONTHLY_FULL_EVALUATION_FEATURE_KEYS,
  FREE_MONTHLY_FULL_EVALUATION_LIMIT,
  getFreeMonthlyFeatureUsageWindow,
} from "@/lib/free-monthly-feature-usage";
import { PAYMENT_FEATURE_KEYS } from "@/lib/payment-products";
import { supabaseAdmin } from "@/lib/supabase-admin";

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || code === "PGRST204";
}

function normalizeCreditRows(rows) {
  const byFeature = new Map((rows || []).map((row) => [row.feature_key, row]));

  return PAYMENT_FEATURE_KEYS.map((featureKey) => {
    const row = byFeature.get(featureKey) || {};
    return {
      featureKey,
      remainingUses: Math.max(Number(row.remaining_uses) || 0, 0),
      totalGranted: Math.max(Number(row.total_granted) || 0, 0),
      totalUsed: Math.max(Number(row.total_used) || 0, 0),
    };
  });
}

function normalizeFreeMonthlyRows({ usageRows = [], paidCreditRows = [] } = {}) {
  const usedByFeature = new Map();
  const paidCreditsByFeature = new Map((paidCreditRows || []).map((row) => [row.feature_key, row]));

  for (const row of usageRows || []) {
    usedByFeature.set(row.feature_key, (usedByFeature.get(row.feature_key) || 0) + 1);
  }

  return FREE_MONTHLY_FULL_EVALUATION_FEATURE_KEYS.map((featureKey) => {
    const paidCreditRow = paidCreditsByFeature.get(featureKey);
    const hasPaidGrant = Number(paidCreditRow?.total_granted) > 0;
    const used = hasPaidGrant ? FREE_MONTHLY_FULL_EVALUATION_LIMIT : usedByFeature.get(featureKey) || 0;
    return {
      featureKey,
      remainingUses: Math.max(FREE_MONTHLY_FULL_EVALUATION_LIMIT - used, 0),
      totalGranted: FREE_MONTHLY_FULL_EVALUATION_LIMIT,
      totalUsed: Math.min(used, FREE_MONTHLY_FULL_EVALUATION_LIMIT),
      source: "free_monthly",
      eligible: !hasPaidGrant,
    };
  });
}

export async function GET(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ credits: [] });
  }

  const { data, error } = await supabaseAdmin
    .from("user_feature_credits")
    .select("feature_key, remaining_uses, total_granted, total_used")
    .eq("user_id", access.user_id);

  if (error) {
    if (isMissingSchemaError(error)) {
      return NextResponse.json({
        credits: normalizeCreditRows([]),
        freeMonthlyCredits: normalizeFreeMonthlyRows(),
      });
    }

    console.error("[profile-credits] credits failed:", error.message);
    return NextResponse.json({
      credits: normalizeCreditRows([]),
      freeMonthlyCredits: normalizeFreeMonthlyRows(),
    });
  }

  const { startIso, endIso } = getFreeMonthlyFeatureUsageWindow();
  const { data: freeUsageData, error: freeUsageError } = await supabaseAdmin
    .from("user_feature_usage_events")
    .select("feature_key")
    .eq("user_id", access.user_id)
    .eq("source", "free_monthly")
    .in("feature_key", FREE_MONTHLY_FULL_EVALUATION_FEATURE_KEYS)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (freeUsageError && !isMissingSchemaError(freeUsageError)) {
    console.error("[profile-credits] free monthly usage failed:", freeUsageError.message);
  }

  return NextResponse.json({
    credits: normalizeCreditRows(data || []),
    freeMonthlyCredits: normalizeFreeMonthlyRows({
      usageRows: freeUsageError ? [] : freeUsageData || [],
      paidCreditRows: data || [],
    }),
  });
}
