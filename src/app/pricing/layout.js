import { cookies } from "next/headers";
import ro from "@/locales/ro.json";
import ru from "@/locales/ru.json";

const translations = { ro, ru };

export async function generateMetadata() {
  const cookieLang = (await cookies()).get("catdai-lang")?.value;
  const lang = translations[cookieLang] ? cookieLang : "ro";
  const title = translations[lang]?.["pricing.pageTitle"] || ro["pricing.pageTitle"];
  const description =
    translations[lang]?.["pricing.metaDescription"] || ro["pricing.metaDescription"];

  return {
    title: `${title} | Catdai`,
    description,
    alternates: {
      canonical: "/pricing",
    },
  };
}

export default function PricingLayout({ children }) {
  return children;
}

