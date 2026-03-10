"use client";

import { useState, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Hero from "@/components/Hero";
import CategoryCards from "@/components/CategoryCards";
import HowItWorks from "@/components/HowItWorks";
import PropertyForm from "@/components/PropertyForm";

function HomeContentInner() {
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

  const [view, setView] = useState(prefill ? "imobil" : "landing");

  const handleCategorySelect = useCallback((category) => {
    if (category === "Imobil") setView("imobil");
  }, []);

  const handleBack = useCallback(() => setView("landing"), []);

  if (view === "imobil") {
    return (
      <div key="imobil" className="animate-fade-in">
        <PropertyForm onBack={handleBack} initialValues={prefill} />
      </div>
    );
  }

  return (
    <div key="landing" className="animate-fade-in">
      <Hero />
      <CategoryCards onCategorySelect={handleCategorySelect} />
      <HowItWorks />
    </div>
  );
}

export default function HomeContent() {
  return (
    <Suspense>
      <HomeContentInner />
    </Suspense>
  );
}
