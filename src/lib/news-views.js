import { supabaseAdmin } from "@/lib/supabase-admin";
import { isValidNewsPostId } from "@/lib/news-upvotes";

export async function fetchNewsViewCounts(postIds) {
  const ids = [...new Set((postIds || []).filter(isValidNewsPostId))];
  if (!ids.length) return {};

  const { data, error } = await supabaseAdmin.rpc("news_post_view_counts", { post_ids: ids });
  if (error) {
    if (!["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code)) {
      console.error("[news-views] count failed:", error.message);
    }
    return {};
  }

  return Object.fromEntries((data || []).map((row) => [row.news_post_id, Number(row.view_count) || 0]));
}
