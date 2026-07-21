"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CadastruSourceNote from "@/components/CadastruSourceNote";
import CadastruSearchForm from "@/components/CadastruSearchForm";
import InfoCallout from "@/components/InfoCallout";
import { useTranslation } from "@/context/LanguageContext";

export default function CadastruPage() {
  const { t } = useTranslation();
  const [openImage, setOpenImage] = useState(false);

  useEffect(() => {
    if (!openImage) return undefined;

    function closeOnEscape(event) {
      if (event.key === "Escape") setOpenImage(false);
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [openImage]);

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

          <CadastruSearchForm allowAnonymousSearch />
          <CadastruSourceNote />
          <InfoCallout title={t("cadastru.infoTitle")} className="mt-6">
            <span className="whitespace-pre-line">{t("cadastru.infoText")}</span>
            <div className="mt-4">
              <p className="mb-3 text-sm font-semibold text-gray-900">{t("cadastru.infoExampleLabel")}</p>
              <button
                type="button"
                onClick={() => setOpenImage(true)}
                className="block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-blue-100 shadow-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://dmobbyzdlhjruqqsgffp.supabase.co/storage/v1/object/public/img/1780413983931-5bd2cba6370a-Screenshot_2026-06-01_at_17.31.33.png"
                  alt="Cadastru result example"
                  className="w-full"
                />
              </button>
            </div>
          </InfoCallout>
          <p className="mt-6 text-center text-sm text-gray-500">{t("cadastru.disclaimer")}</p>
        </section>
      </main>
      {openImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenImage(false)}
        >
          <button
            type="button"
            aria-label="Close image"
            onClick={() => setOpenImage(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1.5 text-2xl leading-none text-white transition-colors hover:bg-white/20"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://dmobbyzdlhjruqqsgffp.supabase.co/storage/v1/object/public/img/1780413983931-5bd2cba6370a-Screenshot_2026-06-01_at_17.31.33.png"
            alt="Cadastru result example"
            className="max-h-[92vh] max-w-[96vw] object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
      <Footer />
    </div>
  );
}
