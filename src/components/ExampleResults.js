"use client";

import Image from "next/image";
import { useTranslation } from "@/context/LanguageContext";

export default function ExampleResults() {
  const { t } = useTranslation();

  return (
    <section className="py-16 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          {t("examples.title")}
        </h2>
        <p className="text-sm text-gray-500 mb-10">
          {t("examples.subtitle")}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
          <div className="sm:-rotate-2 transition-transform duration-300 hover:rotate-0 hover:scale-105 rounded-2xl shadow-lg overflow-hidden bg-white max-w-xs">
            <Image
              src="/images/example1.png"
              alt="Apartament 2 camere · 50m² — €109.900"
              width={400}
              height={480}
              className="w-full h-auto"
            />
          </div>

          <div className="sm:rotate-2 transition-transform duration-300 hover:rotate-0 hover:scale-105 rounded-2xl shadow-lg overflow-hidden bg-white max-w-xs">
            <Image
              src="/images/example2.png"
              alt="Apartament 1 cameră · 40m² — €61.500"
              width={400}
              height={480}
              className="w-full h-auto"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
