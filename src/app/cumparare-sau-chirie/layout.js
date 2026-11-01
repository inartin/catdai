import { headers } from 'next/headers';
import { LanguageProvider } from '@/context/LanguageContext';
import { getRequestLanguage } from '@/lib/request-language';
import { OG_LOCALES, cadastruLanguageAlternates } from '@/lib/language';
import { buyRentCopy } from '@/lib/buy-rent-copy';

export async function generateMetadata() {
  const lang = await getRequestLanguage();
  const c = buyRentCopy[lang];
  const url = `/${lang}/cumparare-sau-chirie`;
  const localized = ['ro', 'ru', 'en'].includes((await headers()).get('x-catdai-lang'));
  return {
    title: c.metaTitle, description: c.metaDescription,
    robots: localized ? { index: true, follow: true } : { index: false, follow: true },
    alternates: { canonical: url, languages: cadastruLanguageAlternates('/cumparare-sau-chirie') },
    openGraph: { title: c.metaTitle, description: c.metaDescription, url, type: 'website', siteName: 'CatDai', locale: OG_LOCALES[lang], alternateLocale: Object.values(OG_LOCALES).filter((value) => value !== OG_LOCALES[lang]) },
    twitter: { card: 'summary_large_image', title: c.metaTitle, description: c.metaDescription },
  };
}
export default async function BuyRentLayout({ children }) {
  const lang = await getRequestLanguage();
  return <LanguageProvider key={lang} initialLang={lang}>{children}</LanguageProvider>;
}
