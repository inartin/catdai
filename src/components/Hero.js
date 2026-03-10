"use client";

import { useTranslation } from "@/context/LanguageContext";

export default function Hero() {
  const { t } = useTranslation();

  return (
    <section className="pt-16 pb-10 text-center px-4">
      <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
        {t("hero.title")}
      </h1>
      <p className="mt-4 text-lg text-gray-500">
        {t("hero.subtitle")}
      </p>
    </section>
  );
}
