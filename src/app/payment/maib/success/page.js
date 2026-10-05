import { environment } from '@/lib/maib/client.mjs';
export const dynamic = 'force-dynamic';
import MaibPaymentPage from '@/components/MaibPaymentPage';
export const metadata = { title: 'Status plată | CatDai', robots: { index: false, follow: false } };
export default function MaibResult() { return <MaibPaymentPage result sandbox={environment() === "sandbox"} />; }
