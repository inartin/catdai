"use client";

import { useState, useCallback } from "react";
import Hero from "@/components/Hero";
import CategoryCards from "@/components/CategoryCards";
import HowItWorks from "@/components/HowItWorks";
import PropertyForm from "@/components/PropertyForm";

export default function HomeContent() {
  const [view, setView] = useState("landing");

  const handleCategorySelect = useCallback((category) => {
    if (category === "Imobil") setView("imobil");
  }, []);

  const handleBack = useCallback(() => setView("landing"), []);

  if (view === "imobil") {
    return (
      <div key="imobil" className="animate-fade-in">
        <PropertyForm onBack={handleBack} />
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
