import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCanonicalSiteUrl } from "@/lib/seo";

const INDEXABLE_STATIC_PATHS = ["/", "/estimeaza", "/about", "/terms", "/privacy", "/ro/faq", "/ru/faq"];

export default async function sitemap() {
  const siteUrl = getCanonicalSiteUrl();

  const staticEntries = INDEXABLE_STATIC_PATHS.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
  }));

  try {
    const { data, error } = await supabaseAdmin
      .from("shared_links")
      .select("slug, created_at")
      .not("slug", "is", null);

    if (error || !data?.length) {
      return staticEntries;
    }

    const dynamicEntries = data
      .filter((entry) => entry.slug)
      .map((entry) => ({
        url: `${siteUrl}/imobil/${entry.slug}`,
        lastModified: entry.created_at ? new Date(entry.created_at) : new Date(),
      }));

    return [...staticEntries, ...dynamicEntries];
  } catch {
    return staticEntries;
  }
}
