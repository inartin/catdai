import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const json = (body, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});

export async function GET(request, { params }) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) return json({ error: "Invalid review." }, 400);

  try {
    const { data: review, error: reviewError } = await supabaseAdmin.from("result_reviews")
      .select("usage_event_id").eq("id", id).eq("status", "submitted").eq("feature_key", "cadastru_lookup").maybeSingle();
    if (reviewError) throw reviewError;
    if (!review) return json({ error: "Cadastru review not found." }, 404);

    const result = { purchase: null, search: null, snapshot: null, unavailable_reason: "No saved checkout report is linked to this review." };
    if (!review.usage_event_id) return json(result);
    const { data: usage, error: usageError } = await supabaseAdmin.from("user_feature_usage_events")
      .select("idempotency_key, metadata, created_at").eq("id", review.usage_event_id)
      .eq("feature_key", "cadastru_lookup").eq("source", "paid_credit").maybeSingle();
    if (usageError) throw usageError;
    if (!usage) return json(result);
    result.search = {
      search_type: usage.metadata?.search_type || null,
      search_label: usage.metadata?.raw_address || usage.metadata?.cadastral_number || null,
      unlocked_at: usage.created_at,
    };
    const orderId = usage.metadata?.maib_order_id;
    if (!orderId) return json(result);
    const { data: order, error: orderError } = await supabaseAdmin.from("maib_payment_orders")
      .select("id, product_key, product_title, amount_minor, currency_code, refunded_minor, status, environment, language, receipt_email, paid_at, created_at, cadastru_delivery")
      .eq("id", orderId).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json(result);
    const { cadastru_delivery: delivery, ...purchase } = order;
    result.purchase = purchase;

    // Credits can fund another property. Never present that order's original
    // report as the result being reviewed, even when the buyer is the same.
    if (order.product_key !== "cadastru_lookup_single" || !order.paid_at || !delivery?.payload
      || delivery.usage_key !== usage.idempotency_key || typeof delivery.payload !== "object" || Array.isArray(delivery.payload)) {
      return json(result);
    }
    const snapshot = { ...delivery.payload };
    for (const key of ["cadastru_evaluation_token", "review_usage_id", "access_tier", "access_limit", "locked_sections"]) delete snapshot[key];
    result.snapshot = snapshot;
    result.search = { ...result.search, search_type: delivery.search_type, search_label: delivery.search_label };
    result.unavailable_reason = null;
    return json(result);
  } catch (error) {
    console.error("[admin-feedback] cadastru report failed:", error.message);
    return json({ error: "Failed to load the saved Cadastru report." }, 500);
  }
}
