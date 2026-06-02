import { supabaseAdmin } from "@/lib/supabase-admin";

export const NEWS_POST_SELECT = "id, title, description, cover_image_url, slug, created_at";
export const NEWS_POST_LIST_SELECT = NEWS_POST_SELECT;
export const NEWS_POST_BASE_SELECT = "id, title, description, cover_image_url, created_at";

export function slugifyNewsTitle(title) {
  const slug = String(title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 90)
    .replace(/-+$/g, "");

  return slug || "noutate";
}

export async function createUniqueNewsSlug(title) {
  const baseSlug = slugifyNewsTitle(title);
  const { data, error } = await supabaseAdmin
    .from("news_posts")
    .select("slug")
    .ilike("slug", `${baseSlug}%`);

  if (error && String(error.message || "").includes("slug")) return null;
  if (error) throw error;

  const existingSlugs = new Set((data || []).map((row) => row.slug).filter(Boolean));
  if (!existingSlugs.has(baseSlug)) return baseSlug;

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${baseSlug}-${index}`;
    if (!existingSlugs.has(candidate)) return candidate;
  }

  return `${baseSlug}-${Date.now()}`;
}

export async function fetchPublishedNewsPosts() {
  const { data, error } = await supabaseAdmin
    .from("news_posts")
    .select(NEWS_POST_LIST_SELECT)
    .not("slug", "is", null)
    .order("created_at", { ascending: false });

  if (error) {
    if (String(error.message || "").includes("slug")) {
      const fallback = await supabaseAdmin
        .from("news_posts")
        .select(NEWS_POST_BASE_SELECT)
        .order("created_at", { ascending: false });

      if (!fallback.error) {
        return (fallback.data || []).map((row) => ({ ...row, slug: slugifyNewsTitle(row.title) }));
      }
    }

    console.error("[news-posts] list failed:", error.message);
    return [];
  }

  return data || [];
}

export async function fetchPublishedNewsPostBySlug(slug) {
  const { data, error } = await supabaseAdmin
    .from("news_posts")
    .select(NEWS_POST_SELECT)
    .eq("slug", slug)
    .single();

  if (error) {
    if (String(error.message || "").includes("slug")) {
      const fallback = await supabaseAdmin
        .from("news_posts")
        .select(NEWS_POST_BASE_SELECT)
        .order("created_at", { ascending: false });

      if (!fallback.error) {
        const row = (fallback.data || []).find((entry) => slugifyNewsTitle(entry.title) === slug);
        if (row) return { ...row, slug };
      }
    }

    if (error.code !== "PGRST116") {
      console.error("[news-posts] detail failed:", error.message);
    }
    return null;
  }

  return data;
}
