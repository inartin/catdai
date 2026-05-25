"use client";

import { useTranslation } from "@/context/LanguageContext";
import { ArrowRight } from "@/components/icons/ArrowsIcons";

export default function Hero({ onPrimaryCta }) {
  const { t } = useTranslation();

  return (
    <section className="pt-16 pb-10 text-center px-4">
      <h1 className="mx-auto max-w-4xl text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
        {t("hero.title")}
      </h1>
      <p className="mt-4 text-lg text-gray-500">
        {t("hero.subtitle")}
      </p>
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
