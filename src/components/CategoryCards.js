"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "@/context/LanguageContext";
import { useLivePrices } from "@/lib/useLivePrices";
import { useMarketTrends } from "@/lib/useMarketTrends";
import { DISTRICTS_BY_CITY } from "@/lib/validation";
import CloseIcon from "@/components/icons/CloseIcon";

const TREND_ARROWS = { up: "↑", down: "↓", stable: "→" };
const TREND_COLORS = { up: "text-emerald-400/40", down: "text-red-400/40", stable: "text-gray-300/40" };
const REAL_ESTATE_IMAGE = "/images/cd-imobil.webp";
const CHISINAU_DISTRICTS = DISTRICTS_BY_CITY["Chișinău"] || [];
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

function trackDistrictTrendsPopupOpen() {
  const send = () => {
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/market-trends-popup-events");
      return;
    }

    fetch("/api/market-trends-popup-events", {
      method: "POST",
      keepalive: true,
    }).catch(() => {});
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(send, { timeout: 2000 });
  } else {
    window.setTimeout(send, 500);
  }
}

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

function LivePricePanel({ t, priceData }) {
  const cn = priceData?.constructii_noi?.median_ppm;
  const sec = priceData?.secundar?.median_ppm;
  const trend = priceData?.trend;
  const total = priceData?.total_active;

  return (
    <div className="flex flex-col justify-between gap-4 p-4 sm:gap-5 sm:p-6 md:h-full">
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
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 border-b border-gray-100 pb-3">
          <span className={`min-w-0 text-sm font-semibold ${MARKET_SERIES.constructii_noi.textClass}`}>
            {t("categories.newConstruction")}
          </span>
          <span className={`text-xl font-bold tabular-nums sm:text-2xl ${MARKET_SERIES.constructii_noi.textClass}`}>
            €{cn ?? "—"}
            <span className={`ml-1 text-xs font-semibold ${MARKET_SERIES.constructii_noi.unitClass}`}>/m²</span>
            {trend && (
              <span className={`${TREND_COLORS[trend.direction] || TREND_COLORS.stable} ml-1 text-sm`}>
                {TREND_ARROWS[trend.direction] || "→"}
              </span>
            )}
          </span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
          <span className={`min-w-0 text-sm font-semibold ${MARKET_SERIES.secundar.textClass}`}>
            {t("categories.secondary")}
          </span>
          <span className={`text-xl font-bold tabular-nums sm:text-2xl ${MARKET_SERIES.secundar.textClass}`}>
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

function MarketImagePanel({ t }) {
  return (
    <div className="hidden flex-col items-center justify-center gap-3 bg-emerald-50/70 px-4 py-6 md:flex">
      <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-bold text-primary shadow-sm">
        Chișinău · {t("categories.today")}
      </span>
      <div
        className="h-44 w-full rounded-xl bg-cover bg-bottom bg-no-repeat shadow-inner sm:h-52"
        style={{ backgroundImage: `url(${REAL_ESTATE_IMAGE})` }}
      />
    </div>
  );
}

function RealEstateMarketCard({ t, lang, priceData, trendData, onOpenDistricts }) {
  const handleKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenDistricts();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={t("categories.openDistrictTrends")}
      onClick={onOpenDistricts}
      onKeyDown={handleKeyDown}
      className="w-full cursor-pointer overflow-hidden rounded-2xl border border-emerald-100 bg-white text-left shadow-lg outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:hover:-translate-y-1 md:hover:shadow-xl"
    >
      <div className="grid md:min-h-72 md:grid-cols-[minmax(0,1fr)_18rem_minmax(0,1fr)]">
        <MobileMarketTrendPanel
          t={t}
          lang={lang}
          priceData={priceData}
          trendData={trendData}
        />
        <div className="hidden md:contents">
          <LivePricePanel t={t} priceData={priceData} />
          <MarketImagePanel t={t} />
          <div className="min-h-64 border-t border-gray-100 p-4 sm:p-6 md:min-h-0 md:border-l md:border-t-0">
            <div className="md:pt-1">
              <LandingTrendCharts t={t} lang={lang} trendData={trendData} />
            </div>
          </div>
        </div>
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

function MobileSeriesChart({ item, lang, price }) {
  const [activePoint, setActivePoint] = useState(null);
  const width = 220;
  const height = 72;
  const padding = 2;
  const rightPadding = 48;
  const values = item.points.map((point) => point.value);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
  const dates = [...new Set(item.points.map((point) => point.date))].sort();
  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const chartPoints = item.points.length >= 2
    ? buildCombinedChartPoints(item.points, dateIndex, minValue, maxValue, width, height, padding, rightPadding)
    : [];
  const coords = chartPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const firstPoint = chartPoints.reduce(
    (initial, point) => (!initial || point.date < initial.date ? point : initial),
    null
  );

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
        <span className={`min-w-0 text-sm font-semibold ${item.textClass}`}>
          {item.label}
        </span>
        <span className={`text-xl font-bold tabular-nums ${item.textClass}`}>
          {formatPrice(price)}
          <span className={`ml-1 text-xs font-semibold ${item.unitClass}`}>/m²</span>
        </span>
      </div>

      {chartPoints.length >= 2 ? (
        <div className="relative mt-2 h-[4.5rem]">
          {firstPoint && (
            <span
              className="pointer-events-none absolute z-10 -mt-1 -translate-y-full whitespace-nowrap text-[10px] font-medium tabular-nums text-gray-400"
              style={{
                left: `${(firstPoint.x / width) * 100}%`,
                top: `${(firstPoint.y / height) * 100}%`,
              }}
            >
              {formatPrice(firstPoint.value)}
            </span>
          )}
          <span className={`absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold ${item.chipClass}`}>
            {formatTrendPercent(item.trend?.change_pct)}
          </span>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            role="img"
            aria-label={item.label}
          >
            <line x1={padding} y1={height - padding} x2={width - rightPadding} y2={height - padding} stroke="#111827" strokeOpacity="0.08" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <polyline
              points={coords}
              fill="none"
              stroke={item.color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {chartPoints.map((point) => (
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
      ) : (
        <p className="mt-3 text-xs font-semibold text-gray-400">{item.noDataLabel}</p>
      )}
    </div>
  );
}

function MobileMarketTrendPanel({ t, lang, priceData, trendData }) {
  const trends = trendData?.trends || {};
  const total = priceData?.total_active;
  const series = [
    {
      key: "constructii_noi",
      label: t("categories.newConstruction"),
      trend: trends.constructii_noi,
      points: normalizeTrendPoints(trends.constructii_noi),
      color: MARKET_SERIES.constructii_noi.line,
      textClass: MARKET_SERIES.constructii_noi.textClass,
      unitClass: MARKET_SERIES.constructii_noi.unitClass,
      chipClass: MARKET_SERIES.constructii_noi.chipClass,
      price: priceData?.constructii_noi?.median_ppm,
      noDataLabel: t("result.noData"),
    },
    {
      key: "secundar",
      label: t("categories.secondary"),
      trend: trends.secundar,
      points: normalizeTrendPoints(trends.secundar),
      color: MARKET_SERIES.secundar.line,
      textClass: MARKET_SERIES.secundar.textClass,
      unitClass: MARKET_SERIES.secundar.unitClass,
      chipClass: MARKET_SERIES.secundar.chipClass,
      price: priceData?.secundar?.median_ppm,
      noDataLabel: t("result.noData"),
    },
  ];
  const allDates = [...new Set(series.flatMap((item) => item.points.map((point) => point.date)))].sort();
  const firstDate = allDates[0];
  const lastDate = allDates[allDates.length - 1];

  return (
    <div className="relative min-h-[27.75rem] overflow-hidden bg-emerald-50/70 px-4 py-3 sm:px-6 sm:py-4 md:hidden">
      <div
        className="absolute inset-0 bg-no-repeat opacity-45 blur-[1.5px]"
        style={{
          backgroundImage: `url(${REAL_ESTATE_IMAGE})`,
          backgroundPosition: "calc(50% + 20px) 4rem",
          backgroundSize: "140% auto",
        }}
      />
      <div className="absolute inset-0 bg-emerald-50/70" />

      <div className="relative z-10 flex min-h-[25.75rem] flex-col">
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
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold tracking-widest text-emerald-700">
            <span className="uppercase">{t("categories.livePrices")}</span>
            <span className="text-emerald-700/50">·</span>
            <span className="tracking-normal">Chisinau</span>
          </span>
        </div>

        <p className="mt-5 text-[11px] text-gray-400">
          {t("categories.trendPeriod")}
        </p>

        <div className="mt-4 space-y-4">
          {series.map((item, index) => (
            <div key={item.key}>
              {index > 0 && <div className="mb-4 h-px bg-gray-900/10" />}
              <MobileSeriesChart item={item} lang={lang} price={item.price} />
            </div>
          ))}
        </div>

        {firstDate && lastDate && (
          <div className="mt-auto flex items-center justify-between pt-3 text-[11px] leading-none text-gray-400">
            <span>{formatTrendDate(firstDate, lang)}</span>
            <span>{formatTrendDate(lastDate, lang)}</span>
          </div>
        )}

        <div className="mt-3 inline-flex max-w-full rounded-lg bg-emerald-50/90 px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm ring-1 ring-white/60">
          {formatListings(total)} {t("categories.listingsAnalyzed")}
        </div>
      </div>
    </div>
  );
}

function LandingTrendCharts({ t, lang, trendData, showLogo = false }) {
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
          <span className="text-xs text-gray-400">{t("categories.trendPeriod")}</span>
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
  const padding = 2;
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
        {t("categories.trendPeriod")}
      </p>

      <div className="relative mt-4 h-40 w-full">
        {showLogo && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-gray-900"
            style={{ opacity: 0.06 }}
          >
            <img src="/icon0.svg" alt="" className="h-16 w-auto" />
            <span className="mt-1 whitespace-nowrap text-[11px] font-bold tracking-wide">
              catdai.md
            </span>
          </div>
        )}
        {chartSeries.map((item) => {
          const firstPoint = item.chartPoints.reduce(
            (initial, point) => (!initial || point.date < initial.date ? point : initial),
            null
          );

          return firstPoint ? (
            <span
              key={`${item.key}-initial-price`}
              className="pointer-events-none absolute z-10 -mt-1 -translate-y-full whitespace-nowrap text-[10px] font-medium tabular-nums text-gray-400"
              style={{
                left: `${(firstPoint.x / width) * 100}%`,
                top: `${(firstPoint.y / height) * 100}%`,
              }}
            >
              {formatPrice(firstPoint.value)}
            </span>
          ) : null;
        })}
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
          aria-label={t("categories.trendPeriod")}
        >
          <line x1={padding} y1={height - padding} x2={width - rightPadding} y2={height - padding} stroke="#111827" strokeOpacity="0.08" strokeWidth="1" vectorEffect="non-scaling-stroke" />
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

function DistrictTrendCard({ district, trendData, t, lang }) {
  const trends = trendData?.trends || {};
  const series = [
    {
      key: "constructii_noi",
      label: t("categories.newConstruction"),
      trend: trends.constructii_noi,
      color: MARKET_SERIES.constructii_noi.line,
    },
    {
      key: "secundar",
      label: t("categories.secondary"),
      trend: trends.secundar,
      color: MARKET_SERIES.secundar.line,
    },
  ];

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-base font-bold text-gray-900">
        {t(`data.district.${district}`)}
      </h3>

      <div className="mt-3 space-y-2">
        {series.map((item) => (
          <div key={item.key} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="min-w-0">
              <span className="block truncate font-semibold text-gray-600">{item.label}</span>
              {item.trend?.listing_count != null && (
                <span className="mt-0.5 block truncate text-[10px] font-medium text-gray-400">
                  {Number(item.trend.listing_count).toLocaleString("ro-MD")} {t("categories.listingsAnalyzed")}
                </span>
              )}
            </span>
            <span className="font-bold tabular-nums text-gray-800">
              {formatPrice(item.trend?.end_value)}/m²
            </span>
          </div>
        ))}
      </div>
      <LandingTrendCharts t={t} lang={lang} trendData={trendData} showLogo />
    </article>
  );
}

function DistrictTrendsModal({ open, onClose, t, lang }) {
  const [districtTrends, setDistrictTrends] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const visibleDistricts = CHISINAU_DISTRICTS.filter((district) => {
    const trends = districtTrends?.[district]?.trends || {};
    return [trends.constructii_noi, trends.secundar]
      .some((trend) => normalizeTrendPoints(trend).length >= 2);
  });

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open || districtTrends || loading) return;

    setLoading(true);
    setLoadFailed(false);

    Promise.all(
      CHISINAU_DISTRICTS.map(async (district) => {
        try {
          const response = await fetch(
            `/api/market-trends?district=${encodeURIComponent(district)}`,
            { cache: "no-store" }
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return [district, await response.json()];
        } catch {
          return [district, null];
        }
      })
    )
      .then((entries) => {
        setDistrictTrends(Object.fromEntries(entries));
        setLoadFailed(entries.every(([, data]) => !data));
        setLoading(false);
      })
      .catch(() => {
        setLoadFailed(true);
        setLoading(false);
      });
  }, [districtTrends, loading, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 cursor-zoom-out sm:p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="district-trends-title"
        className="flex max-h-[92vh] w-full max-w-6xl cursor-auto flex-col overflow-hidden rounded-2xl bg-gray-50 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative shrink-0 border-b border-gray-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
            {t("categories.livePrices")}
          </p>
          <h2 id="district-trends-title" className="mt-1 pr-10 text-xl font-bold text-gray-900 sm:text-2xl">
            {t("categories.districtTrendsTitle")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("categories.districtTrendsSubtitle")}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("categories.closeDistrictTrends")}
            className="absolute right-3 top-3 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 sm:right-5 sm:top-5"
          >
            <CloseIcon size={19} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-6">
          {loading && !districtTrends ? (
            <div className="flex min-h-64 items-center justify-center text-sm font-semibold text-gray-500">
              {t("categories.loadingDistrictTrends")}
            </div>
          ) : (
            <>
              {loadFailed && (
                <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {t("categories.districtTrendsLoadError")}
                </p>
              )}
              {visibleDistricts.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {visibleDistricts.map((district) => (
                    <DistrictTrendCard
                      key={district}
                      district={district}
                      trendData={districtTrends[district]}
                      t={t}
                      lang={lang}
                    />
                  ))}
                </div>
              ) : !loadFailed ? (
                <p className="py-16 text-center text-sm font-semibold text-gray-400">
                  {t("result.noData")}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function CategoryCards() {
  const { t, lang } = useTranslation();
  const { data: priceData } = useLivePrices();
  const { data: trendData } = useMarketTrends();
  const [districtModalOpen, setDistrictModalOpen] = useState(false);
  const openDistrictModal = () => {
    setDistrictModalOpen(true);
    trackDistrictTrendsPopupOpen();
  };

  return (
    <>
      <section className="pb-8 px-4">
        <div className="max-w-4xl mx-auto grid grid-cols-1 gap-6">
          <RealEstateMarketCard
            t={t}
            lang={lang}
            priceData={priceData}
            trendData={trendData}
            onOpenDistricts={openDistrictModal}
          />
        </div>
      </section>
      <DistrictTrendsModal
        open={districtModalOpen}
        onClose={() => setDistrictModalOpen(false)}
        t={t}
        lang={lang}
      />
    </>
  );
}
