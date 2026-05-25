import { cookies, headers } from "next/headers";
import ro from "@/locales/ro.json";
import ru from "@/locales/ru.json";

const translations = { ro, ru };

export async function generateMetadata() {
  const urlLang = (await headers()).get("x-catdai-lang");
  const cookieLang = (await cookies()).get("catdai-lang")?.value;
  const hasUrlLang = !!translations[urlLang];
  const lang = hasUrlLang ? urlLang : cookieLang;
  const title = translations[lang]?.["evaluare.pageTitle"] || ro["evaluare.pageTitle"];
  const canonicalLang = lang === "ru" ? "ru" : "ro";

  return {
    title: `${title} | Catdai`,
    robots: hasUrlLang ? undefined : { index: false, follow: false },
    alternates: {
      canonical: `/${canonicalLang}/evaluare`,
      languages: {
        ro: "/ro/evaluare",
        ru: "/ru/evaluare",
        "x-default": "/ro/evaluare",
      },
    },
  };
}

export default function EvaluareLayout({ children }) {
  return children;
}
