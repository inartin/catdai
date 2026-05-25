import { cookies } from "next/headers";
import ro from "@/locales/ro.json";
import ru from "@/locales/ru.json";

const translations = { ro, ru };

export async function generateMetadata() {
  const lang = (await cookies()).get("catdai-lang")?.value;
  const title = translations[lang]?.["nav.profile"] || ro["nav.profile"];

  return {
    title: `${title} | Catdai`,
  };
}

export default function ProfileLayout({ children }) {
  return children;
}
