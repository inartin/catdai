import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveAccessTier } from "@/lib/access-tier";
import { NextResponse } from "next/server";

const DEFAULT_TRANSACTIONS_LIMIT = 10;
const MAX_TRANSACTIONS_LIMIT = 30;
const PADDLE_ORDER_COLUMNS = "id, product_key, status, paddle_transaction_id, paddle_subscription_id, amount_minor, currency_code, paid_at, created_at";

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || code === "PGRST204";
}

function parseLimit(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return DEFAULT_TRANSACTIONS_LIMIT;
  return Math.min(number, MAX_TRANSACTIONS_LIMIT);
}

function encodeCursor(row) {
  const createdAt = row?.created_at || row?.createdAt;
  if (!createdAt) return null;
  return Buffer.from(JSON.stringify({ createdAt: new Date(createdAt).toISOString() })).toString("base64url");
}

function decodeCursor(value) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const createdAt = new Date(parsed?.createdAt);
    if (Number.isNaN(createdAt.getTime())) return { error: "invalid_cursor" };
    return { createdAt: createdAt.toISOString() };
  } catch {
    return { error: "invalid_cursor" };
  }
}

function applyCursor(query, cursor) {
  if (!cursor) return query;
  return query.lt("created_at", cursor.createdAt);
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

async function fetchPaddleTransactions(userId, cursor, pageSize) {
  const res = await applyCursor(
    supabaseAdmin
      .from("paddle_payment_orders")
      .select(PADDLE_ORDER_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(pageSize + 1),
    cursor
  );

  if (res.error && isMissingSchemaError(res.error)) {
    return { data: [], error: null };
  }

  return res;
}

export async function GET(request) {
  const access = await resolveAccessTier(request);
  if (!access.user_id) {
    return NextResponse.json({ transactions: [], nextCursor: null });
  }

  const { searchParams } = new URL(request.url);
  const pageSize = parseLimit(searchParams.get("limit"));
  const cursor = decodeCursor(searchParams.get("cursor"));

  if (cursor?.error) {
    return NextResponse.json({ error: cursor.error }, { status: 400 });
  }

  const paddleRes = await fetchPaddleTransactions(access.user_id, cursor, pageSize);

  if (paddleRes.error) {
    console.error("[profile-transactions] transactions failed:", paddleRes.error.message);
    return NextResponse.json({ transactions: [], nextCursor: null });
  }

  const rows = (paddleRes.data || []).map(normalizePaddleOrder);
  const visibleRows = rows.slice(0, pageSize);
  const lastVisibleRow = visibleRows[visibleRows.length - 1];

  return NextResponse.json({
    transactions: visibleRows,
    nextCursor: rows.length > pageSize ? encodeCursor(lastVisibleRow) : null,
  });
}
