"use client";

import { useTranslation } from "@/context/LanguageContext";

export default function MarketPositionChart() {
  const { t } = useTranslation();

  return (
    <div className="w-full rounded-2xl bg-white border border-gray-100 shadow-[0_4px_32px_rgba(0,0,0,0.06)] p-6 sm:p-8">
      <div className="relative pt-16">
        {/* Animated price marker */}
        <div
          className="absolute top-0 flex flex-col items-center"
          style={{
            left: "62%",
            animation:
              "hero-marker-enter 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.5s both",
          }}
        >
          <span className="px-4 py-1.5 rounded-full bg-primary text-white text-sm font-bold shadow-lg shadow-primary/25 whitespace-nowrap">
            {t("hero.yourPrice")}
          </span>
          <div className="w-px h-5 bg-linear-to-b from-primary to-primary/30 mt-1.5" />
          <div
            className="w-3.5 h-3.5 rounded-full bg-primary ring-[5px] ring-primary/10"
            style={{ animation: "hero-glow 2.5s ease-in-out infinite" }}
          />
        </div>

        {/* Gradient range bar */}
        <div
          className="h-4 rounded-full overflow-hidden"
          style={{
            animation: "hero-bar-reveal 0.9s ease-out 0.2s both",
          }}
        >
          <div
            className="h-full rounded-full"
            style={{
              background:
                "linear-gradient(90deg, #a5d6a7 0%, #66bb6a 25%, #43a047 45%, #8bc34a 60%, #fdd835 80%, #ffb74d 100%)",
            }}
          />
        </div>

        {/* Zone labels */}
        <div className="grid grid-cols-3 mt-3.5">
          <span className="text-xs text-gray-400 text-left">
            {t("hero.zoneFastSale")}
          </span>
          <span className="text-xs text-primary font-semibold text-center">
            {t("hero.zoneMarketPrice")}
          </span>
          <span className="text-xs text-gray-400 text-right">
            {t("hero.zonePremium")}
          </span>
        </div>
      </div>
    </div>
  );
}
