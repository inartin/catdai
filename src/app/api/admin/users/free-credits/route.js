import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PAYMENT_FEATURE_KEYS } from "@/lib/payment-products";

const PAGE = 1000;
const MAX_CREDITS = 1000;

async function listAllUsers() {
  let users = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw error;

    const chunk = data?.users || [];
    users = users.concat(chunk);
    if (chunk.length < PAGE) break;
    page += 1;
  }

  return users;
}

async function fetchCreditRows(userIds) {
  if (!userIds.length) return [];

  let rows = [];
  for (let i = 0; i < userIds.length; i += PAGE) {
    const ids = userIds.slice(i, i + PAGE);
    const { data, error } = await supabaseAdmin
      .from("user_feature_credits")
      .select("user_id, feature_key, remaining_uses, total_granted, total_used")
      .in("user_id", ids);

    if (error) throw error;
    rows = rows.concat(data || []);
  }

  return rows;
}

async function upsertRows(rows) {
  for (let i = 0; i < rows.length; i += PAGE) {
    const chunk = rows.slice(i, i + PAGE);
    const { error } = await supabaseAdmin
      .from("user_feature_credits")
      .upsert(chunk, { onConflict: "user_id,feature_key" });

    if (error) throw error;
  }
}

function parseAmount(value) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_CREDITS) return null;
  return amount;
}

export async function POST(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json().catch(() => ({}));
    const amount = parseAmount(body?.amount);

    if (amount == null) {
      return NextResponse.json({ error: `Amount must be an integer from 0 to ${MAX_CREDITS}.` }, { status: 400 });
    }

    const users = await listAllUsers();
    const userIds = users.map((user) => user.id).filter(Boolean);
    const existingRows = await fetchCreditRows(userIds);
    const existingByKey = new Map(
      existingRows.map((row) => [`${row.user_id}:${row.feature_key}`, row])
    );

    const rows = userIds.flatMap((userId) =>
      PAYMENT_FEATURE_KEYS.map((featureKey) => {
        const current = existingByKey.get(`${userId}:${featureKey}`) || {};
        const totalUsed = Math.max(Number(current.total_used) || 0, 0);

        return {
          user_id: userId,
          feature_key: featureKey,
          remaining_uses: amount,
          total_granted: totalUsed + amount,
          total_used: totalUsed,
        };
      })
    );

    await upsertRows(rows);

    return NextResponse.json({
      ok: true,
      amount,
      usersUpdated: userIds.length,
      rowsUpdated: rows.length,
    });
  } catch (error) {
    console.error("[admin-free-credits] update failed:", error);
    return NextResponse.json({ error: "Failed to update free credits" }, { status: 500 });
  }
}
