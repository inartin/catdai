import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSharedCache, setSharedCache } from "@/lib/cache";
import { CONFIRMED_PAYMENT_STATUSES, paymentAmounts, paymentPeriod, summarizePayments } from "@/lib/admin-payments";
import { loadCadastruPaymentFunnel } from "@/lib/admin-cadastru-payment-funnel";

const PAGE_SIZE = 50;
const READ_SIZE = 1000;
const CACHE_TTL_SECONDS = 20 * 60;
const headers = { "Cache-Control": "private, no-store" };

async function readPayments(since, until) {
  const rows = [];
  for (let from = 0; ; from += READ_SIZE) {
    let query = supabaseAdmin.from("reporting_payment_orders")
      .select("id,provider,user_id,product_key,status,amount_minor,currency_code,refunded_minor,paid_at,transaction_id")
      .in("status", CONFIRMED_PAYMENT_STATUSES).not("paid_at", "is", null);
    if (since) query = query.gte("paid_at", since);
    if (until) query = query.lt("paid_at", until);
    const { data, error } = await query.order("paid_at", { ascending: false })
      .order("id", { ascending: false }).order("provider", { ascending: false })
      .range(from, from + READ_SIZE - 1);
    if (error || !data) throw new Error("Failed to read payments");
    rows.push(...data);
    if (data.length < READ_SIZE) return rows;
  }
}

async function paymentUsers() {
  const users = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: READ_SIZE });
    if (error || !data?.users) throw new Error("Failed to read payment buyers");
    for (const user of data.users) users.set(user.id, user);
    if (data.users.length < READ_SIZE) return users;
  }
}

async function paymentDetails(rows, users) {
  const maibIds = rows.filter((row) => row.provider === "maib").map((row) => row.id);
  const snapshots = new Map();
  if (maibIds.length) {
    const { data, error } = await supabaseAdmin.from("maib_payment_orders")
      .select("id,receipt_email,product_title").in("id", maibIds);
    if (error || !data) throw new Error("Failed to read payment details");
    for (const row of data) snapshots.set(row.id, row);
  }
  return rows.map((row) => {
    const user = users.get(row.user_id);
    const snapshot = snapshots.get(row.id);
    const metadata = user?.user_metadata || {};
    return {
      ...row,
      ...paymentAmounts(row),
      name: metadata.full_name || metadata.name || metadata.display_name || null,
      email: snapshot?.receipt_email || (!user?.is_anonymous ? user?.email : null) || null,
      productTitle: snapshot?.product_title || null,
    };
  });
}

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;
  const params = request.nextUrl.searchParams;
  const { period, since, until } = paymentPeriod(params.get("period"));
  const pageValue = params.get("page") || "1";
  const requestedCurrency = params.get("currency");
  if (!/^[1-9]\d{0,5}$/.test(pageValue) || (requestedCurrency && !/^[A-Z]{3}$/.test(requestedCurrency))) {
    return NextResponse.json({ error: "Invalid payment filters" }, { status: 400, headers });
  }
  const cacheKey = `catdai:admin-payments:v5:${period}:${period === "week" || period === "all" ? "rolling" : since}:${requestedCurrency || "default"}:${pageValue}`;
  try {
    if (params.get("fresh") !== "1") {
      const cached = await getSharedCache(cacheKey);
      if (cached?.value) return NextResponse.json(cached.value, { headers });
    }
    const [payments, users] = await Promise.all([readPayments(since, until), paymentUsers()]);
    const rows = payments.filter((row) => users.get(row.user_id)?.app_metadata?.catdai_is_admin !== true);
    const currencies = [...new Set(rows.map((row) => row.currency_code))].sort();
    const currency = requestedCurrency || (currencies.includes("MDL") ? "MDL" : currencies[0]) || "MDL";
    const filtered = rows.filter((row) => row.currency_code === currency);
    const { totals, products } = summarizePayments(filtered);
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const page = Math.min(Number(pageValue), pageCount);
    const [orders, cadastruFunnel] = await Promise.all([
      paymentDetails(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), users),
      loadCadastruPaymentFunnel({ since, until }, rows, users).catch((error) => {
        console.error("[admin-payments] Cadastru funnel:", error.message);
        return null;
      }),
    ]);
    const payload = {
      period, since, until, currency, currencies, totals, products, orders, page, pageCount, pageSize: PAGE_SIZE,
      cadastruFunnel,
      updatedAt: new Date().toISOString(),
    };
    if (cadastruFunnel) await setSharedCache(cacheKey, payload, CACHE_TTL_SECONDS);
    return NextResponse.json(payload, { headers });
  } catch (error) {
    console.error("[admin-payments]", error.message);
    return NextResponse.json({ error: "Payment data is unavailable. Please try again." }, { status: 503, headers });
  }
}
