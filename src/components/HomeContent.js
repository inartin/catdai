"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Hero from "@/components/Hero";
import CategoryCards from "@/components/CategoryCards";
import HowItWorks from "@/components/HowItWorks";
import ExampleResults from "@/components/ExampleResults";

export default function HomeContent() {
  const router = useRouter();

  const handleCategorySelect = useCallback((category) => {
    if (category === "imobil") router.push("/estimeaza");
  }, [router]);

  return (
    <div className="animate-fade-in">
      <Hero />
      <CategoryCards onCategorySelect={handleCategorySelect} />
      <HowItWorks />
      <ExampleResults />
    </div>
  );
}
