"use client";

import { useTranslation } from "@/context/LanguageContext";
import { useLivePrices } from "@/lib/useLivePrices";

const TREND_ARROWS = { up: "↑", down: "↓", stable: "→" };
const TREND_COLORS = { up: "text-emerald-400/40", down: "text-red-400/40", stable: "text-gray-300/40" };

function formatListings(n) {
  if (!n) return "—";
  if (n >= 1000) return `~${Math.round(n / 1000)}k`;
  return String(n);
}

function timeAgo(isoString, t) {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return t("categories.lastUpdatedJustNow");
  if (mins < 60) return t("categories.lastUpdatedMins", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("categories.lastUpdatedHours", { count: hours });
  const days = Math.floor(hours / 24);
  return t("categories.lastUpdatedDays", { count: days });
}

function LivePriceBadge({ t, priceData }) {
  const cn = priceData?.constructii_noi?.median_ppm;
  const sec = priceData?.secundar?.median_ppm;
  const trend = priceData?.trend;
  const total = priceData?.total_active;
  return (
    <div className="absolute bottom-0 left-0 right-0 z-10" style={{ transform: "translateY(8px)" }}>
      <div
        className="px-3 py-2"
        style={{
          background: "rgba(10, 20, 15, 0.6)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          border: "1px solid rgba(74, 222, 128, 0.1)",
        }}
      >
        <div className="group/tip relative flex items-center gap-1.5">
          {priceData?.updated_at && (
            <span className="pointer-events-none absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium whitespace-nowrap shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
              {timeAgo(priceData.updated_at, t)}
              <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-gray-900" />
            </span>
          )}
          <span className="relative inline-flex w-2.5 h-2.5 shrink-0 items-center justify-center">
            <span
              className="absolute w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: "#4ade80",
                boxShadow: "0 0 6px 2px rgba(74, 222, 128, 0.7), 0 0 12px 4px rgba(74, 222, 128, 0.35)",
                animation: "live-glow 2s ease-in-out infinite",
              }}
            />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
            {t("categories.livePrices")}
          </span>
          <span className="text-[10px] text-white/70 ml-auto">Chișinău · {t("categories.today")}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-x-4 mt-1.5 leading-tight">
          <span className="text-[10px] text-gray-200">{t("categories.newConstruction")}</span>
          <span className="text-xs font-bold text-white tabular-nums text-right">€{cn ?? "—"}<span className="text-[9px] font-medium text-gray-300">/m²</span>{trend && <>{" "}<span className={`${TREND_COLORS[trend.direction] || TREND_COLORS.stable} text-[8px]`}>{TREND_ARROWS[trend.direction] || "→"}</span></>}</span>
          <span className="text-[10px] text-gray-200">{t("categories.secondary")}</span>
          <span className="text-xs font-bold text-white tabular-nums text-right">€{sec ?? "—"}<span className="text-[9px] font-medium text-gray-300">/m²</span>{trend && <>{" "}<span className={`${TREND_COLORS[trend.direction] || TREND_COLORS.stable} text-[8px]`}>{TREND_ARROWS[trend.direction] || "→"}</span></>}</span>
        </div>
        <div className="mt-1 border-t border-white/10 pt-1">
          <span className="text-[9px] text-white/40">{formatListings(total)} {t("categories.listingsAnalyzed")}</span>
        </div>
      </div>
    </div>
  );
}

function EvalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

export default function CategoryCards({ onCategorySelect }) {
  const { t } = useTranslation();
  const { data: priceData } = useLivePrices();

  const categories = [
    {
      id: "auto",
      name: t("categories.auto"),
      cta: t("categories.autoAnalysis"),
      gradient: "from-red-200 to-red-400",
      backgroundImage: "/images/cd-auto.webp",
      iconBg: "bg-red-500",
      disabled: true,
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 17h10M5 13l1.5-5h11L19 13M5 13h14v4H5z" />
          <circle cx="7.5" cy="17" r="1.5" />
          <circle cx="16.5" cy="17" r="1.5" />
        </svg>
      ),
    },
    {
      id: "imobil",
      name: t("categories.realEstate"),
      cta: t("categories.realEstateAnalysis"),
      gradient: "from-green-200 to-emerald-400",
      backgroundImage: "/images/cd-imobil.webp",
      iconBg: "bg-green-600",
      disabled: false,
      highlighted: true,
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      id: "electronics",
      name: t("categories.electronics"),
      cta: t("categories.electronicsAnalysis"),
      gradient: "from-blue-200 to-indigo-300",
      backgroundImage: "/images/CD-electronics.webp",
      iconBg: "bg-amber-500",
      disabled: true,
      icon: (
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
      ),
    },
  ];

  return (
    <section className="pb-8 px-4">
      <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
        {categories.map((cat) => {
          const isActive = !cat.disabled;

          return (
            <div key={cat.id} className={`group/card w-full h-full min-w-0 ${cat.highlighted ? "z-10 sm:scale-110 -order-1 sm:order-none" : ""}`}>
              <button
                type="button"
                disabled={cat.disabled}
                onClick={() => isActive && onCategorySelect?.(cat.id)}
                className={`relative w-full h-full rounded-2xl overflow-hidden bg-white border border-gray-100 text-left transition-all duration-200 ${cat.highlighted
                  ? "shadow-lg hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                  : isActive
                    ? "shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
                    : "cursor-default"
                  }`}
              >
                {cat.disabled && (
                  <span className="absolute top-3 right-3 z-20 bg-white border border-gray-200 text-xs font-semibold text-gray-700 px-3 py-1.5 rounded-full shadow-md">
                    {t("categories.comingSoon")}
                  </span>
                )}

                <div className={cat.disabled ? "opacity-60" : ""}>
                  <div className="relative">
                    <div
                      className={`${cat.highlighted ? "h-52" : "h-44"} ${cat.backgroundImage ? "bg-cover bg-center bg-no-repeat" : `bg-linear-to-br ${cat.gradient}`} ${cat.disabled && cat.backgroundImage ? "grayscale group-hover/card:grayscale-0 transition-[filter] duration-300" : ""}`}
                      style={cat.backgroundImage ? { backgroundImage: `url(${cat.backgroundImage})` } : undefined}
                    />
                    {cat.id === "imobil" && <LivePriceBadge t={t} priceData={priceData} />}
                  </div>

                  <div className="px-5 pt-5 pb-5 text-center space-y-3">
                    <div className="flex items-center justify-center gap-2">
                      <span
                        className={`w-7 h-7 rounded-md ${cat.iconBg} flex items-center justify-center`}
                      >
                        {cat.icon}
                      </span>
                      <span className="font-bold text-base">{cat.name}</span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 font-medium text-sm ${isActive
                        ? "text-primary"
                        : "text-gray-400"
                        }`}
                    >
                      <EvalIcon />
                      {cat.cta}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}