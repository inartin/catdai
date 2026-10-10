"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CadastruSourceNote from "@/components/CadastruSourceNote";
import CadastruSearchForm from "@/components/CadastruSearchForm";
import { useTranslation } from "@/context/LanguageContext";

const exampleImages = [
  {
    src: "/images/cadastru-result-example.png",
    altKey: "cadastru.infoExampleResultAlt",
  },
  {
    src: "/images/cadastru-nearby-example.png",
    altKey: "cadastru.infoExampleNearbyAlt",
  },
  {
    src: "/images/cadastru-transport-reports-example.png",
    altKey: "cadastru.infoExampleTransportReportsAlt",
  },
];

export default function CadastruPage() {
  const { t } = useTranslation();
  const [openImage, setOpenImage] = useState(null);

  useEffect(() => {
    if (!openImage) return undefined;

    function closeOnEscape(event) {
      if (event.key === "Escape") setOpenImage(null);
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
          <details className="group mt-6 rounded-2xl border border-gray-200 bg-white open:shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
              <h2 className="text-base">{t("cadastru.infoTitle")}</h2>
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </summary>
            <div className="px-5 pb-5 text-sm leading-6 text-gray-600">
              <span className="whitespace-pre-line">{t("cadastru.infoText")}</span>
              <div className="mt-4">
                <p className="mb-3 text-sm font-semibold text-gray-900">{t("cadastru.infoExampleLabel")}</p>
                <div className="space-y-4">
                  {exampleImages.map((image) => (
                    <button
                      key={image.src}
                      type="button"
                      onClick={() => setOpenImage(image)}
                      className="block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-blue-100 shadow-sm"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.src}
                        alt={t(image.altKey)}
                        loading="lazy"
                        className="w-full"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </details>
          <p className="mt-6 text-center text-sm text-gray-500">{t("cadastru.disclaimer")}</p>
        </section>
      </main>
      {openImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpenImage(null)}
        >
          <button
            type="button"
            aria-label="Close image"
            onClick={() => setOpenImage(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 px-3 py-1.5 text-2xl leading-none text-white transition-colors hover:bg-white/20"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={openImage.src}
            alt={t(openImage.altKey)}
            className="max-h-[92vh] max-w-[96vw] object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
      <Footer />
    </div>
  );
}
