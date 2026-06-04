"use client";

import { useTranslation } from "@/context/LanguageContext";
import MarketPositionChart from "@/components/MarketPositionChart";

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="hidden h-5 w-5 shrink-0 text-gray-300 sm:block"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

const stepIcons = [
  <svg key="s1" viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="#2e7d32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>,
  <svg key="s2" viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="#2e7d32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polygon points="10 8 16 12 10 16 10 8" fill="#2e7d32" stroke="none" />
  </svg>,
  <svg key="s3" viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="#2e7d32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>,
  <svg key="s4" viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="#2e7d32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>,
];

const stepKeys = ["howItWorks.step1", "howItWorks.step2", "howItWorks.step3", "howItWorks.step4"];

export default function HowItWorks() {
  const { t } = useTranslation();

  return (
    <section className="py-16 px-4 text-center">
      <p className="mx-auto max-w-2xl text-lg text-gray-700">
        {t("howItWorks.intro")}
      </p>
      <div className="max-w-md mx-auto w-full mt-8 flex flex-col gap-3">
        <MarketPositionChart />
        <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-sm font-medium leading-5 text-emerald-800 shadow-sm sm:flex sm:justify-center sm:gap-2.5 sm:rounded-2xl sm:py-3.5 sm:text-center sm:text-[15px]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-100 sm:h-auto sm:w-auto sm:bg-transparent sm:shadow-none sm:ring-0">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
          <span>{t("howItWorks.independentData")}</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto bg-section-bg rounded-2xl py-6 px-4 mt-10 sm:py-10 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:justify-center sm:gap-6">
          {stepKeys.map((key, i) => (
            <div key={key} className="contents">
              <div className="flex min-w-0 flex-col items-center gap-2 rounded-xl border border-emerald-100 bg-white px-2.5 py-4 shadow-sm sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-light sm:h-14 sm:w-14">
                  {stepIcons[i]}
                </div>
                <span className="text-center text-xs font-medium leading-tight text-gray-600 sm:text-sm">
                  {t(key)}
                </span>
              </div>
              {i < stepKeys.length - 1 && <ArrowIcon />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
