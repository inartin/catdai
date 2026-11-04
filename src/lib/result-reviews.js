import { supabaseAdmin } from "@/lib/supabase-admin";

export const REVIEW_COMMENT_LIMIT = 500;

export function cleanReviewComment(value) {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > REVIEW_COMMENT_LIMIT) {
    throw new Error("Invalid review comment.");
  }
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim() || null;
}

export async function getReviewState(userId, usageId) {
  // A guest's response still suppresses prompts after their purchases are claimed.
  const { data: guests, error: guestError } = await supabaseAdmin
    .from("guest_checkout_accounts").select("guest_user_id").eq("claimed_user_id", userId);
  if (guestError) throw guestError;
  const userIds = [userId, ...(guests || []).map(row => row.guest_user_id)];
  const { data: responses, error: responseError } = await supabaseAdmin
    .from("result_reviews").select("id").in("user_id", userIds).limit(1);
  if (responseError) throw responseError;
  if (responses?.length) return { eligible: false, responded: true, usage: null };

  const { data: usage, error: usageError } = await supabaseAdmin
    .from("user_feature_usage_events").select("id, feature_key")
    .eq("id", usageId).eq("user_id", userId).eq("source", "paid_credit").maybeSingle();
  if (usageError) throw usageError;
  return { eligible: Boolean(usage), usage };
}
