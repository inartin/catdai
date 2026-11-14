import { resolveAccessTier } from "@/lib/access-tier";
import { checkFeatureAccess, consumeFeatureCredit, makePaidFeatureUsageKey } from "@/lib/paid-feature-usage";
import { getFeaturePurchaseOffer } from "@/lib/payment-products";

const LISTING_ANALYSIS_FEATURE_KEY = "listing_analysis";

export async function precheckListingAnalysisAccess(request, body) {
  const externalId = String(body?.listing_analysis?.external_id || "").trim();
  if (!externalId) return null;

  const access = await resolveAccessTier(request);
  const idempotencyKey = makePaidFeatureUsageKey(LISTING_ANALYSIS_FEATURE_KEY, { external_id: externalId });
  const check = await checkFeatureAccess({
    userId: access.user_id,
    featureKey: LISTING_ANALYSIS_FEATURE_KEY,
    idempotencyKey,
  });

  return { access, idempotencyKey, check };
}

export async function resolveListingAnalysisPayload(data, listingAccess, body, params, buildPreview) {
  const { access, check, idempotencyKey } = listingAccess;
  const usage = check?.allowed ? await consumeFeatureCredit({
    userId: access.user_id,
    featureKey: LISTING_ANALYSIS_FEATURE_KEY,
    idempotencyKey,
    metadata: {
      feature: LISTING_ANALYSIS_FEATURE_KEY,
      listing_analysis: body.listing_analysis,
      params,
      evaluation_group_id: body.evaluation_group_id || null,
      log_id: body.log_id || null,
      language: body.language || null,
    },
  }) : null;

  if (!usage?.allowed) {
    const preview = buildPreview(data);
    return {
      ...preview,
      access_tier: access.tier || "free",
      full_access: false,
      access_limit: {
        reason: usage?.reason || check?.reason || "no_credit",
        feature_key: LISTING_ANALYSIS_FEATURE_KEY,
        purchase: getFeaturePurchaseOffer(LISTING_ANALYSIS_FEATURE_KEY),
      },
      locked_sections: {
        ...preview.locked_sections,
        listing_price_history: true,
        listing_duplicates: true,
      },
    };
  }

  return {
    ...data,
    access_tier: access.tier,
    full_access: true,
    access_source: usage.source || check?.source || "paid_credit",
    review_usage_id: usage.source === "paid_credit" ? usage.usage_event_id : null,
    paid_credit_usage: { remaining: usage.remaining_uses },
    locked_sections: {},
  };
}
