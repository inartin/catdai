"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PropertyForm from "@/components/PropertyForm";
import { useTranslation } from "@/context/LanguageContext";
import { trackAdSourceEvent } from "@/lib/tracking";

function EstimeazaAnalytics() {
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    trackAdSourceEvent("estimate_form_view");
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;

    window.gtag("event", "conversion_event_page_view_1");
    sentRef.current = true;
  }, []);

  return null;
}

function EstimeazaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const prefill = useMemo(() => {
    const estimateType = searchParams.get("type") || searchParams.get("mode");
    const city = searchParams.get("city");
    if (!city && estimateType !== "rent") return null;

    return {
      type: estimateType === "rent" ? "rent" : "sale",
      city: city || undefined,
      district: searchParams.get("district") || "",
      districts: searchParams.getAll("district").filter(Boolean),
      rooms_count: searchParams.get("rooms") || null,
      area_m2: searchParams.get("area") || "",
      floor: searchParams.get("floor") || "",
      first_floor: searchParams.get("first_floor") || "",
      last_floor: searchParams.get("last_floor") || "",
      total_floors: searchParams.get("total_floors") || "",
      building_type: searchParams.get("building_type") || "",
      building_types: searchParams.getAll("building_type").filter(Boolean),
      renovation: searchParams.get("renovation") || "",
      bathrooms_count: searchParams.get("bathrooms") || null,
      balconies_count: searchParams.get("balconies") || null,
    };
  }, [searchParams]);

  const trackCompleteEstimateConversion = (targetUrl) => {
    trackAdSourceEvent("estimate_submit", { target_url: targetUrl });

    if (
      typeof window === "undefined" ||
      typeof window.catdaiTrackGoogleAdsConversion !== "function"
    ) {
      return true;
    }

    let shouldNavigate = true;
    const navigate = () => {
      if (!shouldNavigate) return;
      shouldNavigate = false;
      router.push(targetUrl);
    };

    window.catdaiTrackGoogleAdsConversion(navigate);
    window.setTimeout(navigate, 1000);
    return false;
  };

  return (
    <PropertyForm
      onBack={() => router.push("/")}
      initialValues={prefill}
      onValidSubmit={trackCompleteEstimateConversion}
    />
  );
}

export default function EstimeazaPage() {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t("estimeaza.pageTitle")} | Catdai`;
  }, [t]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <EstimeazaAnalytics />
        <Suspense>
          <EstimeazaContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
