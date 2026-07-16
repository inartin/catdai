import { NextResponse } from "next/server";
import { resolveAccessTier } from "@/lib/access-tier";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PACKAGE_KEYS = new Set(["free", "standard_pack", "pro_pack", "extra_pack"]);

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || code === "PGRST204" || code === "PGRST205";
}

export async function GET(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ packageKey: null }, { status: 401 });
  }

  try {
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(access.user_id);
    if (userError) throw userError;

    const adminPackageKey = String(userData?.user?.app_metadata?.catdai_admin_package_key || "");

    const subscriptionResult = await supabaseAdmin
      .from("paddle_subscriptions")
      .select("product_key")
      .eq("user_id", access.user_id)
      .eq("product_key", "extra_pack")
      .in("status", ["active", "trialing"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionResult.error && !isMissingSchemaError(subscriptionResult.error)) {
      throw subscriptionResult.error;
    }
    if (subscriptionResult.data?.product_key === "extra_pack") {
      return NextResponse.json({ packageKey: "extra_pack" });
    }

    if (adminPackageKey && adminPackageKey !== "free" && PACKAGE_KEYS.has(adminPackageKey)) {
      return NextResponse.json({ packageKey: adminPackageKey });
    }

    const orderResult = await supabaseAdmin
      .from("paddle_payment_orders")
      .select("product_key")
      .eq("user_id", access.user_id)
      .eq("status", "paid")
      .in("product_key", ["standard_pack", "pro_pack", "extra_pack"])
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderResult.error && !isMissingSchemaError(orderResult.error)) {
      throw orderResult.error;
    }

    const paidPackageKey = orderResult.data?.product_key;
    return NextResponse.json({
      packageKey: PACKAGE_KEYS.has(paidPackageKey) ? paidPackageKey : "free",
    });
  } catch (error) {
    console.error("[profile-package] load failed:", error?.message || String(error));
    return NextResponse.json({ packageKey: null }, { status: 500 });
  }
}
