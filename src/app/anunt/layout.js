import { cookies, headers } from "next/headers";
import ro from "@/locales/ro.json";
import ru from "@/locales/ru.json";

const translations = { ro, ru };

export async function generateMetadata() {
  const urlLang = (await headers()).get("x-catdai-lang");
  const cookieLang = (await cookies()).get("catdai-lang")?.value;
  const lang = translations[urlLang] ? urlLang : cookieLang;
  const title = translations[lang]?.["anunt.pageTitle"] || ro["anunt.pageTitle"];

  return {
    title: `${title} | Catdai`,
    robots: { index: false, follow: false },
    alternates: {
      canonical: "/anunt",
    },
  };
}

export default function AnuntLayout({ children }) {
  return children;
}
