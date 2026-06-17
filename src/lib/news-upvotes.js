import { supabaseAdmin } from "@/lib/supabase-admin";

const MISSING_SCHEMA_CODES = new Set(["42P01", "42703", "PGRST204"]);

export function isValidNewsPostId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

export function isMissingNewsUpvoteSchema(error) {
  return MISSING_SCHEMA_CODES.has(String(error?.code || ""));
}

export async function fetchNewsUpvoteCounts(postIds) {
  const ids = [...new Set((postIds || []).filter(isValidNewsPostId))];
  if (ids.length === 0) return {};

  const { data, error } = await supabaseAdmin
    .from("news_post_upvotes")
    .select("news_post_id")
    .in("news_post_id", ids);

  if (error) {
    if (!isMissingNewsUpvoteSchema(error)) {
      console.error("[news-upvotes] count list failed:", error.message);
    }
    return {};
  }

  return (data || []).reduce((counts, row) => {
    counts[row.news_post_id] = (counts[row.news_post_id] || 0) + 1;
    return counts;
  }, {});
}

export async function fetchNewsPostUpvoteCount(postId) {
  if (!isValidNewsPostId(postId)) return 0;

  const { count, error } = await supabaseAdmin
    .from("news_post_upvotes")
    .select("id", { count: "exact", head: true })
    .eq("news_post_id", postId);

  if (error) {
    if (!isMissingNewsUpvoteSchema(error)) {
      console.error("[news-upvotes] count failed:", error.message);
    }
    return 0;
  }

  return count || 0;
}

export async function hasUserUpvotedNewsPost(postId, userId) {
  if (!isValidNewsPostId(postId) || !userId) return false;

  const { data, error } = await supabaseAdmin
    .from("news_post_upvotes")
    .select("id")
    .eq("news_post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (!isMissingNewsUpvoteSchema(error)) {
      console.error("[news-upvotes] user status failed:", error.message);
    }
    return false;
  }

  return !!data;
}
