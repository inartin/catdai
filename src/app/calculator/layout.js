import { cookies } from "next/headers";
import ro from "@/locales/ro.json";
import ru from "@/locales/ru.json";

const translations = { ro, ru };

export async function generateMetadata() {
  const cookieLang = (await cookies()).get("catdai-lang")?.value;
  const lang = translations[cookieLang] ? cookieLang : "ro";
  const title = translations[lang]?.["calculator.pageTitle"] || ro["calculator.pageTitle"];

  return {
    title: `${title} | Catdai`,
    alternates: {
      canonical: "/calculator",
    },
  };
}

export default function CalculatorLayout({ children }) {
  return children;
}
