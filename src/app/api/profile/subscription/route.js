import { NextResponse } from "next/server";
import { resolveAccessTier } from "@/lib/access-tier";
import { cancelPaddleSubscription } from "@/lib/paddle";
import { createSystemNotification, normalizeSystemNotificationLang } from "@/lib/system-notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || code === "PGRST204" || code === "PGRST205";
}

function normalizeSubscription(row) {
  if (!row) return null;

  return {
    id: row.paddle_subscription_id,
    productKey: row.product_key,
    status: row.status,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
  };
}

async function findExtraSubscription(userId) {
  const { data, error } = await supabaseAdmin
    .from("paddle_subscriptions")
    .select("paddle_subscription_id, user_id, product_key, status, current_period_start, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .eq("product_key", "extra_pack")
    .in("status", ["active", "trialing"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }

  return data || null;
}

export async function GET(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ subscription: null });
  }

  try {
    const subscription = await findExtraSubscription(access.user_id);
    return NextResponse.json({ subscription: normalizeSubscription(subscription) });
  } catch (error) {
    console.error("[profile-subscription] load failed:", error.message);
    return NextResponse.json({ subscription: null });
  }
}

export async function POST(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    let body = {};
    try {
      body = await request.json();
    } catch {}
    const lang = normalizeSystemNotificationLang(body?.lang);
    const subscription = await findExtraSubscription(access.user_id);
    if (!subscription?.paddle_subscription_id) {
      return NextResponse.json({ error: "Extra subscription not found." }, { status: 404 });
    }

    if (subscription.cancel_at_period_end === true) {
      return NextResponse.json({ subscription: normalizeSubscription(subscription) });
    }

    const paddleSubscription = await cancelPaddleSubscription(subscription.paddle_subscription_id, "next_billing_period");
    const scheduledChange = paddleSubscription?.scheduled_change || null;
    const currentBillingPeriod = paddleSubscription?.current_billing_period || {};
    const cancelAtPeriodEnd = scheduledChange?.action === "cancel";

    const { data, error } = await supabaseAdmin
      .from("paddle_subscriptions")
      .update({
        status: paddleSubscription.status || subscription.status,
        current_period_start: currentBillingPeriod.starts_at || subscription.current_period_start,
        current_period_end: currentBillingPeriod.ends_at || subscription.current_period_end,
        cancel_at_period_end: cancelAtPeriodEnd,
      })
      .eq("paddle_subscription_id", subscription.paddle_subscription_id)
      .eq("user_id", access.user_id)
      .select("paddle_subscription_id, user_id, product_key, status, current_period_start, current_period_end, cancel_at_period_end")
      .single();

    if (error) throw error;

    await createSystemNotification({
      userId: access.user_id,
      type: "extra_subscription_cancel_scheduled",
      lang,
      periodEnd: data?.current_period_end,
    });

    return NextResponse.json({ subscription: normalizeSubscription(data) });
  } catch (error) {
    console.error("[profile-subscription] cancel failed:", error.message);
    return NextResponse.json({ error: "Failed to cancel subscription." }, { status: 500 });
  }
}
