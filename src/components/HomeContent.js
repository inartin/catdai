"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Hero from "@/components/Hero";
import CategoryCards from "@/components/CategoryCards";
import HowItWorks from "@/components/HowItWorks";
import ExampleResults from "@/components/ExampleResults";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { ArrowRight } from "@/components/icons/ArrowsIcons";
import { useTranslation } from "@/context/LanguageContext";

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
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-11">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-primary shadow-sm">
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_rgba(67,160,71,0.14)]" />
              {t("landing.alertEyebrow")}
            </div>

            <h2 className="mt-5 max-w-xl text-3xl font-extrabold leading-tight tracking-tight text-gray-950 sm:text-4xl">
              {t("landing.alertTitle")}
            </h2>
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

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
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
      <ListingAlertsTeaser />
    </div>
  );
}
