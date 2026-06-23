import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function getBearerToken(request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

async function getRequestUser(request) {
  const token = getBearerToken(request);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user;
}

export async function GET(request) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const orderId = String(searchParams.get("order_id") || "").trim();
  const transactionId = String(searchParams.get("transaction_id") || "").trim();

  if (!orderId && !transactionId) {
    return NextResponse.json({ error: "order_id or transaction_id is required." }, { status: 400 });
  }

  let query = supabaseAdmin
    .from("paddle_payment_orders")
    .select("id, user_id, product_key, status, paddle_transaction_id, paddle_subscription_id, paddle_checkout_url, amount_minor, currency_code, paid_at")
    .eq("user_id", user.id)
    .limit(1);

  query = orderId ? query.eq("id", orderId) : query.eq("paddle_transaction_id", transactionId);

  const { data, error } = await query.maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message || "Failed to read Paddle payment order." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Paddle payment order not found." }, { status: 404 });
  }

  return NextResponse.json({
    order_id: data.id,
    product_key: data.product_key,
    status: data.status,
    paddle_transaction_id: data.paddle_transaction_id,
    paddle_subscription_id: data.paddle_subscription_id,
    checkout_url: data.paddle_checkout_url,
    amount_minor: data.amount_minor,
    currency_code: data.currency_code,
    paid_at: data.paid_at,
  });
}
