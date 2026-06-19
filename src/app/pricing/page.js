import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Pricing from "@/components/Pricing";
import { getPricingConfig } from "@/lib/pricing-config";

export default function PricingPage() {
  const prices = getPricingConfig();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <Pricing prices={prices} trackPageOpen />
        <p className="mx-auto max-w-6xl my-10 px-4 pb-8 text-center text-xs font-medium text-gray-500">
          Plata se procesează în EUR prin Paddle. Prețurile în lei sunt afișate orientativ.
        </p>
      </main>
      <Footer />
    </div>
  );
}
