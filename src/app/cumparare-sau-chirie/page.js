import BuyRentSimulator from '@/components/BuyRentSimulator';
import { getRequestLanguage } from '@/lib/request-language';
import { buyRentCopy } from '@/lib/buy-rent-copy';
import { serializeJsonLd, toAbsoluteUrl } from '@/lib/seo';

export default async function BuyRentPage() {
  const lang = await getRequestLanguage();
  const c = buyRentCopy[lang];
  const url = toAbsoluteUrl(`/${lang}/cumparare-sau-chirie`);
  const schema = {
    '@context': 'https://schema.org', '@type': 'WebApplication',
    name: c.metaTitle, description: c.metaDescription, url, inLanguage: lang,
    applicationCategory: 'FinanceApplication', operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    publisher: { '@type': 'Organization', name: 'CatDai', url: toAbsoluteUrl('/') },
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} /><BuyRentSimulator /></>;
}
