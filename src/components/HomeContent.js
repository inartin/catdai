"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Hero from "@/components/Hero";
import CategoryCards from "@/components/CategoryCards";
import HowItWorks from "@/components/HowItWorks";
import ExampleResults from "@/components/ExampleResults";
import LandingFaqPreview from "@/components/LandingFaqPreview";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { ArrowRight } from "@/components/icons/ArrowsIcons";
import { useTranslation } from "@/context/LanguageContext";
import { trackAdSourceEvent } from "@/lib/tracking";

function ListingAlertsTeaser() {
  const { t } = useTranslation();
  const alertFilters = [
    { label: t("result.budget"), value: "€60k-90k" },
    { label: t("result.maxPricePerM2"), value: "€1 650" },
    { label: t("form.floor"), value: t("result.floorRange", { from: 2, to: 7 }) },
    { label: t("result.sellerTypeFilter"), value: t("result.sellerType.owner") },
  ];

  return (
    <section className="px-4 pb-16">
      <div className="mx-auto mb-6 max-w-5xl text-center">
        <h2 className="mb-2 text-xl font-bold text-gray-800">
          {t("landing.alertTitle")}
        </h2>
      </div>
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-11">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-primary shadow-sm">
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_rgba(67,160,71,0.14)]" />
              {t("landing.alertEyebrow")}
            </div>

            <p className="mt-4 max-w-xl text-base leading-7 text-gray-600">
              {t("landing.alertDesc")}
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {alertFilters.map((filter) => (
                <div
                  key={filter.label}
                  className="rounded-2xl border border-white bg-white/75 p-3 shadow-sm ring-1 ring-gray-900/5 backdrop-blur"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {filter.label}
                  </p>
                  <p className="mt-1 text-sm font-bold text-gray-900">
                    {filter.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-12 flex flex-col gap-3 sm:mt-14 sm:flex-row">
              <Link
                href="/alerts"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-700/15 transition-colors hover:bg-primary-dark"
              >
                {t("landing.alertPrimaryCta")}
                <ArrowRight size={15} />
              </Link>
              <Link
                href="https://t.me/catdaimd"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-5 py-3 text-sm font-bold text-[#157EAA] transition-colors hover:border-[#1997CA] hover:bg-sky-50"
              >
                <TelegramIcon size={20} />
                {t("landing.alertTelegramCta")}
              </Link>
            </div>
          </div>

          <div className="relative flex min-h-[360px] items-center justify-center bg-gray-950 px-5 py-8 sm:px-8 lg:px-10">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(67,160,71,0.28),transparent_38%),linear-gradient(315deg,rgba(25,151,202,0.30),transparent_42%)]" />
            <div className="relative w-full max-w-sm rounded-[1.75rem] border border-white/10 bg-white/10 p-3 shadow-2xl backdrop-blur">
              <div className="rounded-[1.35rem] bg-white p-4 shadow-xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-[#1997CA]">
                      {t("landing.telegramNotif")}
                    </p>
                    <h3 className="mt-2 text-lg font-extrabold text-gray-950">
                      {t("profile.alertFilters")}
                    </h3>
                  </div>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-[#1997CA]">
                    <TelegramIcon size={23} />
                  </span>
                </div>

                <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">
                        {t("result.listingPreviewTitleA", { location: "Chișinău" })}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {t("result.listingPreviewMetaA")}
                      </p>
                    </div>
                    <p className="shrink-0 text-lg font-extrabold tabular-nums text-primary">
                      €76 900
                    </p>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                    <div className="h-full w-3/4 rounded-full bg-primary" />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {alertFilters.map((filter) => (
                    <div
                      key={filter.label}
                      className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 px-3 py-2"
                    >
                      <span className="text-xs font-semibold text-gray-500">
                        {filter.label}
                      </span>
                      <span className="text-xs font-bold text-gray-950">
                        {filter.value}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex items-center gap-3 rounded-2xl bg-emerald-50 px-3 py-3">
                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                    <span className="h-2.5 w-2.5 rounded-full bg-white" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-emerald-950">
                      {t("result.alertSaved")}
                    </p>
                    <p className="text-xs font-medium text-emerald-700">
                      {t("profile.telegramNotifications")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MarketScopeCards() {
  const { t } = useTranslation();
  const scopes = [
    {
      key: "sell",
      title: t("landing.scopeSellTitle"),
      desc: t("landing.scopeSellDesc"),
      accent: "border-emerald-100 bg-emerald-50 text-emerald-700",
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h18" />
          <path d="m14 5 7 7-7 7" />
        </svg>
      ),
    },
    {
      key: "buy",
      title: t("landing.scopeBuyTitle"),
      desc: t("landing.scopeBuyDesc"),
      accent: "border-sky-100 bg-sky-50 text-sky-700",
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 12V8H6a2 2 0 0 1 0-4h14v4" />
          <path d="M4 6v12a2 2 0 0 0 2 2h14v-4" />
          <path d="M18 12h.01" />
        </svg>
      ),
    },
    {
      key: "rent",
      title: t("landing.scopeRentTitle"),
      desc: t("landing.scopeRentDesc"),
      badge: t("categories.comingSoon"),
      accent: "border-amber-100 bg-amber-50 text-amber-700",
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11 12 3l9 8" />
          <path d="M5 10v10h14V10" />
          <path d="M9 20v-6h6v6" />
        </svg>
      ),
    },
  ];

  return (
    <section className="px-4 pb-8">
      <div className="mx-auto grid max-w-5xl gap-3 sm:grid-cols-3">
        {scopes.map((scope) => (
          <div
            key={scope.key}
            className="rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm"
          >
            <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl border ${scope.accent}`}>
              {scope.icon}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-extrabold text-gray-950">
                {scope.title}
              </h2>
              {scope.badge && (
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-extrabold text-sky-700 ring-1 ring-sky-100">
                  {scope.badge}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              {scope.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HomeContent() {
  const router = useRouter();

  const handleCategorySelect = useCallback((category) => {
    if (category === "imobil") {
      trackAdSourceEvent("landing_estimate_cta");
      router.push("/estimeaza");
    }
  }, [router]);

  return (
    <div className="animate-fade-in">
      <Hero onPrimaryCta={() => handleCategorySelect("imobil")} />
      <MarketScopeCards />
      <CategoryCards onCategorySelect={handleCategorySelect} />
      <HowItWorks />
      <ExampleResults />
      <ListingAlertsTeaser />
      <LandingFaqPreview />
    </div>
  );
}
