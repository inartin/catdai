import { LanguageProvider } from "@/context/LanguageContext";
import { getRequestLanguage } from "@/lib/request-language";

export default async function PaymentLayout({ children }) {
  const lang = await getRequestLanguage();
  return <LanguageProvider key={lang} initialLang={lang}>{children}</LanguageProvider>;
}
