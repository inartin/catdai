import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { adminPeriod } from "@/lib/admin-periods";
import { CONFIRMED_PAYMENT_STATUSES } from "@/lib/admin-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request) {
  const token = process.env.PAYMENTS_STATS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Payment statistics are unavailable" }, { status: 503, headers });
  }

  const supplied = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  const actual = Buffer.from(supplied || "");
  const expected = Buffer.from(token);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, {
      status: 401, headers: { ...headers, "WWW-Authenticate": "Bearer" },
    });
  }

  try {
    const now = new Date();
    const { since } = adminPeriod("day", now);
    const adminIds = [];
    for (let page = 1; ; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data?.users) throw new Error("Failed to read payment buyers");
      for (const user of data.users) {
        if (user.app_metadata?.catdai_is_admin === true) adminIds.push(user.id);
      }
      if (data.users.length < 1000) break;
    }

    let query = supabaseAdmin.from("reporting_payment_orders")
      .select("*", { count: "exact", head: true })
      .in("status", CONFIRMED_PAYMENT_STATUSES)
      .gte("paid_at", since).lte("paid_at", now.toISOString());
    if (adminIds.length) {
      // Keep historical payments whose buyer account has been deleted.
      query = query.or(`user_id.is.null,user_id.not.in.(${adminIds.join(",")})`);
    }
    const { count, error } = await query;
    if (error || !Number.isSafeInteger(count) || count < 0) throw new Error("Failed to count payments");
    return NextResponse.json({ value: count }, { headers });
  } catch (error) {
    console.error("[payments-today]", error.message);
    return NextResponse.json({ error: "Payment statistics are unavailable" }, { status: 503, headers });
  }
}
