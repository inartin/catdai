import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PAGE = 1000;
const PADDLE_ORDER_COLUMNS = "id, product_key, status, paddle_transaction_id, paddle_subscription_id, amount_minor, currency_code, paid_at, created_at";

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || code === "PGRST204";
}

function normalizePaddleOrder(row) {
  return {
    id: row.id,
    provider: "paddle",
    productKey: row.product_key,
    status: row.status,
    transactionId: row.paddle_transaction_id,
    subscriptionId: row.paddle_subscription_id,
    amountMinor: row.amount_minor,
    currencyCode: row.currency_code,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

async function fetchAllTransactions(userId) {
  let rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("paddle_payment_orders")
      .select(PADDLE_ORDER_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      if (isMissingSchemaError(error)) return [];
      throw error;
    }

    if (!data || data.length === 0) break;
    rows = rows.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return rows;
}

export async function GET(request, context) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ transactions: [], error: "Missing user id" }, { status: 400 });
    }

    const transactions = await fetchAllTransactions(id);
    return NextResponse.json({
      transactions: transactions.map(normalizePaddleOrder),
    });
  } catch (error) {
    console.error("[admin-user-transactions] failed:", error);
    return NextResponse.json({ transactions: [], error: "Failed to load transactions" }, { status: 500 });
  }
}
