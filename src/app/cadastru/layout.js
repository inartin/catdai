import { cookies, headers } from "next/headers";
import ro from "@/locales/ro.json";
import ru from "@/locales/ru.json";
import { LanguageProvider } from "@/context/LanguageContext";

const translations = { ro, ru };

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
  const canonicalLang = lang === "ru" ? "ru" : "ro";
  const title = translations[lang]["cadastru.metaTitle"];
  const description = translations[lang]["cadastru.metaDescription"];

  return {
    title: `${title} | Catdai`,
    description,
    robots: hasUrlLang ? undefined : { index: false, follow: true },
    alternates: {
      canonical: `/${canonicalLang}/cadastru`,
      languages: {
        ro: "/ro/cadastru",
        ru: "/ru/cadastru",
        "x-default": "/ro/cadastru",
      },
    },
    openGraph: {
      title: `${title} | Catdai`,
      description,
      url: `/${canonicalLang}/cadastru`,
      siteName: "Catdai",
      type: "website",
      locale: lang === "ru" ? "ru_MD" : "ro_MD",
      alternateLocale: lang === "ru" ? ["ro_MD"] : ["ru_MD"],
    },
    twitter: {
      card: "summary",
      title: `${title} | Catdai`,
      description,
    },
  };
}

export default async function CadastruLayout({ children }) {
  const { lang } = await getRequestLanguage();

  return <LanguageProvider initialLang={lang}>{children}</LanguageProvider>;
}
