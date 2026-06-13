import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PAYMENT_FEATURE_KEYS, getPaymentProducts } from "@/lib/payment-products";

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
  const rows = PAYMENT_FEATURE_KEYS.map((featureKey) => {
    const uses = Math.max(Number(grants[featureKey]) || 0, 0);
    return {
      user_id: userId,
      feature_key: featureKey,
      remaining_uses: uses,
      total_granted: uses,
      total_used: 0,
    };
  });

  const { error } = await supabaseAdmin
    .from("user_feature_credits")
    .upsert(rows, { onConflict: "user_id,feature_key" });

  if (error) throw error;
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
    });
  } catch (error) {
    console.error("[admin-user-package] update failed:", error);
    return NextResponse.json({ error: "Failed to update user package" }, { status: 500 });
  }
}

function rowsForResponse(grants) {
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
