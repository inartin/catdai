import { paymentMetadata } from '@/lib/payment-metadata';
import { environment } from '@/lib/maib/client.mjs';
export const dynamic = 'force-dynamic';
import MaibPaymentPage from '@/components/MaibPaymentPage';
export const generateMetadata = () => paymentMetadata(false);
export default function MaibCheckout() { return <MaibPaymentPage sandbox={environment() === "sandbox"} />; }
