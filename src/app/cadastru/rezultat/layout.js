import { cookies, headers } from "next/headers";
import ro from "@/locales/ro.json";
import ru from "@/locales/ru.json";

const translations = { ro, ru };

function resolveLanguage(urlLang, cookieLang) {
  if (translations[urlLang]) return urlLang;
  if (translations[cookieLang]) return cookieLang;
  return "ro";
}

export async function generateMetadata() {
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const urlLang = requestHeaders.get("x-catdai-lang");
  const cookieLang = cookieStore.get("catdai-lang")?.value;
  const lang = resolveLanguage(urlLang, cookieLang);
  const canonicalLang = lang === "ru" ? "ru" : "ro";
  const title = translations[lang]["cadastru.resultPageTitle"];
  const description = translations[lang]["cadastru.resultMetaDescription"];

  return {
    title: `${title} | Catdai`,
    description,
    robots: { index: false, follow: true },
    alternates: {
      canonical: `/${canonicalLang}/cadastru`,
      languages: {
        ro: "/ro/cadastru",
        ru: "/ru/cadastru",
        "x-default": "/ro/cadastru",
      },
    },
  };
}

export default function CadastruResultLayout({ children }) {
  return children;
}
