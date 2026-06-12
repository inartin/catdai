import { resolveAccessTier } from "@/lib/access-tier";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

const OPEN_STATUSES = ["pending", "registered"];

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

export async function POST(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const orderId = String(body?.order_id || "").trim();
  const transactionId = String(body?.transaction_id || "").trim();

  if (!isUuid(orderId) && !transactionId) {
    return NextResponse.json({ error: "order_id or transaction_id is required." }, { status: 400 });
  }

  let query = supabaseAdmin
    .from("paddle_payment_orders")
    .select("id, user_id, status, paddle_transaction_id, response_payload")
    .eq("user_id", access.user_id);

  query = isUuid(orderId) ? query.eq("id", orderId) : query.eq("paddle_transaction_id", transactionId);

  const { data: order, error: orderError } = await query.maybeSingle();
  if (orderError) {
    return NextResponse.json({ error: orderError.message || "Failed to read Paddle payment order." }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Paddle payment order not found." }, { status: 404 });
  }

  if (transactionId && order.paddle_transaction_id && order.paddle_transaction_id !== transactionId) {
    return NextResponse.json({ error: "Paddle transaction id mismatch." }, { status: 400 });
  }

  if (!OPEN_STATUSES.includes(order.status)) {
    return NextResponse.json({ status: order.status });
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("paddle_payment_orders")
    .update({
      status: "checkout_closed",
      response_payload: {
        ...(order.response_payload && typeof order.response_payload === "object" ? order.response_payload : {}),
        checkout_closed: {
          transaction_id: transactionId || order.paddle_transaction_id || null,
          closed_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", order.id)
    .in("status", OPEN_STATUSES)
    .select("status")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message || "Failed to update Paddle payment order." }, { status: 500 });
  }

  return NextResponse.json({ status: updated?.status || "checkout_closed" });
}
