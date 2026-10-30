import { cookies, headers } from "next/headers";
import ro from "@/locales/ro.json";
import ru from "@/locales/ru.json";
import en from "@/locales/en.json";
import { cadastruLanguageAlternates, OG_LOCALES } from "@/lib/language";
import { LanguageProvider } from "@/context/LanguageContext";

const translations = { ro, ru, en };

function resolveLanguage(urlLang, cookieLang) {
  if (translations[urlLang]) return urlLang;
  if (translations[cookieLang]) return cookieLang;
  return "ro";
}

async function getRequestLanguage() {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const urlLang = requestHeaders.get("x-catdai-lang");
  const cookieLang = cookieStore.get("catdai-lang")?.value;
  const hasUrlLang = !!translations[urlLang];
  const lang = resolveLanguage(urlLang, cookieLang);

  return { hasUrlLang, lang };
}

export async function generateMetadata() {
  const { hasUrlLang, lang } = await getRequestLanguage();
  const canonicalLang = lang;
  const title = translations[lang]["cadastru.metaTitle"];
  const description = translations[lang]["cadastru.metaDescription"];

  return {
    title,
    description,
    robots: hasUrlLang ? undefined : { index: false, follow: true },
    alternates: {
      canonical: `/${canonicalLang}/cadastru`,
      languages: cadastruLanguageAlternates(),
    },
    openGraph: {
      title,
      description,
      url: `/${canonicalLang}/cadastru`,
      siteName: "Catdai",
      type: "website",
      locale: OG_LOCALES[lang],
      alternateLocale: Object.values(OG_LOCALES).filter((locale) => locale !== OG_LOCALES[lang]),
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export default async function CadastruLayout({ children }) {
  const { lang } = await getRequestLanguage();

  return <LanguageProvider key={lang} initialLang={lang}>{children}</LanguageProvider>;
}
