import { cache } from "react";
import { cookies, headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { decodeCadastruShareCode, getCadastruSharePath } from "@/lib/cadastru-share-url";
import { toAbsoluteUrl } from "@/lib/seo";
import ro from "@/locales/ro.json";
import ru from "@/locales/ru.json";

const translations = { ro, ru };

// Share metadata and page rendering reuse one read within the same server request.
export const getCadastruSharedReport = cache(async (identifier) => {
  if (typeof identifier !== "string") return null;
  const slug = /^[a-f0-9]{48}$/.test(identifier) ? identifier : decodeCadastruShareCode(identifier);
  if (!slug && !/^[A-Za-z0-9_-]{12}$/.test(identifier)) return null;
  const { data, error } = await supabaseAdmin.from("cadastru_shared_reports")
    .select("slug, payload").eq(slug ? "slug" : "short_code", slug || identifier).maybeSingle();
  if (error) throw new Error("Shared report storage unavailable");
  return data;
});

function reportAddress(payload) {
  // Only address fields may enter previews, never other registry/report values.
  const candidates = [payload?.request_address, payload?.resolved_address, payload?.matched_address,
    payload?.apartment?.address, payload?.building?.address, payload?.address,
    ...(Array.isArray(payload?.lands) ? payload.lands.map((land) => land?.address) : []),
    ...(Array.isArray(payload?.buildings) ? payload.buildings.map((building) => building?.address) : [])];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const address = value.replace(/\s+/g, " ").trim();
    if (/\p{L}/u.test(address)) return address.slice(0, 250);
  }
  return "";
}

export async function getCadastruShareMetadata(report) {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const urlLang = requestHeaders.get("x-catdai-lang");
  const cookieLang = cookieStore.get("catdai-lang")?.value;
  const lang = urlLang === "ro" || urlLang === "ru" ? urlLang
    : cookieLang === "ru" ? "ru" : "ro";
  const copy = translations[lang];
  const address = reportAddress(report?.payload);
  const title = `${copy["cadastru.sharedMetaTitle"]}${address ? ` — ${address}` : ""} | Catdai`;
  const description = copy["cadastru.sharedMetaDescription"];
  const roPath = report ? await getCadastruSharePath(report.slug, "ro") : "/ro/cadastru";
  const ruPath = report ? await getCadastruSharePath(report.slug, "ru") : "/ru/cadastru";
  const canonical = lang === "ru" ? ruPath : roPath;

  return {
    title, description,
    robots: { index: false, follow: true },
    alternates: { canonical, languages: { ro: roPath, ru: ruPath, "x-default": roPath } },
    openGraph: {
      title, description, url: toAbsoluteUrl(canonical), siteName: "Catdai", type: "website",
      locale: lang === "ru" ? "ru_MD" : "ro_MD",
      alternateLocale: lang === "ru" ? ["ro_MD"] : ["ru_MD"],
    },
    twitter: { card: "summary", title, description },
  };
}
