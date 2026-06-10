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
        <Pricing prices={prices} />
      </main>
      <Footer />
    </div>
  );
}

