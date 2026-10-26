"use client";

import { useState } from "react";
import { useTranslation } from "@/context/LanguageContext";

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

export default function MarketTrendMiniChart({ trend, compact = false, locked = false, dark = false, standalone = false, title, periodLabel }) {
  const { t, lang } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(null);
  const points = Array.isArray(trend?.points)
    ? trend.points
      .map((point) => ({
        date: point.date,
        value: Number(point.value),
      }))
      .filter((point) => point.date && Number.isFinite(point.value) && point.value > 0)
    : [];

  if (points.length < 2) return null;

  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const width = 176;
  const height = 48;
  const padding = 4;
  const span = maxValue - minValue;
  const chartPoints = points.map((point, index) => {
    const x = padding + (index / (points.length - 1)) * (width - padding * 2);
    const y = span === 0
      ? height / 2
      : height - padding - ((point.value - minValue) / span) * (height - padding * 2);

    return { ...point, x, y };
  });
  const coords = chartPoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const activePoint = Number.isInteger(activeIndex) ? chartPoints[activeIndex] : null;
  const firstPoint = chartPoints[0];
  const lastPoint = chartPoints[chartPoints.length - 1];
  const endValue = Number(trend.end_value);
  const changePct = Number(trend.change_pct);
  const isUp = changePct > 0;
  const isDown = changePct < 0;
  const toneClass = isUp
    ? "text-emerald-600 bg-emerald-50"
    : isDown
      ? "text-red-600 bg-red-50"
      : "text-gray-500 bg-gray-100";
  const lockedTextClassName = locked ? "select-none blur-sm" : "";
  const lockedChartClassName = locked ? "opacity-80" : "";
  const metricLabel = trend.metric === "average_price_per_m2"
    ? t("result.trendMetricAverage")
    : t("result.trendMetricMedian");

  const chartContent = (
    <div
      className={`${standalone ? "w-full" : compact
        ? "mt-5 border-t border-gray-100 pt-4"
        : "mt-5 border-t border-gray-100 pt-4 lg:mt-0 lg:w-full lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
        }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wide ${dark ? "text-emerald-100" : "text-gray-400"}`}>
            {title || (trend.scope === "city" ? t("result.cityTrend") : t("result.districtTrend"))}
          </p>
          <p className={`mt-0.5 text-[11px] ${dark ? "text-emerald-200" : "text-gray-400"}`}>
            {periodLabel || t("result.trendPeriod", { days: trend.period_days || 30 })}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <p className={`text-lg font-bold leading-none ${dark ? "text-white" : "text-gray-900"} ${lockedTextClassName}`}>
          {formatPrice(endValue)}/m²
        </p>
        <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${toneClass} ${lockedTextClassName}`}>
          {formatTrendPercent(changePct)}
        </span>
      </div>
      <p className={`mt-1 text-[11px] ${dark ? "text-emerald-200" : "text-gray-400"} ${lockedTextClassName}`}>{metricLabel}</p>

      <div className="relative mt-3 h-14 w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className={`absolute inset-0 h-full w-full overflow-visible ${dark ? "text-emerald-300" : "text-primary"} ${lockedChartClassName}`}
          role="img"
          aria-label={t("result.districtTrend")}
        >
          <line x1="0" y1={height - padding} x2={width} y2={height - padding} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <polyline
            points={coords}
            fill="none"
            stroke="currentColor"
            strokeWidth={locked ? "4" : "3"}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {!locked && chartPoints.map((point, index) => (
          <button
            key={`${point.date}-${point.value}`}
            type="button"
            aria-label={`${formatTrendDate(point.date, lang)} ${formatPrice(point.value)}/m²`}
            className="group absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none"
            style={{
              left: `${(point.x / width) * 100}%`,
              top: `${(point.y / height) * 100}%`,
            }}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
            onFocus={() => setActiveIndex(index)}
            onBlur={() => setActiveIndex(null)}
          >
            <span className={`block h-2.5 w-2.5 translate-x-[5px] translate-y-[5px] rounded-full border-2 ${dark ? "border-emerald-300" : "border-primary"} bg-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100`} />
          </button>
        ))}
        {activePoint && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-gray-900 px-2.5 py-1.5 text-center text-[11px] font-medium leading-tight text-white shadow-lg"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
              top: `${(activePoint.y / height) * 100}%`,
            }}
          >
            <span className="block whitespace-nowrap">{formatTrendDate(activePoint.date, lang)}</span>
            <span className="block whitespace-nowrap">{formatPrice(activePoint.value)}/m²</span>
          </div>
        )}
      </div>
      <div className={`mt-1 flex items-center justify-between text-[11px] leading-none ${dark ? "text-emerald-200" : "text-gray-400"} ${lockedTextClassName}`}>
        <span>{formatTrendDate(firstPoint.date, lang)}</span>
        <span>{formatTrendDate(lastPoint.date, lang)}</span>
      </div>
    </div>
  );

  return chartContent;
}

export function MarketTrendOverlayChart({ series, title, periodLabel, metricLabel }) {
  const { lang } = useTranslation();
  const [activeDate, setActiveDate] = useState(null);
  const colors = ["#6ee7b7", "#7dd3fc"];
  const dates = [...new Set(series.flatMap((item) => item.points.map((point) => point.date)))].sort();
  if (dates.length < 2) return null;
  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const start = Date.parse(dates[0]);
  const end = Date.parse(dates.at(-1));
  const x = (date) => 4 + (Date.parse(date) - start) / (end - start) * 168;
  const y = (value) => high === low ? 24 : 44 - (value - low) / (high - low) * 40;
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-100">{title}</p>
      {periodLabel && <p className="mt-0.5 text-[11px] text-emerald-200">{periodLabel}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        {series.map((item, index) => {
          const last = item.points.at(-1).value;
          const change = (last / item.points[0].value - 1) * 100;
          return <div key={item.key}>
            <p className="flex items-center gap-1.5 text-xs text-emerald-100"><span className="h-0.5 w-4 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />{item.label}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold leading-none text-white">{formatPrice(last)}/m²</span>
              <span className={`rounded-lg px-1.5 py-1 text-[11px] font-bold ${change < 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>{formatTrendPercent(change)}</span>
            </div>
          </div>;
        })}
      </div>
      <p className="mt-1 text-[11px] text-emerald-200">{metricLabel}</p>
      <div className="relative mt-3 h-14 w-full">
        <svg viewBox="0 0 176 48" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={title}>
          <line x1="0" y1="44" x2="176" y2="44" stroke="#6ee7b7" strokeOpacity="0.1" vectorEffect="non-scaling-stroke" />
          {series.map((item, index) => <polyline key={item.key} points={item.points.map((point) => `${x(point.date)},${y(point.value)}`).join(" ")} fill="none" stroke={colors[index % colors.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
        </svg>
        {dates.map((date) => <button key={date} type="button" aria-label={formatTrendDate(date, lang)}
          className="absolute inset-y-0 w-3 -translate-x-1/2 outline-none focus-visible:bg-white/10"
          style={{ left: `${x(date) / 176 * 100}%` }}
          onMouseEnter={() => setActiveDate(date)} onMouseLeave={() => setActiveDate(null)}
          onFocus={() => setActiveDate(date)} onBlur={() => setActiveDate(null)} />)}
        {activeDate && <div className="pointer-events-none absolute bottom-full z-10 mb-1 -translate-x-1/2 rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] text-white shadow-lg"
          style={{ left: `${Math.max(22, Math.min(78, x(activeDate) / 176 * 100))}%` }}>
          <p className="whitespace-nowrap">{formatTrendDate(activeDate, lang)}</p>
          {series.map((item, index) => {
            const point = item.points.find((point) => point.date === activeDate);
            return point ? <p key={item.key} className="whitespace-nowrap" style={{ color: colors[index % colors.length] }}>{item.label} · {formatPrice(point.value)}/m²</p> : null;
          })}
        </div>}
      </div>
      <div className="mt-1 flex justify-between text-[11px] leading-none text-emerald-200"><span>{formatTrendDate(dates[0], lang)}</span><span>{formatTrendDate(dates.at(-1), lang)}</span></div>
    </div>
  );
}
