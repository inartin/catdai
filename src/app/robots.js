import { getCanonicalSiteUrl } from "@/lib/seo";

const RESTRICTED_PATHS = ["/admin", "/admin/", "/profile", "/profile/", "/api/"];

const ALLOWED_AI_CRAWLERS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "Google-Extended",
];

const BLOCKED_BULK_CRAWLERS = [
  "Amazonbot",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "meta-externalagent",
  "AhrefsBot",
  "SemrushBot",
  "SemrushBot-BA",
  "DotBot",
  "MJ12bot",
  "BLEXBot",
  "DataForSeoBot",
];

export default function robots() {
  const siteUrl = getCanonicalSiteUrl();

  return {
    rules: [
      ...ALLOWED_AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: RESTRICTED_PATHS,
      })),
      ...BLOCKED_BULK_CRAWLERS.map((userAgent) => ({
        userAgent,
        disallow: "/",
      })),
      {
        userAgent: "*",
        allow: "/",
        disallow: RESTRICTED_PATHS,
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
