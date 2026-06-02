import { LanguageProvider } from "@/context/LanguageContext";
import { getNewsRequestLanguage } from "@/app/noutati/news-i18n";

export default async function NoutatiLayout({ children }) {
  const lang = await getNewsRequestLanguage();

  return <LanguageProvider initialLang={lang}>{children}</LanguageProvider>;
}
