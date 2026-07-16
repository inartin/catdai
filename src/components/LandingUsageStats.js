"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/context/LanguageContext";

const statIcons = {
  evaluations: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z" />
      <path d="M8 7h8M8 11h6" />
      <path d="m14 17 2 2 4-4" />
    </svg>
  ),
  cadastruSearches: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-6h6v6" />
    </svg>
  ),
  listingLinkAnalyses: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  ),
};

function formatNumber(value, lang) {
  return new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "ro-RO").format(value);
}

export default function LandingUsageStats() {
  const { t, lang } = useTranslation();
  const [stats, setStats] = useState(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/landing-stats", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => setStats(data))
      .catch((error) => {
        if (error.name !== "AbortError") setUnavailable(true);
      });

    return () => controller.abort();
  }, []);

  if (unavailable) return null;

  const items = [
    { key: "evaluations", value: stats?.evaluations, label: t("landing.statsEvaluations") },
    { key: "cadastruSearches", value: stats?.cadastruSearches, label: t("landing.statsCadastru") },
    { key: "listingLinkAnalyses", value: stats?.listingLinkAnalyses, label: t("landing.stats999") },
  ];

  return (
    <section className="px-4 pb-8 text-center sm:pb-12">
      <div className="mx-auto max-w-4xl">
           <h2 className="mt-3 text-xl font-bold text-gray-800">
          {t("landing.statsTitle")}
        </h2>
        <div className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-primary" />
          {t("landing.statsAllTime")}
        </div>
     
        {/* <p className="mt-2 text-sm text-gray-500">
          {t("landing.statsSubtitle")}
        </p> */}

        <div className="mt-8 grid overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-lg sm:grid-cols-3">
          {items.map((item, index) => (
            <div
              key={item.key}
              className={`px-5 py-7 ${index > 0 ? "border-t border-gray-100 sm:border-l sm:border-t-0" : ""}`}
            >
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-primary">
                {statIcons[item.key]}
              </span>
              {item.value == null ? (
                <span className="mx-auto mt-4 block h-12 w-32 animate-pulse rounded-lg bg-gray-100" />
              ) : (
                <strong className="mt-4 block text-5xl font-extrabold tracking-tight text-gray-900 tabular-nums sm:text-4xl lg:text-5xl">
                  {formatNumber(item.value, lang)}
                </strong>
              )}
              <p className="mt-2 text-sm font-semibold text-gray-500">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
