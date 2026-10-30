import { paymentMetadata } from '@/lib/payment-metadata';
import { environment } from '@/lib/maib/client.mjs';
export const dynamic = 'force-dynamic';
import MaibPaymentPage from '@/components/MaibPaymentPage';
export const generateMetadata = () => paymentMetadata(true);
export default function MaibResult() { return <MaibPaymentPage result sandbox={environment() === "sandbox"} />; }
