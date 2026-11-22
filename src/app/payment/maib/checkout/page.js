import { paymentMetadata } from '@/lib/payment-metadata';
import { environment } from '@/lib/maib/client.mjs';
import { calculatorCheckoutRedirect, LEGACY_CALCULATOR_PRODUCT } from '@/lib/payment-urls.mjs';
import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
import MaibPaymentPage from '@/components/MaibPaymentPage';
export const generateMetadata = () => paymentMetadata(false);
export default async function MaibCheckout({ searchParams }) {
  const input = await searchParams;
  if (input.product_key === LEGACY_CALCULATOR_PRODUCT) {
    return redirect(calculatorCheckoutRedirect(input.return_to, input.lang));
  }
  return <MaibPaymentPage sandbox={environment() === "sandbox"} />;
}
