import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PAGE_SIZE = 100;

async function reviewContacts(reviews) {
  if (!reviews.length) return [];

  // Follow the reviewed unlock's order, rather than another purchase by this buyer.
  // This link also survives a guest's purchases being claimed by an account.
  const usageIds = [...new Set(reviews.map(row => row.usage_event_id).filter(Boolean))];
  const usages = new Map();
  if (usageIds.length) {
    const { data, error } = await supabaseAdmin.from("user_feature_usage_events")
      .select("id, metadata").in("id", usageIds);
    if (error) throw error;
    for (const row of data || []) usages.set(row.id, row.metadata?.maib_order_id);
  }

  const orderIds = [...new Set([...usages.values()].filter(Boolean))];
  const emails = new Map();
  if (orderIds.length) {
    const { data, error } = await supabaseAdmin.from("maib_payment_orders")
      .select("id, receipt_email").in("id", orderIds);
    if (error) throw error;
    for (const row of data || []) emails.set(row.id, row.receipt_email);
  }

  const userIds = [...new Set(reviews.filter(row => !row.is_anonymous).map(row => row.user_id))];
  const users = new Map(await Promise.all(userIds.map(async id => {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
    if (error) throw error;
    return [id, data?.user];
  })));

  return reviews.map(row => {
    const user = users.get(row.user_id);
    const metadata = user?.user_metadata || {};
    const checkoutEmail = emails.get(usages.get(row.usage_event_id));
    const accountEmail = !user?.is_anonymous ? user?.email : null;
    return {
      ...row,
      user_name: metadata.full_name || metadata.name || metadata.display_name || accountEmail || null,
      contact_email: checkoutEmail || accountEmail || null,
      contact_email_source: checkoutEmail ? "checkout" : accountEmail ? "account" : null,
    };
  });
}

export async function GET(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  let { data, error } = await supabaseAdmin
    .from("user_feedback")
    .select("id, user_id, visitor, message, contact_email, contact_phone, image_name, image_type, image_size, image_data, status, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (error?.message?.includes("Could not find") && error.message.includes("contact_email")) {
    ({ data, error } = await supabaseAdmin
      .from("user_feedback")
      .select("id, user_id, visitor, message, image_name, image_type, image_size, image_data, status, created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE));
  }

  if (error) {
    console.error("[admin-feedback] list failed:", error.message);
    return NextResponse.json({ error: "Failed to load feedback." }, { status: 500 });
  }

  const { data: reviews, error: reviewError } = await supabaseAdmin
    .from("result_reviews")
    .select("id, user_id, usage_event_id, feature_key, is_anonymous, visitor, rating, comment, created_at")
    .eq("status", "submitted")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (reviewError) {
    console.error("[admin-feedback] reviews failed:", reviewError.message);
    return NextResponse.json({ error: "Failed to load reviews." }, { status: 500 });
  }

  try {
    return NextResponse.json({ feedback: data || [], reviews: await reviewContacts(reviews || []) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[admin-feedback] review contacts failed:", error.message);
    return NextResponse.json({ error: "Failed to load review contacts." }, { status: 500 });
  }
}

export async function DELETE(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid feedback id." }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("user_feedback")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[admin-feedback] delete failed:", error.message);
    return NextResponse.json({ error: "Failed to delete feedback." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
