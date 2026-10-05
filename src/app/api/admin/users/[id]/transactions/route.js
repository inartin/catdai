import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ORDER_COLUMNS, normalizePaymentOrder, applyPaymentCursor } from "@/lib/payment-history";
const PAGE = 1000;
async function fetchAllTransactions(userId) {
  let rows = [];
  let cursor = null;

  while (true) {
    const { data, error } = await applyPaymentCursor(supabaseAdmin
      .from("payment_orders_all")
      .select(ORDER_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).order("provider", { ascending: false })
      .limit(PAGE), cursor);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) break;
    rows = rows.concat(data);
    if (data.length < PAGE) break;
    const last = data.at(-1);
    cursor = { at: last.created_at, id: last.id, provider: last.provider };
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
      transactions: transactions.map(normalizePaymentOrder),
    });
  } catch (error) {
    console.error("[admin-user-transactions] failed:", error);
    return NextResponse.json({ transactions: [], error: "Failed to load transactions" }, { status: 500 });
  }
}
