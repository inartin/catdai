import { redirect } from 'next/navigation';
import { getPaymentProvider } from '@/lib/payment-provider';
export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default async function PaymentCheckout({ searchParams }) {
  const input = await searchParams;
  const params = new URLSearchParams();
  for (const key of ['product_key','lang','return_to']) if (typeof input[key] === 'string') params.set(key, input[key]);
  redirect(`/payment/${getPaymentProvider()}/checkout?${params}`);
}
