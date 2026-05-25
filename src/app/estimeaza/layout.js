import { cookies, headers } from "next/headers";
import ro from "@/locales/ro.json";
import ru from "@/locales/ru.json";

const translations = { ro, ru };

export async function generateMetadata() {
  const urlLang = (await headers()).get("x-catdai-lang");
  const cookieLang = (await cookies()).get("catdai-lang")?.value;
  const lang = translations[urlLang] ? urlLang : cookieLang;
  const title = translations[lang]?.["estimeaza.pageTitle"] || ro["estimeaza.pageTitle"];
  const canonicalLang = lang === "ru" ? "ru" : "ro";

  return {
    title: `${title} | Catdai`,
    alternates: {
      canonical: `/${canonicalLang}/estimeaza`,
      languages: {
        ro: "/ro/estimeaza",
        ru: "/ru/estimeaza",
        "x-default": "/ro/estimeaza",
      },
    },
  };
}

export default function EstimeazaLayout({ children }) {
  return children;
}
