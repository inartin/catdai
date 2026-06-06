"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CadastruSourceNote from "@/components/CadastruSourceNote";
import CadastruSearchForm from "@/components/CadastruSearchForm";
import { useTranslation } from "@/context/LanguageContext";

export default function CadastruPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-4xl px-6 pb-12 pt-8 sm:pb-16 sm:pt-10 lg:pb-20 lg:pt-12">
          <div className="mb-6">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">
              {t("cadastru.pageTitle")}
            </h1>
            <p className="mt-3 max-w-2xl text-base text-gray-600">
              {t("cadastru.subtitle")}
            </p>
          </div>

          <CadastruSearchForm />
          <CadastruSourceNote />
        </section>
      </main>
      <Footer />
    </div>
  );
}
