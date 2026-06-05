"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EstimateResult from "@/components/EstimateResult";
import PropertyForm from "@/components/PropertyForm";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";
import { getDeviceId, getSessionId } from "@/lib/tracking";
import { validateEstimateInput } from "@/lib/validation";

function isTrueParam(value) {
  return value === "1" || value === "true";
}

function parseRooms(value) {
  if (value === "5+") return 5;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveMoney(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeMoney(value) {
  if (value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function hashEventKey(value) {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function getCalculatorUsageEventId(paramsString) {
  try {
    const key = `catdai-calculator-usage-${hashEventKey(paramsString)}`;
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `calculator-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function buildRentEstimateRequest(params) {
  const districts = params.getAll("district").filter(Boolean);
  const buildingTypes = params.getAll("building_type").filter(Boolean);
  const roomsCount = parseRooms(params.get("rooms"));
  const apartmentPrice = parsePositiveMoney(params.get("apartment_price"));
  const additionalInvestments = parseNonNegativeMoney(params.get("additional_investments"));

  if (!apartmentPrice || additionalInvestments === null) {
    return { error: { code: "invalid_calculator_input", field: "apartment_price" } };
  }

  const validation = validateEstimateInput({
    city: params.get("city"),
    district: districts[0] || params.get("district"),
    rooms_count: roomsCount,
    area_m2: params.get("area") || null,
    floor: params.get("floor") || null,
    first_floor: isTrueParam(params.get("first_floor")),
    last_floor: isTrueParam(params.get("last_floor")),
    total_floors: params.get("total_floors") || null,
    building_type: buildingTypes[0] || params.get("building_type") || null,
    renovation: params.get("renovation") || null,
    bathrooms_count: params.get("bathrooms") || null,
    balconies_count: params.get("balconies") || null,
  });

  if (!validation.valid) {
    return { error: { code: validation.reason, field: validation.field } };
  }

  const v = validation.data;

  return {
    body: {
      city: v.city,
      districts: districts.length > 0 ? districts : [v.district].filter(Boolean),
      rooms_count: v.rooms_count,
      area_m2: v.area_m2,
      floor: v.floor ?? null,
      first_floor: v.first_floor ?? false,
      last_floor: v.last_floor ?? false,
      total_floors: v.total_floors ?? null,
      building_types: buildingTypes,
      renovation: v.renovation ?? null,
      bathrooms_count: v.bathrooms_count ?? null,
      balconies_count: v.balconies_count ?? null,
    },
    calculator: {
      apartment_price: apartmentPrice,
      additional_investments: additionalInvestments,
      include_rent_tax: isTrueParam(params.get("include_rent_tax")),
    },
  };
}

function buildRentYieldCalculation(data, calculator) {
  const monthlyRent = Number(data?.estimate?.market_rate);
  const apartmentPrice = Number(calculator.apartment_price);
  const additionalInvestments = Number(calculator.additional_investments) || 0;
  const totalInvestment = apartmentPrice + additionalInvestments;
  const annualGrossRent = Number.isFinite(monthlyRent) && monthlyRent > 0 ? monthlyRent * 12 : null;
  const monthlyTax = calculator.include_rent_tax && Number.isFinite(monthlyRent) && monthlyRent > 0 ? monthlyRent * 0.07 : null;
  const annualTax = monthlyTax != null ? monthlyTax * 12 : null;
  const monthlyEffectiveRent = monthlyTax != null ? monthlyRent - monthlyTax : monthlyRent;
  const annualEffectiveRent = annualGrossRent ? annualGrossRent - annualTax : null;
  const grossYieldPct = annualGrossRent && totalInvestment > 0 ? (annualGrossRent / totalInvestment) * 100 : null;
  const effectiveYieldPct = annualEffectiveRent && totalInvestment > 0 ? (annualEffectiveRent / totalInvestment) * 100 : null;
  const paybackYears = annualEffectiveRent && annualEffectiveRent > 0 ? totalInvestment / annualEffectiveRent : null;

  return {
    apartment_price: apartmentPrice,
    additional_investments: additionalInvestments,
    total_investment: totalInvestment,
    include_rent_tax: calculator.include_rent_tax,
    monthly_rent: monthlyRent,
    annual_gross_rent: annualGrossRent,
    annual_tax: annualTax,
    monthly_tax: monthlyTax,
    monthly_effective_rent: monthlyEffectiveRent,
    annual_effective_rent: annualEffectiveRent,
    gross_yield_pct: grossYieldPct,
    effective_yield_pct: effectiveYieldPct,
    payback_years: paybackYears,
  };
}

function CalculatorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, lang } = useTranslation();
  const { session, loading: authLoading } = useAuth();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const loadedParamsRef = useRef(null);
  const paramsString = searchParams.toString();
  const isResultMode = searchParams.get("rezultat") === "1";

  const prefill = useMemo(() => ({
    city: searchParams.get("city") || undefined,
    district: searchParams.get("district") || "",
    rooms_count: searchParams.get("rooms") || null,
    area_m2: searchParams.get("area") || "",
    floor: searchParams.get("floor") || "",
    first_floor: searchParams.get("first_floor") || "",
    last_floor: searchParams.get("last_floor") || "",
    total_floors: searchParams.get("total_floors") || "",
    building_type: searchParams.get("building_type") || "",
    renovation: searchParams.get("renovation") || "",
    bathrooms_count: searchParams.get("bathrooms") || null,
    balconies_count: searchParams.get("balconies") || null,
    apartment_price: searchParams.get("apartment_price") || "",
    additional_investments: searchParams.get("additional_investments") || "",
    include_rent_tax: searchParams.get("include_rent_tax") || "",
  }), [searchParams]);

  const handleSubmit = (params) => {
    const nextParams = new URLSearchParams(params.toString());
    nextParams.set("type", "rent");
    nextParams.set("rezultat", "1");
    router.push(`/calculator?${nextParams.toString()}`);
  };

  const handleEdit = () => {
    const editParams = new URLSearchParams(paramsString);
    editParams.delete("rezultat");
    editParams.delete("_new");
    const query = editParams.toString();
    router.push(query ? `/calculator?${query}` : "/calculator");
  };

  useEffect(() => {
    if (authLoading) return;

    if (!isResultMode) {
      setResult(null);
      setError(null);
      setLoading(false);
      loadedParamsRef.current = null;
      return;
    }

    if (paramsString && paramsString === loadedParamsRef.current) return;

    let cancelled = false;

    const run = async () => {
      const request = buildRentEstimateRequest(new URLSearchParams(paramsString));
      if (request.error) {
        setResult(null);
        setError(request.error);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const headers = { "Content-Type": "application/json" };
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

        const res = await fetch("/api/estimate-rent", {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...request.body,
            calculator_usage: {
              event_id: getCalculatorUsageEventId(paramsString),
              device_id: getDeviceId(),
              session_id: getSessionId(),
              apartment_price: request.calculator.apartment_price,
              additional_investments: request.calculator.additional_investments,
              include_rent_tax: request.calculator.include_rent_tax,
              language: lang,
            },
          }),
        });
        let data = {};
        try { data = await res.json(); } catch { data = {}; }

        if (!res.ok) {
          if (!cancelled) {
            setResult(null);
            setError({ code: data.error || "unknown", status: res.status });
          }
          return;
        }

        if (!cancelled) {
          setResult({
            ...data,
            estimate_type: "rent",
            rent_yield_calculation: buildRentYieldCalculation(data, request.calculator),
          });
          loadedParamsRef.current = paramsString;
        }
      } catch {
        if (!cancelled) {
          setResult(null);
          setError({ code: "connection" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isResultMode, lang, paramsString, session?.access_token]);

  if (isResultMode) {
    if (loading || (!error && !result)) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <svg className="w-10 h-10 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <p className="text-sm text-gray-500">{t("evaluare.loading")}</p>
        </div>
      );
    }

    if (error) {
      const message = error.status === 429
        ? t("evaluare.rateLimitError")
        : error.code === "connection"
          ? t("evaluare.connectionError")
          : t("evaluare.defaultError");

      return (
        <div className="max-w-lg mx-auto py-16 px-4 text-center">
          <div className="p-5 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-600 mb-6">
            {message}
          </div>
          <button
            type="button"
            onClick={handleEdit}
            className="inline-flex items-center gap-2 py-3 px-6 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {t("result.changeCriteria")}
          </button>
        </div>
      );
    }

    if (result) {
      return (
        <div className="mx-auto max-w-6xl px-4 py-10">
          <EstimateResult data={result} onReset={handleEdit} />
        </div>
      );
    }
  }

  return (
    <PropertyForm
      variant="rentYieldCalculator"
      onBack={() => router.push("/")}
      initialValues={prefill}
      onSubmit={handleSubmit}
    />
  );
}

export default function CalculatorPage() {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = `${t("calculator.pageTitle")} | Catdai`;
  }, [t]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <Suspense>
          <CalculatorContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
