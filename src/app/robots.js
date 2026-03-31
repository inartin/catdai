import { getCanonicalSiteUrl } from "@/lib/seo";

export default function robots() {
  const siteUrl = getCanonicalSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/profile", "/profile/", "/evaluare", "/api/"],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
