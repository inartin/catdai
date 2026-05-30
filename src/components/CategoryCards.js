"use client";

import { useState } from "react";
import { useTranslation } from "@/context/LanguageContext";
import { useLivePrices } from "@/lib/useLivePrices";
import { useMarketTrends } from "@/lib/useMarketTrends";
import { ArrowRight } from "@/components/icons/ArrowsIcons";

const TREND_ARROWS = { up: "↑", down: "↓", stable: "→" };
const TREND_COLORS = { up: "text-emerald-400/40", down: "text-red-400/40", stable: "text-gray-300/40" };
const MARKET_SERIES = {
  constructii_noi: {
    line: "#059669",
    textClass: "text-emerald-700",
    unitClass: "text-emerald-700/60",
    chipClass: "bg-emerald-50 text-emerald-700",
  },
  secundar: {
    line: "#2563eb",
    textClass: "text-blue-700",
    unitClass: "text-blue-700/60",
    chipClass: "bg-blue-50 text-blue-700",
  },
};

function formatListings(n) {
  if (!n) return "—";
  if (n >= 1000) return `~${Math.round(n / 1000)}k`;
  return String(n);
}

function formatPrice(num) {
  const value = Number(num);
  if (!Number.isFinite(value)) return "—";
  return "€" + Math.round(value).toLocaleString("ro-MD");
}

function formatTrendPercent(num) {
  const value = Number(num);
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatTrendDate(date, lang) {
  if (!date) return "";
  return new Date(`${date}T00:00:00`).toLocaleDateString(
    lang === "ru" ? "ru-RU" : "ro-RO",
    { day: "2-digit", month: "short" }
  );
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
          <span className="text-[11px] text-white/70 ml-auto">Chișinău · {t("categories.today")}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-x-4 mt-2 leading-tight items-baseline">
          <span className="text-[11px] text-gray-200">{t("categories.newConstruction")}</span>
          <span className="text-[15px] font-bold text-white tabular-nums text-right">€{cn ?? "—"}<span className="text-[10px] font-medium text-gray-300 ml-0.5">/m²</span>{trend && <>{" "}<span className={`${TREND_COLORS[trend.direction] || TREND_COLORS.stable} text-[10px]`}>{TREND_ARROWS[trend.direction] || "→"}</span></>}</span>
          <span className="text-[11px] text-gray-200 mt-0.5">{t("categories.secondary")}</span>
          <span className="text-[15px] font-bold text-white tabular-nums text-right mt-0.5">€{sec ?? "—"}<span className="text-[10px] font-medium text-gray-300 ml-0.5">/m²</span>{trend && <>{" "}<span className={`${TREND_COLORS[trend.direction] || TREND_COLORS.stable} text-[10px]`}>{TREND_ARROWS[trend.direction] || "→"}</span></>}</span>
        </div>
        <div className="mt-1.5 border-t border-white/10 pt-1">
          <span className="text-[10px] text-white/40">{formatListings(total)} {t("categories.listingsAnalyzed")}</span>
        </div>
      </div>
    </div>
  );
}

function LivePricePanel({ t, priceData }) {
  const cn = priceData?.constructii_noi?.median_ppm;
  const sec = priceData?.secundar?.median_ppm;
  const trend = priceData?.trend;
  const total = priceData?.total_active;

  return (
    <div className="flex h-full flex-col justify-between gap-5 p-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span
              className="absolute h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: "#22c55e",
                boxShadow: "0 0 6px 2px rgba(34, 197, 94, 0.45), 0 0 12px 4px rgba(34, 197, 94, 0.18)",
                animation: "live-glow 2s ease-in-out infinite",
              }}
            />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">
            {t("categories.livePrices")}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-4 border-b border-gray-100 pb-3">
          <span className={`text-sm font-semibold ${MARKET_SERIES.constructii_noi.textClass}`}>
            {t("categories.newConstruction")}
          </span>
          <span className={`text-2xl font-bold tabular-nums ${MARKET_SERIES.constructii_noi.textClass}`}>
            €{cn ?? "—"}
            <span className={`ml-1 text-xs font-semibold ${MARKET_SERIES.constructii_noi.unitClass}`}>/m²</span>
            {trend && (
              <span className={`${TREND_COLORS[trend.direction] || TREND_COLORS.stable} ml-1 text-sm`}>
                {TREND_ARROWS[trend.direction] || "→"}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className={`text-sm font-semibold ${MARKET_SERIES.secundar.textClass}`}>
            {t("categories.secondary")}
          </span>
          <span className={`text-2xl font-bold tabular-nums ${MARKET_SERIES.secundar.textClass}`}>
            €{sec ?? "—"}
            <span className={`ml-1 text-xs font-semibold ${MARKET_SERIES.secundar.unitClass}`}>/m²</span>
            {trend && (
              <span className={`${TREND_COLORS[trend.direction] || TREND_COLORS.stable} ml-1 text-sm`}>
                {TREND_ARROWS[trend.direction] || "→"}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
        {formatListings(total)} {t("categories.listingsAnalyzed")}
      </div>
    </div>
  );
}

function normalizeTrendPoints(trend) {
  return Array.isArray(trend?.points)
    ? trend.points
      .map((point) => ({
        date: point.date,
        value: Number(point.value),
      }))
      .filter((point) => point.date && Number.isFinite(point.value) && point.value > 0)
    : [];
}

function buildCombinedChartPoints(points, dateIndex, minValue, maxValue, width, height, padding, rightPadding) {
  const span = maxValue - minValue;

  return points.map((point) => {
    const index = dateIndex.get(point.date);
    const x = padding + (index / Math.max(dateIndex.size - 1, 1)) * (width - padding - rightPadding);
    const y = span === 0
      ? height / 2
      : height - padding - ((point.value - minValue) / span) * (height - padding * 2);

    return { ...point, x, y };
  });
}

function LandingTrendCharts({ t, lang, trendData }) {
  const [activePoint, setActivePoint] = useState(null);
  const trends = trendData?.trends || {};
  const series = [
    {
      key: "constructii_noi",
      label: t("categories.newConstruction"),
      trend: trends.constructii_noi,
      points: normalizeTrendPoints(trends.constructii_noi),
      color: MARKET_SERIES.constructii_noi.line,
      chipClass: MARKET_SERIES.constructii_noi.chipClass,
    },
    {
      key: "secundar",
      label: t("categories.secondary"),
      trend: trends.secundar,
      points: normalizeTrendPoints(trends.secundar),
      color: MARKET_SERIES.secundar.line,
      chipClass: MARKET_SERIES.secundar.chipClass,
    },
  ];
  const drawableSeries = series.filter((item) => item.points.length >= 2);

  if (drawableSeries.length === 0) {
    return (
      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-gray-400">{t("result.trendPeriod", { days: trendData?.period_days || 30 })}</span>
          <span className="text-xs font-semibold text-gray-400">{t("result.noData")}</span>
        </div>
      </div>
    );
  }

  const allPoints = drawableSeries.flatMap((item) => item.points);
  const values = allPoints.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const allDates = [...new Set(allPoints.map((point) => point.date))].sort();
  const dateIndex = new Map(allDates.map((date, index) => [date, index]));
  const width = 220;
  const height = 156;
  const padding = 6;
  const rightPadding = 48;
  const firstDate = allDates[0];
  const lastDate = allDates[allDates.length - 1];
  const chartSeries = drawableSeries.map((item) => {
    const chartPoints = buildCombinedChartPoints(
      item.points,
      dateIndex,
      minValue,
      maxValue,
      width,
      height,
      padding,
      rightPadding
    );

    return {
      ...item,
      chartPoints,
      coords: chartPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "),
    };
  });
  const constructiiNoi = series.find((item) => item.key === "constructii_noi");
  const secundar = series.find((item) => item.key === "secundar");

  return (
    <div className="mt-5">
      <p className="text-[11px] text-gray-400">
        {t("result.trendPeriod", { days: trendData?.period_days || 30 })}
      </p>

      <div className="relative mt-4 h-40 w-full">
        {constructiiNoi?.points.length >= 2 && (
          <span className={`absolute right-0 top-0 z-10 rounded-lg px-2 py-1 text-xs font-bold ${constructiiNoi.chipClass}`}>
            {formatTrendPercent(constructiiNoi.trend?.change_pct)}
          </span>
        )}
        {secundar?.points.length >= 2 && (
          <span className={`absolute bottom-1 right-0 z-10 rounded-lg px-2 py-1 text-xs font-bold ${secundar.chipClass}`}>
            {formatTrendPercent(secundar.trend?.change_pct)}
          </span>
        )}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          role="img"
          aria-label={t("result.trendPeriod", { days: trendData?.period_days || 30 })}
        >
          <line x1="0" y1={height - padding} x2={width - rightPadding} y2={height - padding} stroke="#111827" strokeOpacity="0.08" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {chartSeries.map((item) => (
            <polyline
              key={item.key}
              points={item.coords}
              fill="none"
              stroke={item.color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {chartSeries.map((item) => (
          item.chartPoints.map((point) => (
            <button
              key={`${item.key}-${point.date}-${point.value}`}
              type="button"
              aria-label={`${formatTrendDate(point.date, lang)} ${formatPrice(point.value)}/m²`}
              className="group absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none"
              style={{
                left: `${(point.x / width) * 100}%`,
                top: `${(point.y / height) * 100}%`,
              }}
              onMouseEnter={() => setActivePoint({ ...point, label: item.label, color: item.color })}
              onMouseLeave={() => setActivePoint(null)}
              onFocus={() => setActivePoint({ ...point, label: item.label, color: item.color })}
              onBlur={() => setActivePoint(null)}
            >
              <span
                className="block h-2.5 w-2.5 translate-x-[5px] translate-y-[5px] rounded-full border-2 bg-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
                style={{ borderColor: item.color }}
              />
            </button>
          ))
        ))}
        {activePoint && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg bg-gray-900 px-2.5 py-1.5 text-center text-[11px] font-medium leading-tight text-white shadow-lg"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
              top: `${(activePoint.y / height) * 100}%`,
            }}
          >
            <span className="block whitespace-nowrap font-semibold">{activePoint.label}</span>
            <span className="block whitespace-nowrap">{formatTrendDate(activePoint.date, lang)}</span>
            <span className="block whitespace-nowrap">{formatPrice(activePoint.value)}/m²</span>
          </div>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] leading-none text-gray-400">
        <span>{formatTrendDate(firstDate, lang)}</span>
        <span>{formatTrendDate(lastDate, lang)}</span>
      </div>
    </div>
  );
}

export default function CategoryCards({ onCategorySelect }) {
  const { t, lang } = useTranslation();
  const { data: priceData } = useLivePrices();
  const { data: trendData } = useMarketTrends();
  const realEstateScopes = [
    { label: t("categories.scopeSale") },
    { label: t("categories.scopeBuy") },
    { label: t("categories.scopeRent"), badge: t("categories.comingSoon") },
  ];

  const trackSubmitLeadForm = () => {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("event", "SUBMIT_LEAD_FORM");
  };

  const categories = [
    {
      id: "auto",
      name: t("categories.auto"),
      cta: t("categories.autoAnalysis"),
      gradient: "from-red-200 to-red-400",
      backgroundImage: "/images/cd-auto.webp",
      iconBg: "bg-red-500",
      disabled: true,
      showOnLanding: false,
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
      showOnLanding: true,
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
      backgroundImage: "/images/cd-electronics.webp",
      iconBg: "bg-amber-500",
      disabled: true,
      showOnLanding: false,
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

  const visibleCategories = categories.filter((cat) => cat.showOnLanding !== false);

  return (
    <section className="pb-8 px-4">
      <div className="max-w-4xl mx-auto grid grid-cols-1 gap-6">
        {visibleCategories.map((cat) => {
          const isActive = !cat.disabled;

          return (
            <div key={cat.id} className="group/card w-full min-w-0">
              <button
                type="button"
                disabled={cat.disabled}
                onClick={() => {
                  if (!isActive) return;
                  if (cat.id === "imobil") trackSubmitLeadForm();
                  onCategorySelect?.(cat.id);
                }}
                className={`relative w-full h-full rounded-2xl overflow-hidden bg-white border border-gray-100 text-left transition-all duration-200 ${cat.highlighted
                  ? "shadow-lg hover:shadow-xl hover:-translate-y-1 cursor-default md:hidden"
                  : isActive
                    ? "shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-default"
                    : "cursor-default"
                  }`}
              >
            

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
                        ? "text-primary cursor-pointer"
                        : "text-gray-400"
                        }`}
                    >
                      {cat.cta}
                      <ArrowRight size={16} className="translate-y-[-2px]" />
                    </span>
                    {cat.id === "imobil" && (
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        {realEstateScopes.map((scope) => (
                          <span
                            key={scope.label}
                            className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-2.5 py-1 text-[11px] font-bold text-gray-600"
                          >
                            {scope.label}
                            {scope.badge && (
                              <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-extrabold leading-none text-sky-700 ring-1 ring-sky-100">
                                {scope.badge}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>

              {cat.id === "imobil" && (
                <div
                  className="hidden w-full overflow-hidden rounded-2xl border border-emerald-100 bg-white text-left shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-xl cursor-default md:grid md:min-h-72 md:grid-cols-[minmax(0,1fr)_18rem_minmax(0,1fr)]"
                >
                  <LivePricePanel t={t} priceData={priceData} />

                  <div className="flex flex-col items-center justify-center gap-3 bg-emerald-50/70 px-4 py-6">
                    <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-bold text-primary shadow-sm">
                      Chișinău · {t("categories.today")}
                    </span>
                    <div
                      className="h-52 w-full rounded-xl bg-cover bg-center bg-no-repeat shadow-inner"
                      style={{ backgroundImage: `url(${cat.backgroundImage})` }}
                    />
                  </div>

                  <div className="flex h-full flex-col p-6">
                    <div className="pt-1">
                      <LandingTrendCharts t={t} lang={lang} trendData={trendData} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
