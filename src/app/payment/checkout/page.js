import { redirect } from 'next/navigation';
import { getPaymentProvider } from '@/lib/payment-provider';
import { paymentAppLink } from '@/lib/payment-urls.mjs';
import { getRequestLanguage } from '@/lib/request-language';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default async function PaymentCheckout({ searchParams }) {
  const input = await searchParams;
  const params = new URLSearchParams();
  for (const key of ['product_key','quantity','lang','return_to','checkout_source']) if (typeof input[key] === 'string') params.set(key, input[key]);
  if (!params.has('lang')) params.set('lang', await getRequestLanguage());
  redirect(paymentAppLink(`/payment/${getPaymentProvider()}/checkout?${params}`));
}
