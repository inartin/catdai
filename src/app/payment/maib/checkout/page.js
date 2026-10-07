import { environment } from '@/lib/maib/client.mjs';
export const dynamic = 'force-dynamic';
import MaibPaymentPage from '@/components/MaibPaymentPage';
export const metadata = { title: 'Plată maib | CatDai', robots: { index: false, follow: false } };
export default function MaibCheckout() { return <MaibPaymentPage sandbox={environment() === "sandbox"} />; }
