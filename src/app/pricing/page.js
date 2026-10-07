import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import PricingPackages from "@/components/PricingPackages";

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <PricingPackages />
      </main>
      <Footer />
    </div>
  );
}
