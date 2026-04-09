"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PropertyForm from "@/components/PropertyForm";

function EstimeazaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const prefill = useMemo(() => {
    const city = searchParams.get("city");
    if (!city) return null;

    return {
      city,
      district: searchParams.get("district") || "",
      rooms_count: searchParams.get("rooms") || null,
      area_m2: searchParams.get("area") || "",
      floor: searchParams.get("floor") || "",
      total_floors: searchParams.get("total_floors") || "",
      building_type: searchParams.get("building_type") || "",
      renovation: searchParams.get("renovation") || "",
      bathrooms_count: searchParams.get("bathrooms") || null,
      balconies_count: searchParams.get("balconies") || null,
    };
  }, [searchParams]);

  return <PropertyForm onBack={() => router.push("/")} initialValues={prefill} />;
}

export default function EstimeazaPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <Suspense>
          <EstimeazaContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
