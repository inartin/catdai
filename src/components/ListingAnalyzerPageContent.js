"use client";

import { useEffect } from "react";
import ListingSeoSections from "@/app/verifica-anunt/ListingSeoSections";
import { listingPageCopy } from "@/app/verifica-anunt/content";
import { useRouter } from "next/navigation";
import BackButton from "@/components/BackButton";
import LinkAnalyzer from "@/components/LinkAnalyzer";
import { useTranslation } from "@/context/LanguageContext";

export default function ListingAnalyzerPageContent({ showEstimateBack = false }) {
  const router = useRouter();
  const { t, lang } = useTranslation();
  const copy = listingPageCopy[lang];

  useEffect(() => {
    document.title = copy.title;
  }, [copy.title]);

  // Keep the navbar language choice on the matching indexable URL.
  useEffect(() => {
    const urlLang = window.location.pathname.startsWith("/ru/") ? "ru" : "ro";
    if (lang === urlLang) return;
    const path = lang === "ru" ? "/ru/verifica-anunt" : "/verifica-anunt";
    window.location.assign(`${path}${window.location.search}${window.location.hash}`);
  }, [lang]);

  return (
    <div lang={lang} className="mx-auto w-full max-w-5xl">
      {showEstimateBack && (
        <BackButton onClick={() => router.push("/estimeaza")} className="mb-6">
          {t("form.back")}
        </BackButton>
      )}
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold tracking-[0.16em] text-emerald-700">{copy.eyebrow}</p>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-gray-950 sm:text-5xl sm:leading-tight">{copy.heading}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-gray-600">{copy.intro}</p>
        </div>
        <div id="verifica-link" className="scroll-mt-24">
          <LinkAnalyzer showFeaturePapers prominent />
        </div>
      </div>
      <ListingSeoSections copy={copy} />
    </div>
  );
}
