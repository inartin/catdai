"use client";

import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useTranslation } from "@/context/LanguageContext";

const examples = [
  { src: "/images/example1.png", alt: "Apartament 2 camere · 50m² — €109.900" },
  { src: "/images/example3.png", alt: "Date cadastrale oficiale" },
  { src: "/images/example2.png", alt: "Apartament 1 cameră · 40m² — €61.500" },
];

export default function ExampleResults() {
  const { t } = useTranslation();
  const [lightbox, setLightbox] = useState(null);

  const open = useCallback((i) => setLightbox(i), []);
  const close = useCallback(() => setLightbox(null), []);

  return (
    <section className="pt-0 pb-16 px-4">
      <div className="max-w-5xl mx-auto text-center">
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          {t("examples.title")}
        </h2>
        <p className="text-sm text-gray-500 mb-10">
          {t("examples.subtitle")}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-8">
          <button
            type="button"
            onClick={() => open(0)}
            className="sm:-rotate-2 sm:translate-y-4 transition-transform duration-300 hover:rotate-0 hover:scale-105 rounded-2xl shadow-lg overflow-hidden bg-white w-72 sm:w-80 shrink-0 cursor-zoom-in"
          >
            <Image
              src={examples[0].src}
              alt={examples[0].alt}
              width={500}
              height={600}
              className="w-full h-auto"
            />
          </button>

          <button
            type="button"
            onClick={() => open(1)}
            className="z-10 transition-transform duration-300 hover:scale-105 rounded-2xl shadow-xl overflow-hidden bg-white w-72 sm:w-96 shrink-0 cursor-zoom-in"
          >
            <Image
              src={examples[1].src}
              alt={examples[1].alt}
              width={500}
              height={650}
              className="w-full h-auto"
            />
          </button>

          <button
            type="button"
            onClick={() => open(2)}
            className="sm:rotate-2 sm:translate-y-4 transition-transform duration-300 hover:rotate-0 hover:scale-105 rounded-2xl shadow-lg overflow-hidden bg-white w-72 sm:w-80 shrink-0 cursor-zoom-in"
          >
            <Image
              src={examples[2].src}
              alt={examples[2].alt}
              width={500}
              height={600}
              className="w-full h-auto"
            />
          </button>
        </div>
      </div>

      {lightbox !== null && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 cursor-zoom-out"
          onClick={close}
        >
          <div className="relative max-w-lg w-full max-h-[90vh] rounded-2xl overflow-hidden shadow-2xl bg-white">
            <Image
              src={examples[lightbox].src}
              alt={examples[lightbox].alt}
              width={800}
              height={960}
              className="w-full h-full object-contain"
            />
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}
