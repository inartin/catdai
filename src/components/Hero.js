"use client";

import { useTranslation } from "@/context/LanguageContext";
import { ArrowRight } from "@/components/icons/ArrowsIcons";

export default function Hero({ onPrimaryCta }) {
  const { t } = useTranslation();
  const scopes = [
    { label: t("hero.scopeSell") },
    { label: t("hero.scopeBuy") },
    { label: t("hero.scopeRent"), badge: t("categories.comingSoon") },
  ];

  return (
    <section className="px-4 pb-10 pt-16 text-center">
      <h1 className="mx-auto max-w-4xl text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
        {t("hero.title")}
      </h1>
      <p className="mx-auto mt-4 max-w-3xl text-lg leading-8 text-gray-500">
        {t("hero.subtitle")}
      </p>
      <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-2">
        {scopes.map((scope) => (
          <span
            key={scope.label}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 shadow-sm"
          >
            {scope.label}
            {scope.badge && (
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-extrabold text-sky-700 ring-1 ring-sky-100">
                {scope.badge}
              </span>
            )}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onPrimaryCta}
        className="mx-auto mt-7 inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-4 text-base font-extrabold text-white shadow-xl shadow-emerald-700/20 transition-colors hover:bg-primary-dark sm:w-auto sm:min-w-80"
      >
        {t("hero.cta")}
        <ArrowRight size={18} className="translate-y-[-1px]" />
      </button>
    </section>
  );
}
