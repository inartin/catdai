"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTranslation } from "@/context/LanguageContext";

export default function AboutPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-6 py-16 sm:py-20">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 sm:p-10 shadow-sm">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              {t("about.title")}
            </h1>
            <p className="mt-4 text-base sm:text-lg text-gray-600">
              {t("about.intro")}
            </p>

            <div className="mt-10 space-y-8">
              <section>
                <h2 className="text-xl font-semibold tracking-tight">
                  {t("about.dataSourcesTitle")}
                </h2>
                <p className="mt-3 text-gray-600">
                  {t("about.dataSourcesBody")}
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold tracking-tight">
                  {t("about.howItWorksTitle")}
                </h2>
                <p className="mt-3 text-gray-600">
                  {t("about.howItWorksBody")}
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold tracking-tight">
                  {t("about.disclaimerTitle")}
                </h2>
                <p className="mt-3 text-gray-600">
                  {t("about.disclaimerBody")}
                </p>
              </section>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
