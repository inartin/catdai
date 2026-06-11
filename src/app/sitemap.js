import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCanonicalSiteUrl } from "@/lib/seo";

const INDEXABLE_STATIC_PATHS = [
  "/",
  "/ro/estimeaza",
  "/ru/estimeaza",
  "/ro/evaluare",
  "/ru/evaluare",
  "/ro/alerts",
  "/ru/alerts",
  "/ro/cadastru",
  "/ru/cadastru",
  "/pricing",
  "/verifica-anunt",
  "/noutati",
  "/about",
  "/terms",
  "/privacy",
  "/refund",
  "/ro/faq",
  "/ru/faq",
  "/ro/preturi-apartamente/chisinau/botanica",
  "/ru/ceny-kvartir/kishinev/botanika",
  "/ro/preturi-apartamente/chisinau/botanica-constructii-noi",
  "/ru/ceny-kvartir/kishinev/botanika-novostroy",
];

export default async function sitemap() {
  const siteUrl = getCanonicalSiteUrl();

  const entries = INDEXABLE_STATIC_PATHS.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
  }));

  try {
    const { data, error } = await supabaseAdmin
      .from("shared_links")
      .select("slug, created_at")
      .not("slug", "is", null);

    if (!error && data?.length) {
      const dynamicEntries = data
        .filter((entry) => entry.slug)
        .map((entry) => ({
          url: `${siteUrl}/imobil/${entry.slug}`,
          lastModified: entry.created_at ? new Date(entry.created_at) : new Date(),
        }));

      entries.push(...dynamicEntries);
    }
  } catch {
    return entries;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("news_posts")
      .select("slug, created_at")
      .not("slug", "is", null);

    if (!error && data?.length) {
      const newsEntries = data
        .filter((entry) => entry.slug)
        .map((entry) => ({
          url: `${siteUrl}/noutati/${entry.slug}`,
          lastModified: entry.created_at ? new Date(entry.created_at) : new Date(),
        }));

      entries.push(...newsEntries);
    }
  } catch {
    return entries;
  }

  return entries;
}
