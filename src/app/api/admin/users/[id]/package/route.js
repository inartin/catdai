import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PAYMENT_FEATURE_KEYS, getPaymentProducts } from "@/lib/payment-products";
import {
  FREE_MONTHLY_FEATURE_KEYS,
  getFreeMonthlyFeatureLimit,
  getFreeMonthlyFeatureUsageWindow,
} from "@/lib/free-monthly-feature-usage";

const PACKAGE_PRODUCT_KEYS = new Set(["free", "standard_pack", "pro_pack", "extra_pack"]);

function normalizePackageKey(value) {
  const key = String(value || "").trim();
  return PACKAGE_PRODUCT_KEYS.has(key) ? key : null;
}

function packageGrants(packageKey) {
  if (packageKey === "free") {
    return Object.fromEntries(PAYMENT_FEATURE_KEYS.map((featureKey) => [featureKey, 0]));
  }

  const product = getPaymentProducts()[packageKey];
  return product?.grants || null;
}

async function resetUserCredits({ userId, grants }) {
  const { error } = await supabaseAdmin.rpc("override_payment_credits", {
    p_user_id: userId, p_grants: grants, p_clear: PAYMENT_FEATURE_KEYS.every(key => !grants[key]), p_preserve_used: false,
  });
  if (error) throw error;

  const { startIso, endIso } = getFreeMonthlyFeatureUsageWindow();
  const { error: freeUsageError } = await supabaseAdmin
    .from("user_feature_usage_events")
    .delete()
    .eq("user_id", userId)
    .eq("source", "free_monthly")
    .in("feature_key", FREE_MONTHLY_FEATURE_KEYS)
    .gte("created_at", startIso)
    .lt("created_at", endIso);
  if (freeUsageError) throw freeUsageError;
}

export async function PATCH(request, context) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const packageKey = normalizePackageKey(body?.packageKey);

    if (!id) {
      return NextResponse.json({ error: "Missing user id" }, { status: 400 });
    }

    if (!packageKey) {
      return NextResponse.json({ error: "Invalid package" }, { status: 400 });
    }

    const grants = packageGrants(packageKey);
    if (!grants) {
      return NextResponse.json({ error: "Invalid package grants" }, { status: 400 });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(id);
    if (userError || !userData?.user?.id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await resetUserCredits({ userId: id, grants });

    const appMetadata = {
      ...(userData.user.app_metadata || {}),
      catdai_admin_package_key: packageKey,
      catdai_admin_package_updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      app_metadata: appMetadata,
    });

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      packageKey,
      credits: rowsForResponse(grants),
      freeMonthlyCredits: FREE_MONTHLY_FEATURE_KEYS.map((featureKey) => {
        const limit = getFreeMonthlyFeatureLimit(featureKey);
        return {
          featureKey,
          remainingUses: limit,
          totalGranted: limit,
          totalUsed: 0,
          source: "free_monthly",
          eligible: limit > 0,
        };
      }),
    });
  } catch (error) {
    console.error("[admin-user-package] update failed:", error);
    return NextResponse.json({ error: "Failed to update user package" }, { status: 500 });
  }
}

function rowsForResponse(grants) {
  if (PAYMENT_FEATURE_KEYS.every((featureKey) => Math.max(Number(grants[featureKey]) || 0, 0) === 0)) {
    return [];
  }

  return PAYMENT_FEATURE_KEYS.map((featureKey) => {
    const uses = Math.max(Number(grants[featureKey]) || 0, 0);
    return {
      featureKey,
      remainingUses: uses,
      totalGranted: uses,
      totalUsed: 0,
    };
  });
}
