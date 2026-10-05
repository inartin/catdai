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
    const grants = Object.fromEntries(PAYMENT_FEATURE_KEYS.map(key => [key, amount]));
    for (const userId of userIds) {
      const { error } = await supabaseAdmin.rpc("override_payment_credits", {
        p_user_id: userId, p_grants: grants, p_preserve_used: true, p_clear: false,
      });
      if (error) throw error;
    }

    return NextResponse.json({
      ok: true,
      amount,
      usersUpdated: userIds.length,
      rowsUpdated: userIds.length * PAYMENT_FEATURE_KEYS.length,
    });
  } catch (error) {
    console.error("[admin-free-credits] update failed:", error);
    return NextResponse.json({ error: "Failed to update free credits" }, { status: 500 });
  }
}
