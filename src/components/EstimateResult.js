"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import BookmarkIcon from "@/components/icons/BookmarkIcon";
import CloseIcon from "@/components/icons/CloseIcon";
import AuthRequiredModal from "@/components/AuthRequiredModal";
import ListingAlertConfigurator from "@/components/ListingAlertConfigurator";
import Tooltip from "@/components/Tooltip";
import ValuationPdfDialog from "@/components/ValuationPdfDialog";
import CadastralDataCard from "@/components/CadastralDataCard";
import InfoCallout from "@/components/InfoCallout";

const PDF_LOGIN_RETURN_KEY = "catdai:open-pdf-after-login";
const LISTING_FAIR_BAND_PCT = 3;

function rememberPdfLoginReturn() {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(PDF_LOGIN_RETURN_KEY, "1");
  } catch {
    // Best effort: login still works, only PDF dialog restore is skipped.
  }
}

function forgetPdfLoginReturn() {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(PDF_LOGIN_RETURN_KEY);
  } catch {
    // Ignore storage errors.
  }
}

function hasPdfLoginReturn() {
  if (typeof window === "undefined") return false;

  try {
    return localStorage.getItem(PDF_LOGIN_RETURN_KEY) === "1";
  } catch {
    return false;
  }
}

function formatPrice(num) {
  const value = Number(num);
  if (!Number.isFinite(value)) return "—";
  return "€" + Math.round(value).toLocaleString("ro-MD");
}

function formatNullablePrice(num) {
  if (num === null || num === undefined || num === "") return "—";
  return formatPrice(num);
}

function formatCompactEuro(num) {
  const value = Number(num);
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return `€${Math.round(value / 1000)}k`;
  return formatPrice(value);
}

function formatCurrencyPrice(num, currency = "EUR") {
  const value = Number(num);
  if (!Number.isFinite(value)) return "—";
  const normalizedCurrency = String(currency || "EUR").toUpperCase();
  if (normalizedCurrency === "EUR") return formatPrice(value);
  return `${Math.round(value).toLocaleString("ro-MD")} ${normalizedCurrency}`;
}

function formatTrendPercent(num) {
  const value = Number(num);
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatPlainPercent(num) {
  if (num === null || num === undefined || num === "") return "—";
  const value = Number(num);
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatYears(num, t) {
  if (num === null || num === undefined || num === "") return "—";
  const value = Number(num);
  if (!Number.isFinite(value) || value <= 0) return "—";
  return t("calculator.resultYearsValue", { years: value.toFixed(1) });
}

function formatTrendDate(date, lang) {
  if (!date) return "";
  return new Date(`${date}T00:00:00`).toLocaleDateString(
    lang === "ru" ? "ru-RU" : "ro-RO",
    { day: "2-digit", month: "short" }
  );
}

function formatHistoryDate(date, lang) {
  if (!date) return "";
  return new Date(date).toLocaleDateString(
    lang === "ru" ? "ru-RU" : "ro-RO",
    { day: "2-digit", month: "short", year: "numeric" }
  );
}

function formatHistoryDateTime(date, lang) {
  if (!date) return "";
  return new Date(date).toLocaleDateString(
    lang === "ru" ? "ru-RU" : "ro-RO",
    { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
  );
}

function formatResultDate(lang) {
  return new Date().toLocaleDateString(
    lang === "ru" ? "ru-RU" : "ro-RO",
    { day: "numeric", month: "long", year: "numeric" }
  );
}

function formatArea(num) {
  const value = Number(num);
  if (!Number.isFinite(value) || value <= 0) return null;
  return `${value.toLocaleString("ro-MD", { maximumFractionDigits: 1 })}m²`;
}

function build999ListingUrl(externalId, lang) {
  if (!externalId) return null;
  const listingLang = lang === "ru" ? "ru" : "ro";
  return `https://999.md/${listingLang}/${encodeURIComponent(String(externalId))}`;
}

function formatListingMeta(listing, t) {
  const location = [
    listing.district ? t(`data.district.${listing.district}`) : null,
    listing.city ? t(`data.city.${listing.city}`) : null,
  ].filter(Boolean).join(", ");

  const floor = listing.floor != null
    ? (listing.total_floors
      ? t("result.floorOf", { floor: listing.floor, total: listing.total_floors })
      : t("result.floor", { floor: listing.floor }))
    : null;

  return [location, floor].filter(Boolean).join(" · ");
}

function formatListingAreaFloor(listing, t) {
  const floor = listing?.floor != null
    ? (listing.total_floors
      ? t("result.floorOf", { floor: listing.floor, total: listing.total_floors })
      : t("result.floor", { floor: listing.floor }))
    : null;

  return [formatArea(listing?.area_m2), floor].filter(Boolean).join(" · ");
}

function normalizeRelevantListing(listing, t, lang) {
  const href = build999ListingUrl(listing?.external_id, lang);
  if (!href) return null;

  const tags = [
    listing.rooms_count === 1
      ? t("result.oneRoom")
      : (listing.rooms_count ? t("result.rooms", { count: listing.rooms_count }) : null),
    formatArea(listing.area_m2),
    listing.building_type ? t(`data.buildingType.${listing.building_type}`) : null,
    listing.renovation ? t(`data.renovationType.${listing.renovation}`) : null,
  ].filter(Boolean);

  return {
    externalId: String(listing.external_id),
    href,
    title: listing.title || t("result.relevantListings"),
    meta: formatListingMeta(listing, t),
    price: listing.price_amount,
    pricePerM2: listing.price_per_m2,
    imageUrl: listing.image_url || null,
    areaFloor: formatListingAreaFloor(listing, t),
    tags,
  };
}

function normalizeDuplicateListing(listing, t, lang, probability) {
  const href = build999ListingUrl(listing?.external_id, lang);
  if (!href) return null;

  const tags = [
    listing.rooms_count === 1
      ? t("result.oneRoom")
      : (listing.rooms_count ? t("result.rooms", { count: listing.rooms_count }) : null),
    formatArea(listing.area_m2),
    listing.building_type ? t(`data.buildingType.${listing.building_type}`) : null,
    listing.renovation ? t(`data.renovationType.${listing.renovation}`) : null,
  ].filter(Boolean);

  return {
    externalId: String(listing.external_id),
    href,
    title: listing.title || t("result.listingDuplicateFallbackTitle"),
    address: formatDuplicateListingAddress(listing.address_text),
    meta: formatListingMeta(listing, t),
    price: listing.price_amount,
    priceCurrency: listing.price_currency,
    pricePerM2: listing.price_per_m2,
    areaFloor: formatListingAreaFloor(listing, t),
    tags,
    probability,
    score: listing.match?.score ?? null,
    reasons: Array.isArray(listing.match?.reasons) ? listing.match.reasons : [],
  };
}

function formatDuplicateListingAddress(address) {
  if (!address || typeof address !== "string") return null;

  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const streetIndex = parts.findIndex((part) =>
    /\b(strada|str\.?|bd\.?|bulevardul|bulevard|blvd|aleea|sos\.?|soseaua)\b/i.test(part)
  );
  if (streetIndex >= 0) {
    return parts.slice(streetIndex).join(", ");
  }

  return address.trim() || null;
}

function getDuplicateHighReasons(listing, t) {
  if (listing.probability !== "high") return [];

  const reasonPriority = [
    ["same_owner", "result.listingDuplicateReasonSameOwner"],
    ["same_address", "result.listingDuplicateReasonSameAddress"],
  ];
  return reasonPriority
    .filter(([reason]) => listing.reasons.includes(reason))
    .map(([, key]) => t(key));
}

function appendDefinedParam(params, key, value) {
  if (value === null || value === undefined || value === "") return;
  params.append(key, String(value));
}

function buildEvaluationUrl(params) {
  return `/evaluare?${params.toString()}`;
}

function MarketTrendMiniChart({ trend, compact = false }) {
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
  const metricLabel = trend.metric === "average_price_per_m2"
    ? t("result.trendMetricAverage")
    : t("result.trendMetricMedian");

  return (
    <div
      className={`${compact
        ? "mt-5 border-t border-gray-100 pt-4"
        : "mt-5 border-t border-gray-100 pt-4 lg:mt-0 lg:w-full lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
        }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {trend.scope === "city" ? t("result.cityTrend") : t("result.districtTrend")}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {t("result.trendPeriod", { days: trend.period_days || 30 })}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <p className="text-lg font-bold leading-none text-gray-900">
          {formatPrice(endValue)}/m²
        </p>
        <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${toneClass}`}>
          {formatTrendPercent(changePct)}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">{metricLabel}</p>

      <div className="relative mt-3 h-14 w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible text-primary"
          role="img"
          aria-label={t("result.districtTrend")}
        >
          <line x1="0" y1={height - padding} x2={width} y2={height - padding} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <polyline
            points={coords}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {chartPoints.map((point, index) => (
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
            <span className="block h-2.5 w-2.5 translate-x-[5px] translate-y-[5px] rounded-full border-2 border-primary bg-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100" />
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
      <div className="mt-1 flex items-center justify-between text-[11px] leading-none text-gray-400">
        <span>{formatTrendDate(firstPoint.date, lang)}</span>
        <span>{formatTrendDate(lastPoint.date, lang)}</span>
      </div>
    </div>
  );
}

function normalizeListingPriceHistory(history) {
  const rows = (Array.isArray(history) ? history : [])
    .map((item) => {
      const price = Number(item?.price_amount);
      const date = item?.observed_at || item?.source_updated_at;
      const observedTime = date ? Date.parse(date) : NaN;

      if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(observedTime)) return null;

      return {
        id: item.id,
        price,
        currency: item.price_currency,
        date,
        observedTime,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.observedTime - b.observedTime);

  const points = [];
  for (const row of rows) {
    const previous = points[points.length - 1] || null;
    if (previous && previous.price === row.price) continue;

    const diff = previous ? row.price - previous.price : null;
    points.push({
      ...row,
      diff,
      diffPct: diff != null && previous.price > 0 ? (diff / previous.price) * 100 : null,
    });
  }

  return points;
}

function getListingHistoryTone(point) {
  if (point.diff > 0) {
    return {
      stroke: "#d97706",
      fill: "#fffbeb",
      tooltipText: "text-amber-300",
    };
  }
  if (point.diff < 0) {
    return {
      stroke: "#059669",
      fill: "#ecfdf5",
      tooltipText: "text-emerald-300",
    };
  }
  return {
    stroke: "#0ea5e9",
    fill: "#eff6ff",
    tooltipText: "text-sky-300",
  };
}

function ListingPriceHistoryChart({ history, currency, compact = false }) {
  const { t, lang } = useTranslation();
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [pinnedIndex, setPinnedIndex] = useState(null);
  const points = normalizeListingPriceHistory(history);
  const mobileFullWidthClassName =
    "-ml-[8rem] w-[calc(100%+8rem)] sm:-ml-[9.25rem] sm:w-[calc(100%+9.25rem)] lg:ml-0 lg:w-full";

  const wrapperClassName = `${compact
    ? `mt-5 border-t border-gray-100 pt-4 ${mobileFullWidthClassName}`
    : `mt-5 border-t border-gray-100 pt-4 ${mobileFullWidthClassName} lg:mt-0 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0`
    }`;

  if (points.length < 2) {
    return (
      <div className={wrapperClassName}>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t("result.listingPriceHistoryTitle")}
        </p>
        <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm font-medium text-gray-500">
          {t("result.listingPriceHistoryNoData")}
        </div>
      </div>
    );
  }

  const width = 440;
  const height = 210;
  const padding = { top: 22, right: 18, bottom: 48, left: 72 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const bottomY = height - padding.bottom;
  const values = points.map((point) => point.price);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valuePadding = minValue === maxValue
    ? Math.max(Math.abs(maxValue) * 0.06, 100)
    : Math.max((maxValue - minValue) * 0.12, 100);
  const chartMin = Math.max(0, minValue - valuePadding);
  const chartMax = maxValue + valuePadding;
  const valueRange = chartMax - chartMin || 1;
  const firstTime = points[0].observedTime;
  const lastTime = points[points.length - 1].observedTime;
  const timeRange = lastTime - firstTime;
  const plotted = points.map((point, index) => {
    const x = padding.left + (
      timeRange > 0
        ? ((point.observedTime - firstTime) / timeRange) * chartWidth
        : (index / (points.length - 1)) * chartWidth
    );
    const y = bottomY - ((point.price - chartMin) / valueRange) * chartHeight;
    return { ...point, x, y };
  });
  const coords = plotted.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const gridValues = [
    chartMax,
    chartMin + valueRange * 0.66,
    chartMin + valueRange * 0.33,
    chartMin,
  ];
  const tickIndexes = [...new Set([0, Math.floor((plotted.length - 1) / 2), plotted.length - 1])];
  const activeIndex = pinnedIndex ?? hoveredIndex;
  const activePoint = Number.isInteger(activeIndex) ? plotted[activeIndex] : null;
  const lastPoint = plotted[plotted.length - 1];
  const firstPoint = plotted[0];
  const totalChange = lastPoint.price - firstPoint.price;
  const totalChangePct = firstPoint.price > 0 ? (totalChange / firstPoint.price) * 100 : null;
  const totalChangeTone = totalChange > 0
    ? "text-amber-600"
    : totalChange < 0
      ? "text-emerald-600"
      : "text-gray-500";

  const buildChangeLabel = (point) => {
    if (point.diff == null) return t("result.listingPriceHistoryInitial");
    const sign = point.diff > 0 ? "+" : "-";
    return `${sign}${formatCurrencyPrice(Math.abs(point.diff), point.currency || currency)} (${formatTrendPercent(point.diffPct)})`;
  };
  const totalChangeLabel = `${totalChange > 0 ? "+" : totalChange < 0 ? "-" : ""}${formatCurrencyPrice(Math.abs(totalChange), lastPoint.currency || currency)} (${formatTrendPercent(totalChangePct)})`;

  return (
    <div className={wrapperClassName}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {t("result.listingPriceHistoryTitle")}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {formatHistoryDate(firstPoint.date, lang)} - {formatHistoryDate(lastPoint.date, lang)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-medium text-gray-400">{t("result.listingPriceHistoryLatest")}</p>
          <p className="text-base font-bold text-gray-900">
            {formatCurrencyPrice(lastPoint.price, lastPoint.currency || currency)}
          </p>
          <p className={`mt-1 text-xs font-bold ${totalChangeTone}`}>
            {totalChangeLabel}
          </p>
          <p className="text-[11px] font-medium text-gray-400">
            {t("result.listingPriceHistoryFromInitial", {
              price: formatCurrencyPrice(firstPoint.price, firstPoint.currency || currency),
            })}
          </p>
        </div>
      </div>

      <div
        className="relative mt-4 w-full overflow-visible"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="absolute inset-0 h-full w-full overflow-visible"
          role="img"
          aria-label={t("result.listingPriceHistoryTitle")}
        >
          {gridValues.map((value) => {
            const y = bottomY - ((value - chartMin) / valueRange) * chartHeight;
            return (
              <g key={value}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-gray-400 text-[10px]"
                >
                  {formatCompactEuro(value)}
                </text>
              </g>
            );
          })}
          <line
            x1={padding.left}
            x2={padding.left}
            y1={padding.top}
            y2={bottomY}
            stroke="#cbd5e1"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={bottomY}
            y2={bottomY}
            stroke="#cbd5e1"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={coords}
            fill="none"
            stroke="#0ea5e9"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {plotted.map((point, index) => {
            const tone = getListingHistoryTone(point);
            const isActive = activeIndex === index;
            return (
              <circle
                key={point.id || `${point.date}-${point.price}`}
                cx={point.x}
                cy={point.y}
                r={isActive ? 6 : 4.5}
                fill={tone.fill}
                stroke={tone.stroke}
                strokeWidth={isActive ? 3 : 2}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {tickIndexes.map((index) => {
            const point = plotted[index];
            return (
              <text
                key={`${point.date}-${index}`}
                x={point.x}
                y={height - 24}
                textAnchor={index === 0 ? "start" : index === plotted.length - 1 ? "end" : "middle"}
                className="fill-gray-400 text-[10px]"
              >
                {formatHistoryDate(point.date, lang)}
              </text>
            );
          })}
          <text x={padding.left} y={12} textAnchor="start" className="fill-gray-400 text-[10px]">
            {t("result.listingPriceHistoryAxisPrice")}
          </text>
          <text x={padding.left + chartWidth / 2} y={height - 4} textAnchor="middle" className="fill-gray-400 text-[10px]">
            {t("result.listingPriceHistoryAxisDate")}
          </text>
        </svg>

        {plotted.map((point, index) => (
          <button
            key={`${point.id || point.date}-${index}`}
            type="button"
            aria-label={`${formatHistoryDateTime(point.date, lang)} ${formatCurrencyPrice(point.price, point.currency || currency)}`}
            className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus:ring-2 focus:ring-primary/30"
            style={{
              left: `${(point.x / width) * 100}%`,
              top: `${(point.y / height) * 100}%`,
            }}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
            onFocus={() => setHoveredIndex(index)}
            onBlur={() => setHoveredIndex(null)}
            onClick={() => setPinnedIndex((current) => (current === index ? null : index))}
          />
        ))}

        {activePoint && (
          <div
            className="pointer-events-none absolute z-10 w-max max-w-[13rem] -translate-x-1/2 -translate-y-full rounded-xl bg-gray-900 px-3 py-2 text-left text-[11px] font-medium leading-tight text-white shadow-lg"
            style={{
              left: `${(activePoint.x / width) * 100}%`,
              top: `${(activePoint.y / height) * 100}%`,
            }}
          >
            <span className="block whitespace-nowrap">{formatHistoryDateTime(activePoint.date, lang)}</span>
            <span className="mt-1 block whitespace-nowrap text-sm font-bold">
              {formatCurrencyPrice(activePoint.price, activePoint.currency || currency)}
            </span>
            <span className={`mt-1 block whitespace-nowrap ${getListingHistoryTone(activePoint).tooltipText}`}>
              {activePoint.diff == null
                ? buildChangeLabel(activePoint)
                : `${t("result.listingPriceHistoryChange")}: ${buildChangeLabel(activePoint)}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function LockedValue({ text = "999999", className = "", onClick }) {
  const { t } = useTranslation();

  return (
    <Tooltip text={t("result.loginToSeeFullAnalysis")}>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClick?.();
        }}
        className="inline-flex cursor-pointer border-0 bg-transparent p-0"
      >
        <span className={`inline-block select-none blur-sm ${className}`}>
          {text}
        </span>
      </button>
    </Tooltip>
  );
}

function FilterBadge({ label, active }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${active
        ? "bg-primary/10 text-primary"
        : "bg-gray-100 text-gray-400 line-through"
        }`}
    >
      {active ? (
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm3.78-9.72a.75.75 0 0 0-1.06-1.06L7 8.94 5.28 7.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25z" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zM4.22 4.22a.75.75 0 0 1 1.06 0L8 6.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L9.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 0 1-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 0 1 0-1.06z" />
        </svg>
      )}
      {label}
    </span>
  );
}

function FeatureAdjustmentBadge({ item }) {
  const isPositive = item.pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${isPositive
        ? "bg-emerald-50 text-emerald-700"
        : "bg-red-50 text-red-600"
        }`}
    >
      {isPositive ? (
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
          <path d="M8 3.5L13 9H3L8 3.5z" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor">
          <path d="M8 12.5L3 7h10L8 12.5z" />
        </svg>
      )}
      {isPositive ? "+" : ""}{item.pct}% · {item.label}
    </span>
  );
}

function ResultDateBadge({ lang }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/8 text-xs font-medium text-primary">
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
      {formatResultDate(lang)}
    </span>
  );
}

function DistrictComparison({
  districts,
  currentDistrict,
  currentDistricts,
  area,
  valueKey = "median_ppm",
  buildHref,
  blurValues = false,
  onLockedClick,
  className = "",
}) {
  const { t } = useTranslation();

  if (!districts || districts.length < 2) return null;

  const selectedDistricts = Array.isArray(currentDistricts) && currentDistricts.length > 0
    ? currentDistricts
    : [currentDistrict].filter(Boolean);
  const areaValue = Number(area);
  const showPricePerM2 = valueKey === "median_ppm";
  const hasArea = showPricePerM2 && Number.isFinite(areaValue) && areaValue > 0;
  const numericValues = districts
    .map((d) => Number(d?.[valueKey]))
    .filter((value) => Number.isFinite(value) && value > 0);
  const maxValue = numericValues.length > 0 ? Math.max(...numericValues) : null;

  return (
    <div className={`${className} w-full min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-8`}>
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        {t("result.districtComparison")}
      </h3>
      <p className="text-sm text-gray-400 mb-5">
        {t("result.districtComparisonDesc")}
      </p>
      <div className="min-w-0 space-y-3 overflow-hidden">
        {districts.map((d) => {
          const isCurrent = selectedDistricts.includes(d.district);
          const href = buildHref?.(d);
          const medianValue = Number(d?.[valueKey]);
          const relativeWidthFromPayload = Number(d?.relative_width_pct);
          const rawWidthPct =
            Number.isFinite(relativeWidthFromPayload)
              ? relativeWidthFromPayload
              : (Number.isFinite(medianValue) && maxValue
                ? Math.max(8, (medianValue / maxValue) * 100)
                : 8);
          const widthPct = Math.max(8, Math.min(100, rawWidthPct));
          const totalPrice =
            hasArea && Number.isFinite(medianValue) ? Math.round(medianValue * areaValue) : null;

          const rowClassName = `group grid w-full max-w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 rounded-lg transition-colors sm:-m-1 sm:flex sm:items-center sm:gap-3 sm:p-1 ${href ? "cursor-pointer hover:bg-primary/5" : ""}`;
          const rowContent = (
            <>
              <span
                className={`min-w-0 truncate text-sm transition-colors sm:w-24 sm:shrink-0 sm:text-right ${isCurrent ? "font-bold text-primary" : "text-gray-500"
                  } ${href ? "group-hover:text-primary" : ""
                  }`}
              >
                {t(`data.district.${d.district}`)}
              </span>
              <div className={`relative h-8 w-full min-w-0 max-w-full overflow-hidden rounded bg-gray-50 transition-colors sm:flex-1 ${href ? "group-hover:bg-primary/10" : ""}`}>
                <div
                  className={`h-full rounded transition-all ${isCurrent ? "bg-primary/20" : "bg-gray-200"
                    } ${href ? "group-hover:bg-primary/30" : ""
                    }`}
                  style={{ width: `${widthPct}%` }}
                />
                <span
                  className={`absolute inset-y-0 right-2 flex max-w-[calc(100%-1rem)] items-center justify-end truncate text-right text-sm tabular-nums transition-colors ${isCurrent ? "font-bold text-primary" : "text-gray-600"} ${href ? "group-hover:text-primary" : ""}`}
                >
                  {blurValues ? (
                    <LockedValue
                      text={hasArea ? "€99.999" : `€9.999${showPricePerM2 ? "/m²" : ""}`}
                      className={isCurrent ? "text-primary" : "text-gray-500"}
                      onClick={onLockedClick}
                    />
                  ) : totalPrice == null
                    ? (Number.isFinite(medianValue) ? `${formatPrice(medianValue)}${showPricePerM2 ? "/m²" : ""}` : "—")
                    : `€${totalPrice.toLocaleString("ro-MD")}`}
                </span>
              </div>
            </>
          );

          return href ? (
            <a key={d.district} href={href} className={rowClassName}>
              {rowContent}
            </a>
          ) : (
            <div key={d.district} className={rowClassName}>
              {rowContent}
            </div>
          );
        })}
      </div>
      {hasArea && (
        <p className="text-xs text-gray-400 mt-4">
          {t("result.estimatedForArea", { area })}
        </p>
      )}
    </div>
  );
}

function getActionButtonClassName(compactLayout = false) {
  return compactLayout
    ? "py-5 rounded-2xl text-base"
    : "px-3 py-4 rounded-2xl text-sm min-[360px]:whitespace-nowrap lg:py-4";
}

function getSecondaryActionButtonClassName(compactLayout = false) {
  return `${getActionButtonClassName(compactLayout)} w-full cursor-pointer font-semibold border border-gray-200 text-gray-700 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-sm transition-all flex items-center justify-center gap-2`;
}

function getActionIconClassName(compactLayout = false) {
  return compactLayout
    ? "w-5 h-5"
    : "h-4 w-4 shrink-0";
}

function EditCriteriaButton({ onClick, compactLayout = false }) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      onClick={onClick}
      className={getSecondaryActionButtonClassName(compactLayout)}
    >
      <svg viewBox="0 0 24 24" className={getActionIconClassName(compactLayout)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
      {t("result.changeCriteria")}
    </button>
  );
}

function ListingsPreviewCard({ listing }) {
  const metaParts = listing.meta ? listing.meta.split(" · ").filter(Boolean) : [];

  return (
    <a
      href={listing.href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5"
    >
      <div className="flex w-24 shrink-0 self-stretch flex-col sm:w-28">
        <div
          className={`flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-gray-100 ${listing.imageUrl
            ? "bg-cover bg-center"
            : "text-gray-300"
            }`}
          style={listing.imageUrl ? { backgroundImage: `url(${JSON.stringify(listing.imageUrl)})` } : undefined}
        >
          {!listing.imageUrl && (
            <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" />
              <path d="M9 21v-7h6v7" />
              <path d="M7 11h2M15 11h2" />
            </svg>
          )}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center pt-2 text-center leading-tight">
          <p className="text-base font-bold tracking-tight text-gray-900">{formatPrice(listing.price)}</p>
          <p className="mt-0.5 text-xs text-gray-400">{formatPrice(listing.pricePerM2)}/m²</p>
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-gray-900">{listing.title}</h4>
          {metaParts.length > 0 && (
            <p className="mt-0.5 text-xs text-gray-400">
              {metaParts.map((part, index) => (
                <span key={`${part}-${index}`} className="block">
                  {part}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {listing.tags.map((tag) => (
            <span key={tag} className="rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-500">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </a>
  );
}

function RentLevelListingCard({ label, listing, fallbackValue, tone = "emerald", ctaLabel, className = "" }) {
  const toneClass = tone === "amber" ? "text-amber-600" : "text-emerald-600";

  if (!listing) {
    return (
      <div className={`flex min-h-36 flex-col items-center justify-center p-5 text-center sm:min-h-56 sm:p-6 ${className}`}>
        <p className="mb-1 text-sm text-gray-400">{label}</p>
        <p className={`text-xl font-bold ${toneClass}`}>{formatPrice(fallbackValue)}</p>
      </div>
    );
  }

  return (
    <a
      href={listing.href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex min-h-36 flex-col items-center justify-center p-5 text-center transition-colors hover:bg-primary/5 sm:min-h-56 sm:p-6 ${className}`}
    >
      <p className="mb-1 text-sm text-gray-400">{label}</p>
      <p className={`text-xl font-bold ${toneClass}`}>{formatPrice(listing.price)}</p>
      {listing.areaFloor && (
        <p className="mt-1 truncate text-sm font-medium text-gray-500 group-hover:text-primary">
          {listing.areaFloor}
        </p>
      )}
      <p className="mt-2 text-xs font-semibold text-primary">
        {ctaLabel}
      </p>
    </a>
  );
}

function RelevantListingsPreview({ t, count, listings, onViewAll, sidebar = false }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="p-6 sm:p-8 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">{t("result.relevantListings")}</h3>
              <span className="shrink-0 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">
                {count.toLocaleString("ro-MD")}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-400">{t("result.relevantListingsDesc")}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {listings.map((listing) => (
            <ListingsPreviewCard key={listing.externalId} listing={listing} />
          ))}
        </div>
      </div>

      {/* <div className={`flex flex-col gap-3 p-5 sm:p-6 ${sidebar ? "" : "sm:flex-row sm:items-center sm:justify-between"}`}>
        <p className="text-sm text-gray-500">{t("result.listingsPreviewNote")}</p>
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary-dark"
        >
          {t("result.viewListings", { count: count.toLocaleString("ro-MD") })}
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </button>
      </div> */}
    </section>
  );
}

function DuplicateListingCard({ listing, t }) {
  const metaParts = listing.meta ? listing.meta.split(" · ").filter(Boolean) : [];
  const isHigh = listing.probability === "high";
  const highReasons = getDuplicateHighReasons(listing, t);
  const badgeClassName = isHigh
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
    : "bg-amber-50 text-amber-700 ring-1 ring-amber-100";

  return (
    <a
      href={listing.href}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-gray-900">{listing.title}</h4>
          {listing.address && (
            <p className="mt-1 text-xs font-medium text-gray-500">{listing.address}</p>
          )}
          {metaParts.length > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              {metaParts.map((part, index) => (
                <span key={`${part}-${index}`} className="block">
                  {part}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`rounded-lg px-2.5 py-1 text-center ${badgeClassName}`}>
            <span className="block text-[10px] font-semibold uppercase leading-none tracking-wide">
              {t("result.listingDuplicateMatch")}
            </span>
            <span className="mt-0.5 block text-xs font-bold uppercase leading-none">
              {isHigh ? t("result.listingDuplicateHigh") : t("result.listingDuplicateMedium")}
            </span>
          </span>
          {highReasons.map((reason) => (
            <span key={reason} className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold leading-none text-emerald-700 ring-1 ring-emerald-100">
              {reason}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold tracking-tight text-gray-900">
            {formatCurrencyPrice(listing.price, listing.priceCurrency)}
          </p>
          {listing.pricePerM2 != null && (
            <p className="mt-0.5 text-xs text-gray-400">
              {formatCurrencyPrice(listing.pricePerM2, listing.priceCurrency)}/m²
            </p>
          )}
        </div>
        {listing.areaFloor && (
          <p className="shrink-0 text-right text-xs font-medium text-gray-500">{listing.areaFloor}</p>
        )}
      </div>
      {listing.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {listing.tags.map((tag) => (
            <span key={tag} className="rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-500">
              {tag}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}

function DuplicateListingsPreview({ t, count, listings, sectionRef }) {
  const [showAll, setShowAll] = useState(false);
  if (count <= 0 || listings.length === 0) return null;

  const visibleListings = showAll ? listings : listings.slice(0, 3);
  const hiddenCount = Math.max(0, listings.length - visibleListings.length);

  return (
    <section ref={sectionRef} className="scroll-mt-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-900">{t("result.listingDuplicatesTitle")}</h3>
              <span className="shrink-0 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">
                {count.toLocaleString("ro-MD")}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-400">{t("result.listingDuplicatesDesc")}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {visibleListings.map((listing) => (
            <DuplicateListingCard
              key={`${listing.probability}-${listing.externalId}`}
              listing={listing}
              t={t}
            />
          ))}
        </div>
        {hiddenCount > 0 && (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              {t("result.listingDuplicatesShowMore", { count: hiddenCount.toLocaleString("ro-MD") })}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function RentYieldCalculatorPanel({ calculation }) {
  const { t } = useTranslation();
  const hasTax = calculation.include_rent_tax;
  const gridClassName = hasTax
    ? "lg:grid-cols-3"
    : "lg:grid-cols-2";
  const sectionClassName = "grid grid-cols-2 lg:grid-cols-1 lg:grid-rows-2";
  const blockClassName = "grid min-h-36 grid-rows-[3.5rem_auto_3.5rem] items-center justify-items-center p-4 text-center lg:min-h-48 lg:grid-rows-[3.75rem_auto_3.75rem] lg:p-8";
  const labelClassName = "text-base font-medium leading-snug text-gray-400 sm:text-sm";
  const valueClassName = "text-3xl font-bold tracking-tight text-gray-900 lg:text-5xl";
  const netValueClassName = "text-4xl font-bold tracking-tight text-primary lg:text-6xl";
  const subLabelClassName = "text-base font-medium leading-snug text-gray-500";

  return (
    <>
      <div className={`grid w-full min-w-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ${gridClassName}`}>
        <section className={`${sectionClassName} border-b border-gray-100 text-center lg:border-b-0 lg:border-r`}>
          <div className={blockClassName}>
            <p className={labelClassName}>{t("calculator.resultRecommendedRent")}</p>
            <EditableRecommendedRent
              value={calculation.monthly_rent}
              onChange={calculation.onMonthlyRentChange}
              className={valueClassName}
            />
            <p className={subLabelClassName}>
              {t("result.rentPerMonth")}
            </p>
          </div>

          <div className={`${blockClassName} border-l border-gray-100 bg-gray-50/40 lg:border-l-0 lg:border-t`}>
            <p aria-hidden="true" className={`${labelClassName} invisible`}>{t("calculator.resultRecommendedRent")}</p>
            <p className={valueClassName}>
              {formatNullablePrice(calculation.annual_gross_rent)}
            </p>
            <p className={subLabelClassName}>
              {t("calculator.resultAnnualRent")}
            </p>
          </div>
        </section>

        {hasTax && (
          <section className={`${sectionClassName} border-b border-gray-100 bg-primary/5 text-center lg:border-b-0 lg:border-r`}>
            <div className={blockClassName}>
              <p className="text-sm font-semibold leading-snug text-red-500">
                {t("calculator.resultMonthlyTaxDeducted", { amount: formatNullablePrice(calculation.monthly_tax) })}
              </p>
              <p className={netValueClassName}>
                {formatNullablePrice(calculation.monthly_effective_rent)}
              </p>
              <p className={subLabelClassName}>
                {t("calculator.resultPerMonthAfterTax")}
              </p>
            </div>

            <div className={`${blockClassName} border-l border-primary/10 bg-primary/5 lg:border-l-0 lg:border-t`}>
              <p aria-hidden="true" className="invisible text-sm font-semibold leading-snug text-red-500">
                {t("calculator.resultMonthlyTaxDeducted", { amount: formatNullablePrice(calculation.monthly_tax) })}
              </p>
              <p className={netValueClassName}>
                {formatNullablePrice(calculation.annual_effective_rent)}
              </p>
              <p className={subLabelClassName}>
                {t("calculator.resultPerYearAfterTax")}
              </p>
            </div>
          </section>
        )}

        <section className={`${sectionClassName} text-center`}>
          <div className={blockClassName}>
            <p className={labelClassName}>{t("calculator.resultAnnualGrossYield")}</p>
            <p className={valueClassName}>{formatPlainPercent(calculation.gross_yield_pct)}</p>
          </div>

          <div className={`${blockClassName} border-l border-gray-100 bg-gray-50/40 lg:border-l-0 lg:border-t`}>
            <p className={labelClassName}>{t("calculator.resultPaybackPeriod")}</p>
            <p className={valueClassName}>{formatYears(calculation.payback_years, t)}</p>
            <p className={subLabelClassName}>
              {t("calculator.resultTotalInvestment", { amount: formatNullablePrice(calculation.total_investment) })}
            </p>
          </div>
        </section>
      </div>

      {hasTax && (
        <>
          <section className="w-full min-w-0 overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm">
            <p className="border-b border-red-100 bg-red-50/50 px-5 py-4 text-sm font-bold uppercase tracking-wide text-red-500 sm:px-6">
              {t("calculator.resultTaxesPaidTitle")}
            </p>
            <div className="grid sm:grid-cols-3">
              <div className="p-5 sm:p-6">
                <p className="text-3xl font-bold tracking-tight text-gray-900">{formatNullablePrice(calculation.monthly_tax)}</p>
                <p className="mt-1 text-base font-medium text-gray-500">{t("calculator.resultMonthlyTaxPaid")}</p>
              </div>
              <div className="border-t border-red-100 p-5 sm:border-l sm:border-t-0 sm:p-6">
                <p className="text-3xl font-bold tracking-tight text-gray-900">{formatNullablePrice(calculation.annual_tax)}</p>
                <p className="mt-1 text-base font-medium text-gray-500">{t("calculator.resultAnnualTaxPaid")}</p>
              </div>
              <div className="border-t border-red-100 bg-red-50/30 p-5 sm:border-l sm:border-t-0 sm:p-6">
                <p className="text-3xl font-bold tracking-tight text-gray-900">{formatNullablePrice(calculation.total_tax_until_payback)}</p>
                <p className="mt-1 text-base font-medium text-gray-500">{t("calculator.resultTaxPaidUntilPayback")}</p>
              </div>
            </div>
          </section>

          <RentYieldAccumulationChart calculation={calculation} />
        </>
      )}
    </>
  );
}

function RentYieldAccumulationChart({ calculation }) {
  const { t } = useTranslation();
  const [hoveredYear, setHoveredYear] = useState(null);
  const annualIncome = Number(calculation.annual_effective_rent);
  const annualTax = Number(calculation.annual_tax);
  const totalInvestment = Number(calculation.total_investment);
  const paybackYears = Number(calculation.payback_years);

  if (!Number.isFinite(annualIncome) || annualIncome <= 0 || !Number.isFinite(annualTax) || annualTax <= 0 || !Number.isFinite(totalInvestment) || totalInvestment <= 0 || !Number.isFinite(paybackYears) || paybackYears <= 0) {
    return null;
  }

  const yearsCount = Math.max(1, Math.ceil(paybackYears));
  const width = 680;
  const height = 280;
  const padding = { top: 24, right: 32, bottom: 44, left: 82 };
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(totalInvestment, annualIncome * yearsCount, annualTax * yearsCount);
  const y = (value) => padding.top + chartHeight - (value / maxValue) * chartHeight;
  const plotInset = 18;
  const x = (year) => padding.left + plotInset + ((year - 1) / Math.max(1, yearsCount - 1)) * (width - padding.left - padding.right - plotInset);
  const targetY = y(totalInvestment);
  const labelEvery = yearsCount <= 24 ? 1 : Math.ceil(yearsCount / 12);
  const yearSpacing = (width - padding.left - padding.right) / Math.max(1, yearsCount - 1);
  const barWidth = Math.max(7, Math.min(16, yearSpacing * 0.22));
  const barOffset = Math.max(barWidth * 0.85, Math.min(14, yearSpacing * 0.18));
  const hitWidth = Math.max(32, Math.min(56, yearSpacing * 0.72));
  const hoveredIncome = hoveredYear ? annualIncome * hoveredYear : null;
  const hoveredTax = hoveredYear ? annualTax * hoveredYear : null;
  const tooltipWidth = 156;
  const tooltipX = hoveredYear
    ? Math.min(width - tooltipWidth - 12, Math.max(12, x(hoveredYear) - tooltipWidth / 2))
    : 0;
  const tooltipY = hoveredYear
    ? Math.max(12, Math.min(y(Math.max(hoveredIncome, hoveredTax)) - 76, height - padding.bottom - 92))
    : 0;
  const axisTickCount = 4;
  const axisTicks = Array.from({ length: axisTickCount + 1 }, (_, index) => (maxValue / axisTickCount) * index);

  return (
    <section className="w-full min-w-0 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold uppercase tracking-wide text-gray-400">{t("calculator.resultAccumulationChartTitle")}</p>
        <div className="flex flex-wrap gap-3 text-sm font-medium text-gray-500">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            {t("calculator.resultAccumulatedIncome")}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            {t("calculator.resultAccumulatedTax")}
          </span>
        </div>
      </div>

      <div className="mt-4 pb-2">
        <svg
          role="img"
          aria-label={t("calculator.resultAccumulationChartTitle")}
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          preserveAspectRatio="none"
        >
          <line x1={padding.left} x2={padding.left} y1={padding.top} y2={padding.top + chartHeight} stroke="#E5E7EB" strokeWidth="1" />
          {axisTicks.map((tick) => {
            const tickY = y(tick);
            return (
              <g key={tick}>
                <line x1={padding.left} x2={width - padding.right} y1={tickY} y2={tickY} stroke="#F3F4F6" strokeWidth="1" />
                <line x1={padding.left - 5} x2={padding.left} y1={tickY} y2={tickY} stroke="#D1D5DB" strokeWidth="1" />
                <text x={padding.left - 10} y={tickY + 4} textAnchor="end" fill="#6B7280" fontSize="11" fontWeight="600">
                  {formatCompactEuro(tick)}
                </text>
              </g>
            );
          })}
          <line x1={padding.left} x2={width - padding.right} y1={targetY} y2={targetY} stroke="#6B7280" strokeDasharray="5 5" strokeWidth="1.5" />
          <text x={(padding.left + width - padding.right) / 2} y={Math.max(12, targetY - 8)} textAnchor="middle" fill="#6B7280" fontSize="12" fontWeight="600">
            {t("calculator.resultTotalInvestmentLine", { amount: formatNullablePrice(totalInvestment) })}
          </text>
          <line x1={padding.left} x2={width - padding.right} y1={padding.top + chartHeight} y2={padding.top + chartHeight} stroke="#E5E7EB" strokeWidth="1" />
          <text x={padding.left} y={height } fill="#6B7280" fontSize="12" fontWeight="700">
            {t("calculator.resultRentYearsAxis")}
          </text>

          {Array.from({ length: yearsCount }, (_, index) => {
            const year = index + 1;
            const currentX = x(year);
            const income = annualIncome * year;
            const tax = annualTax * year;
            const showLabel = year === 1 || year === yearsCount || year % labelEvery === 0;

            return (
              <g
                key={year}
                onMouseEnter={() => setHoveredYear(year)}
                onMouseLeave={() => setHoveredYear(null)}
                onFocus={() => setHoveredYear(year)}
                onBlur={() => setHoveredYear(null)}
              >
                <rect
                  x={currentX - hitWidth / 2}
                  y={padding.top}
                  width={hitWidth}
                  height={chartHeight}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={t("calculator.resultChartHoverTitle", {
                    year,
                    income: formatNullablePrice(income),
                    tax: formatNullablePrice(tax),
                  })}
                />
                <line
                  x1={currentX - barOffset / 2}
                  x2={currentX - barOffset / 2}
                  y1={padding.top + chartHeight}
                  y2={y(income)}
                  stroke="#16A34A"
                  strokeWidth={barWidth}
                  strokeLinecap="round"
                >
                  <title>{t("calculator.resultChartIncomeTitle", { year, amount: formatNullablePrice(income) })}</title>
                </line>
                <line
                  x1={currentX + barOffset / 2}
                  x2={currentX + barOffset / 2}
                  y1={padding.top + chartHeight}
                  y2={y(tax)}
                  stroke="#EF4444"
                  strokeWidth={barWidth}
                  strokeLinecap="round"
                >
                  <title>{t("calculator.resultChartTaxTitle", { year, amount: formatNullablePrice(tax) })}</title>
                </line>
                {showLabel && (
                  <text x={currentX} y={height - 16} textAnchor="middle" fill="#6B7280" fontSize="12" fontWeight="600">
                    {year}
                  </text>
                )}
              </g>
            );
          })}

          {hoveredYear && (
            <g pointerEvents="none">
              <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height="70" rx="10" fill="#111827" opacity="0.94" />
              <text x={tooltipX + 12} y={tooltipY + 22} fill="#FFFFFF" fontSize="12" fontWeight="700">
                {t("calculator.resultChartYearLabel", { year: hoveredYear })}
              </text>
              <text x={tooltipX + 12} y={tooltipY + 42} fill="#BBF7D0" fontSize="12" fontWeight="600">
                {t("calculator.resultChartIncomeShort", { amount: formatNullablePrice(hoveredIncome) })}
              </text>
              <text x={tooltipX + 12} y={tooltipY + 60} fill="#FCA5A5" fontSize="12" fontWeight="600">
                {t("calculator.resultChartTaxShort", { amount: formatNullablePrice(hoveredTax) })}
              </text>
            </g>
          )}
        </svg>
      </div>
    </section>
  );
}

function EditableRecommendedRent({ value, onChange, className }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => String(Math.round(Number(value) || 0)));
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) {
      setDraft(String(Math.round(Number(value) || 0)));
    }
  }, [editing, value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const applyDraft = () => {
    const nextValue = Number(draft);
    if (Number.isFinite(nextValue) && nextValue > 0) {
      onChange(nextValue);
      setDraft(String(Math.round(nextValue)));
    } else {
      setDraft(String(Math.round(Number(value) || 0)));
    }
    setEditing(false);
  };

  const cancelDraft = () => {
    setDraft(String(Math.round(Number(value) || 0)));
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex min-w-0 items-center justify-center gap-2">
        <label className="relative min-w-0">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-900">€</span>
          <input
            ref={inputRef}
            type="number"
            min="1"
            inputMode="numeric"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={applyDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyDraft();
              if (event.key === "Escape") cancelDraft();
            }}
            className={`${className} w-28 rounded-xl border border-primary/30 bg-white py-1 pl-8 pr-2 text-center outline-none ring-2 ring-primary/10 lg:w-36`}
          />
        </label>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={applyDraft}
          className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-bold text-white shadow-sm lg:hidden"
        >
          OK
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group/rent relative rounded-xl px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 lg:hover:bg-gray-50 lg:hover:ring-2 lg:hover:ring-primary/10"
    >
      <span className={className}>{formatPrice(value)}</span>
      <span className="pointer-events-none absolute -right-3 top-0 hidden rounded-full bg-white p-1 text-primary opacity-0 shadow-sm ring-1 ring-primary/10 transition-opacity group-hover/rent:opacity-100 lg:block">
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </span>
    </button>
  );
}

function recalculateRentYieldCalculation(calculation, includeRentTax, monthlyRentOverride) {
  const monthlyRent = Number(monthlyRentOverride ?? calculation?.monthly_rent);
  const apartmentPrice = Number(calculation?.apartment_price);
  const additionalInvestments = Number(calculation?.additional_investments) || 0;
  const totalInvestment = Number.isFinite(Number(calculation?.total_investment))
    ? Number(calculation.total_investment)
    : apartmentPrice + additionalInvestments;
  const annualGrossRent = Number.isFinite(monthlyRent) && monthlyRent > 0 ? monthlyRent * 12 : null;
  const monthlyTax = includeRentTax && Number.isFinite(monthlyRent) && monthlyRent > 0 ? monthlyRent * 0.07 : null;
  const annualTax = monthlyTax != null ? monthlyTax * 12 : null;
  const monthlyEffectiveRent = monthlyTax != null ? monthlyRent - monthlyTax : monthlyRent;
  const annualEffectiveRent = annualGrossRent ? annualGrossRent - (annualTax || 0) : null;
  const grossYieldPct = annualGrossRent && totalInvestment > 0 ? (annualGrossRent / totalInvestment) * 100 : null;
  const effectiveYieldPct = annualEffectiveRent && totalInvestment > 0 ? (annualEffectiveRent / totalInvestment) * 100 : null;
  const paybackYears = annualEffectiveRent && annualEffectiveRent > 0 ? totalInvestment / annualEffectiveRent : null;
  const totalTaxUntilPayback = annualTax && paybackYears ? annualTax * paybackYears : null;

  return {
    ...calculation,
    total_investment: totalInvestment,
    include_rent_tax: includeRentTax,
    monthly_rent: monthlyRent,
    annual_gross_rent: annualGrossRent,
    annual_tax: annualTax,
    monthly_tax: monthlyTax,
    monthly_effective_rent: monthlyEffectiveRent,
    annual_effective_rent: annualEffectiveRent,
    gross_yield_pct: grossYieldPct,
    effective_yield_pct: effectiveYieldPct,
    payback_years: paybackYears,
    total_tax_until_payback: totalTaxUntilPayback,
  };
}

function RentTaxToggle({ checked, onChange }) {
  const { t } = useTranslation();

  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm transition-colors hover:border-primary/20 sm:px-6">
      <div>
        <p className="text-sm font-bold text-gray-900 sm:text-base">{t("calculator.resultTaxToggleTitle")}</p>
        <p className="mt-1 text-sm font-medium text-gray-500">{t("calculator.resultTaxToggleDesc")}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-gray-200"}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`}
        />
      </span>
    </label>
  );
}

function RentEstimateResult({ data, onReset, compactLayout = false }) {
  const { t, lang } = useTranslation();
  const estimate = data.estimate || {};
  const range = data.range || {};
  const stats = data.market_stats || {};
  const input = data.input || {};
  const filtersUsed = data.filters_used || {};
  const districts = Array.isArray(input.districts)
    ? input.districts
    : input.district ? [input.district] : [];
  const buildingTypes = Array.isArray(input.building_types)
    ? input.building_types
    : input.building_type ? [input.building_type] : [];
  const listings = (Array.isArray(data.relevant_listings) ? data.relevant_listings : [])
    .map((listing) => normalizeRelevantListing(listing, t, lang))
    .filter(Boolean)
    .slice(0, 3);
  const rentLevelListings = data.rent_level_listings || {};
  const lowListing = normalizeRelevantListing(rentLevelListings.low, t, lang);
  const highListing = normalizeRelevantListing(rentLevelListings.high, t, lang);
  const baseRentYieldCalculation = data.rent_yield_calculation || null;
  const [includeRentTax, setIncludeRentTax] = useState(!!baseRentYieldCalculation?.include_rent_tax);
  const [monthlyRentOverride, setMonthlyRentOverride] = useState(null);
  useEffect(() => {
    setIncludeRentTax(!!baseRentYieldCalculation?.include_rent_tax);
  }, [baseRentYieldCalculation?.include_rent_tax]);
  useEffect(() => {
    setMonthlyRentOverride(null);
  }, [baseRentYieldCalculation?.monthly_rent]);
  const rentYieldCalculation = baseRentYieldCalculation
    ? {
        ...recalculateRentYieldCalculation(baseRentYieldCalculation, includeRentTax, monthlyRentOverride),
        onMonthlyRentChange: setMonthlyRentOverride,
      }
    : null;
  const roomsLabel = input.rooms_count === 1
    ? t("result.oneRoom")
    : t("result.rooms", { count: input.rooms_count });
  const selectedDistrictLabel = districts.length > 0
    ? districts.map((district) => t(`data.district.${district}`)).join(", ")
    : t(`data.city.${input.city}`);
  const comparableCount = Number(stats.comparable_count) || 0;
  const buildRentDistrictHref = (district) => {
    if (!input.city || !input.rooms_count || !district?.district) return null;

    const params = new URLSearchParams();
    params.set("type", "rent");
    params.set("city", input.city);
    params.append("district", district.district);
    params.set("rooms", String(input.rooms_count));
    buildingTypes.forEach((buildingType) => appendDefinedParam(params, "building_type", buildingType));
    appendDefinedParam(params, "renovation", input.renovation);
    return buildEvaluationUrl(params);
  };

  return (
    <div className={compactLayout ? "animate-fade-in flex w-full min-w-0 flex-col gap-5" : "animate-fade-in flex w-full min-w-0 flex-col gap-6"}>
      <div className="w-full min-w-0 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="text-sm font-medium uppercase tracking-wide text-gray-400">{t("result.rentProfileAnalyzed")}</p>
          <ResultDateBadge lang={lang} />
        </div>
        <h2 className="mt-2 text-2xl font-bold text-gray-900">
          {t("result.apartment")} {roomsLabel}
          {input.area_m2 ? ` · ${input.area_m2}m²` : ""}
        </h2>
        <p className="mt-1 text-base text-gray-500">
          {selectedDistrictLabel}{input.city ? `, ${t(`data.city.${input.city}`)}` : ""}
        </p>
        <div className={`mt-4 flex flex-wrap gap-2 ${rentYieldCalculation ? "hidden sm:flex" : ""}`}>
          {input.renovation && (
            <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600">
              {t(`data.renovationType.${input.renovation}`)}
            </span>
          )}
          {buildingTypes.map((buildingType) => (
            <span key={buildingType} className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600">
              {t(`data.buildingType.${buildingType}`)}
            </span>
          ))}
          {input.floor && (
            <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600">
              {t("result.floor", { floor: input.floor })}
            </span>
          )}
          {input.bathrooms_count != null && (
            <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600">
              {input.bathrooms_count === 1 ? t("result.oneBathroom") : t("result.bathrooms", { count: input.bathrooms_count })}
            </span>
          )}
        </div>
      </div>

      {rentYieldCalculation ? (
        <>
          <RentTaxToggle checked={includeRentTax} onChange={setIncludeRentTax} />
          <RentYieldCalculatorPanel
            calculation={rentYieldCalculation}
          />
        </>
      ) : (
        <div className="grid w-full min-w-0 grid-cols-2 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm sm:grid-cols-3">
          <RentLevelListingCard
            label={t("result.rentLower")}
            listing={lowListing}
            fallbackValue={estimate.low}
            tone="emerald"
            ctaLabel={t("result.viewListingCta")}
            className="order-2 border-r border-gray-100 sm:order-1"
          />

          <div className="order-1 col-span-2 flex min-h-56 flex-col items-center justify-center border-b border-gray-100 p-6 text-center sm:order-2 sm:col-span-1 sm:border-b-0 sm:border-r sm:p-8">
            <p className="mb-2 text-base text-gray-400 sm:text-sm">{t("result.rentEstimatedMonthly")}</p>
            <p className="text-6xl font-bold tracking-tight text-gray-900">
              {formatPrice(estimate.market_rate)}
            </p>
            <p className="mt-2 text-base text-gray-500">
              {t("result.rentPerMonth")}
            </p>
          </div>

          <RentLevelListingCard
            label={t("result.rentUpper")}
            listing={highListing}
            fallbackValue={estimate.high}
            tone="amber"
            ctaLabel={t("result.viewListingCta")}
            className="order-3 sm:order-3"
          />
        </div>
      )}

      <div className="flex w-full min-w-0 flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="w-full min-w-0 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <h3 className="mb-1 text-base font-semibold text-gray-900">{t("result.howWeAnalyzed")}</h3>
            <p className="mb-4 text-sm text-gray-400">{t("result.rentHowWeAnalyzedDesc")}</p>
            <div className="flex flex-wrap gap-2">
              <FilterBadge label={t(`data.city.${input.city}`)} active />
              {districts.map((district) => (
                <FilterBadge key={district} label={t(`data.district.${district}`)} active={filtersUsed.district !== false} />
              ))}
              <FilterBadge label={input.rooms_count === 1 ? t("result.oneRoomFilter") : t("result.roomsFilter", { count: input.rooms_count })} active />
              {buildingTypes.map((buildingType) => (
                <FilterBadge key={buildingType} label={t(`data.buildingType.${buildingType}`)} active={filtersUsed.building_type !== false} />
              ))}
              {input.renovation && <FilterBadge label={t(`data.renovationType.${input.renovation}`)} active={filtersUsed.renovation !== false} />}
              {input.area_m2 && <FilterBadge label={`~${input.area_m2}m²`} active={filtersUsed.area !== false} />}
            </div>
            <p className="mt-4 text-sm font-medium text-gray-500">
              {t("result.filtersComparableCount", { count: comparableCount })}
            </p>
          </div>

          <DistrictComparison
            districts={data.district_comparison}
            currentDistricts={districts}
            valueKey="median_price"
            buildHref={buildRentDistrictHref}
          />

          <div className="w-full min-w-0 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <h3 className="mb-4 text-base font-semibold text-gray-900">{t("result.marketStats")}</h3>
            <div className="grid min-w-0 grid-cols-2 gap-5">
              <div>
                <p className="mb-1 text-sm text-gray-400">{t("result.comparableListings")}</p>
                <p className="text-xl font-bold text-gray-900">{comparableCount}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-gray-400">{t("result.avgPricePerM2")}</p>
                <p className="text-xl font-bold text-gray-900">{formatPrice(stats.avg_price_per_m2)}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-gray-400">{t("result.medianPricePerM2")}</p>
                <p className="text-xl font-bold text-gray-900">{formatPrice(stats.median_price_per_m2)}</p>
              </div>
              <div>
                <p className="mb-1 text-sm text-gray-400">{t("result.avgMonthlyRent")}</p>
                <p className="text-xl font-bold text-gray-900">{formatPrice(stats.avg_price)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-gray-400">
              {t("result.rentRange", { low: formatPrice(range.low), high: formatPrice(range.high) })}
            </p>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          {listings.length > 0 && (
            <RelevantListingsPreview
              t={t}
              count={Number(stats.comparable_count) || listings.length}
              listings={listings}
              sidebar
            />
          )}
          <EditCriteriaButton onClick={onReset} compactLayout={compactLayout} />
        </aside>
      </div>

      {rentYieldCalculation && (
        <InfoCallout title={t("calculator.infoTitle")}>
          {t("calculator.infoText")}
        </InfoCallout>
      )}
    </div>
  );
}

export default function EstimateResult({ data, onReset, onCompare, onClose, onListingsModeChange, compactLayout = false }) {
  const {
    estimate,
    range,
    market_stats,
    filters_used,
    district_coefficient,
    district_comparison,
    input,
    feature_adjustments,
    cadastral,
  } = data;
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [favoriteAnimating, setFavoriteAnimating] = useState(false);
  const [showLoginTooltip, setShowLoginTooltip] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalCopyKey, setAuthModalCopyKey] = useState("result.comingSoon");
  const [authModalShowAuthOptions, setAuthModalShowAuthOptions] = useState(true);
  const [showListingsView, setShowListingsView] = useState(false);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const favoriteChecked = useRef(false);
  const duplicatesSectionRef = useRef(null);
  const { t, lang } = useTranslation();
  const { session, isAuthenticated, clearAuthError } = useAuth();
  const isRentEstimate = data.estimate_type === "rent";

  const isPaid = data.full_access === true || data.access_tier === "paid";
  const freeMonthlyLimitReached = data.access_limit?.reason === "free_monthly_limit_reached";
  const lockedSections = data.locked_sections || {};
  const hidePriceTiers = !isPaid && lockedSections.price_tiers !== false;
  const hideMarketPositionNumbers = !isPaid && lockedSections.market_position_numbers !== false;
  const hideDistrictComparisonValues = !isPaid && lockedSections.district_comparison_values !== false;
  const hideMarketStatsValues = !isPaid && lockedSections.market_stats_values !== false;
  const hideSellerBreakdownValues = !isPaid && lockedSections.seller_breakdown_values !== false;

  useEffect(() => () => onListingsModeChange?.(false), [onListingsModeChange]);

  useEffect(() => {
    if (!showListingsView || typeof window === "undefined") return;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showListingsView]);

  // Check if this evaluation is already favorited
  useEffect(() => {
    if (favoriteChecked.current || !session?.access_token) return;
    favoriteChecked.current = true;

    const urlPath = window.location.pathname + window.location.search;
    fetch(`/api/favorites?url_path=${encodeURIComponent(urlPath)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((data) => setFavorited(!!data.favorited))
      .catch(() => { });
  }, [session?.access_token]);

  const openAuthModal = useCallback((copyKey = "result.comingSoon", options = {}) => {
    if (isAuthenticated && !options.force) return;
    setAuthModalCopyKey(typeof copyKey === "string" ? copyKey : "result.comingSoon");
    setAuthModalShowAuthOptions(options.showAuthOptions !== false);
    clearAuthError();
    setIsAuthModalOpen(true);
  }, [clearAuthError, isAuthenticated]);

  const handlePdfAuthRequired = useCallback(() => {
    rememberPdfLoginReturn();
    openAuthModal("result.loginToGeneratePdf");
  }, [openAuthModal]);

  const openFullAnalysisAuthModal = useCallback(() => {
    if (freeMonthlyLimitReached) {
      openAuthModal("result.freeMonthlyLimitReached", {
        force: true,
        showAuthOptions: false,
      });
      return;
    }

    openAuthModal("result.loginToSeeFullAnalysis");
  }, [freeMonthlyLimitReached, openAuthModal]);

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined") return;
    if (!hasPdfLoginReturn()) return;

    const timeoutId = window.setTimeout(() => {
      forgetPdfLoginReturn();
      setIsAuthModalOpen(false);
      setIsPdfDialogOpen(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isAuthenticated]);

  const setListingsMode = (enabled) => {
    setShowListingsView(enabled);
    onListingsModeChange?.(enabled);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleToggleFavorite = async () => {
    if (!isAuthenticated) {
      setShowLoginTooltip(true);
      setTimeout(() => setShowLoginTooltip(false), 2000);
      return;
    }

    const urlPath = window.location.pathname + window.location.search;
    const roomsLbl = input.rooms_count === 1
      ? t("result.oneRoom")
      : t("result.rooms", { count: input.rooms_count });
    const labelParts = [
      `${t("result.apartment")} ${roomsLbl}`,
      input.area_m2 ? `${input.area_m2}m²` : null,
      `${input.district ? t(`data.district.${input.district}`) + ", " : ""}${t(`data.city.${input.city}`)}`,
    ].filter(Boolean);
    const label = labelParts.join(" · ");

    // Optimistic update
    const next = !favorited;
    setFavorited(next);
    setFavoriteAnimating(true);
    setTimeout(() => setFavoriteAnimating(false), 300);

    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ url_path: urlPath, label }),
      });
      if (res.ok) {
        const data = await res.json();
        setFavorited(data.favorited);
      } else {
        setFavorited(!next); // Revert on error
      }
    } catch {
      setFavorited(!next); // Revert on error
    }
  };

  const confidenceLabel = {
    high: t("result.confidenceHigh"),
    medium: t("result.confidenceMedium"),
    low: t("result.confidenceLow"),
  };
  const confidenceColor = {
    high: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-red-100 text-red-700",
  };

  const anyDropped = filters_used && [
    input.district && filters_used.district === false,
    input.building_type && filters_used.building_type === false,
    input.renovation && filters_used.renovation === false,
    (input.floor || input.first_floor || input.last_floor) && filters_used.floor === false,
    input.area_m2 && filters_used.area === false,
  ].some(Boolean);

  const rangeMin = Number(market_stats?.min_price_per_m2) * Number(input.area_m2);
  const rangeMax = Number(market_stats?.max_price_per_m2) * Number(input.area_m2);
  const rangeSpan = rangeMax - rangeMin || 1;
  const computedMarkerPct = Math.max(
    2,
    Math.min(98, ((estimate.market_rate - rangeMin) / rangeSpan) * 100)
  );
  const markerPct = Number.isFinite(data?.market_position?.marker_pct)
    ? data.market_position.marker_pct
    : (Number.isFinite(computedMarkerPct) ? computedMarkerPct : 50);

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);

    try {
      if (data.listing_comparison) {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setSharing(false);
        setTimeout(() => setCopied(false), 2000);
        return;
      }

      const shareParams = {};
      const sp = new URLSearchParams(window.location.search);
      ["city", "district", "rooms", "area", "floor", "first_floor", "last_floor", "total_floors", "building_type", "renovation", "bathrooms", "balconies", "cadastral_number"].forEach((key) => {
        const val = sp.get(key);
        if (val) shareParams[key] = val;
      });

      const headers = { "Content-Type": "application/json" };
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const res = await fetch("/api/share", {
        method: "POST",
        headers,
        body: JSON.stringify(shareParams),
      });

      if (res.ok) {
        const { url } = await res.json();
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback: copy the full URL
        await navigator.clipboard.writeText(window.location.href);
      }
    } catch {
      // Fallback: copy the full URL
      await navigator.clipboard.writeText(window.location.href);
    }

    setCopied(true);
    setSharing(false);
    setTimeout(() => setCopied(false), 2000);
  };

  const roomsLabel = input.rooms_count === 1
    ? t("result.oneRoom")
    : t("result.rooms", { count: input.rooms_count });
  const titleParts = [
    `${t("result.apartment")} ${roomsLabel}`,
    input.area_m2 ? `${input.area_m2}m²` : null,
  ].filter(Boolean);

  const floorLabel = (() => {
    if (input.first_floor || input.last_floor) {
      return [
        input.first_floor ? t("result.floorOption.first") : null,
        input.last_floor ? t("result.floorOption.last") : null,
      ].filter(Boolean).join(", ");
    }
    if (!input.floor) return null;
    if (input.floor === 1) return t("result.groundFloor");
    if (input.total_floors && input.floor === input.total_floors)
      return t("result.lastFloor", { floor: input.floor });
    return input.total_floors
      ? t("result.floorOf", { floor: input.floor, total: input.total_floors })
      : t("result.floor", { floor: input.floor });
  })();

  const indRate = data.estimates_by_seller?.individual?.estimate?.market_rate;
  const agRate = data.estimates_by_seller?.agency?.estimate?.market_rate;
  const individualComparableCount = Number(data.estimates_by_seller?.individual?.market_stats?.comparable_count);
  const agencyComparableCount = Number(data.estimates_by_seller?.agency?.market_stats?.comparable_count);
  const sellerDelta = (indRate && agRate) ? (agRate - indRate) : null;
  const sellerDeltaPct = (indRate && agRate) ? ((sellerDelta / indRate) * 100) : null;
  const listingComparison = data.listing_comparison || null;
  const listingAsking = listingComparison ? Number(listingComparison.asking_price) : null;
  const listingCurrency = String(listingComparison?.currency || "EUR").toUpperCase();
  const listingUrl = listingComparison?.external_id
    ? build999ListingUrl(listingComparison.external_id, lang)
    : null;
  const listingImageUrl = listingComparison?.image_url || null;
  const listingAddressLabel = listingComparison?.address_text
    ? formatDuplicateListingAddress(listingComparison.address_text)
    : null;
  const marketRate = Number(estimate?.market_rate);
  const listingComparable = !!listingComparison
    && Number.isFinite(listingAsking) && listingAsking > 0
    && listingCurrency === "EUR"
    && Number.isFinite(marketRate) && marketRate > 0;
  const listingDelta = listingComparable ? listingAsking - marketRate : null;
  const listingDeltaPct = listingComparable ? (listingDelta / marketRate) * 100 : null;
  const listingAskingLabel = listingComparison
    ? formatCurrencyPrice(listingAsking, listingCurrency)
    : null;
  const listingDeltaAmountLabel = listingComparable
    ? `${listingDelta > 0 ? "+" : listingDelta < 0 ? "-" : ""}${formatPrice(Math.abs(listingDelta))}`
    : null;
  const listingVerdict = listingComparable
    ? (listingDeltaPct < -LISTING_FAIR_BAND_PCT ? "under" : listingDeltaPct > LISTING_FAIR_BAND_PCT ? "over" : "fair")
    : null;
  const listingVerdictColor = listingVerdict === "under"
    ? "text-emerald-600"
    : listingVerdict === "over"
      ? "text-amber-600"
      : "text-primary";
  const listingVerdictLabel = listingVerdict === "under"
    ? t("result.listingUnderMarket")
    : listingVerdict === "over"
      ? t("result.listingOverMarket")
      : t("result.listingAtMarket");
  const listingArea = Number(input?.area_m2);
  const listingPricePerM2 = listingComparable && Number.isFinite(listingArea) && listingArea > 0
    ? listingAsking / listingArea
    : null;
  const marketPricePerM2 = Number(estimate?.price_per_m2);
  const canShowListingPerM2 = Number.isFinite(listingPricePerM2) && listingPricePerM2 > 0;
  const canShowMarketPerM2 = Number.isFinite(marketPricePerM2) && marketPricePerM2 > 0;
  const listingVerdictBg = listingVerdict === "under"
    ? "bg-emerald-50/80"
    : listingVerdict === "over"
      ? "bg-amber-50/80"
      : "bg-sky-50/80";
  const listingPanelBg = listingVerdict === "under"
    ? "bg-emerald-50/60"
    : listingVerdict === "over"
      ? "bg-amber-50/60"
      : "bg-gray-50";
  const listingAccentBg = listingVerdict === "under"
    ? "bg-emerald-600"
    : listingVerdict === "over"
      ? "bg-amber-500"
      : "bg-primary";
  const listingToneBorder = listingVerdict === "under"
    ? "border-emerald-100"
    : listingVerdict === "over"
      ? "border-amber-100"
      : "border-sky-100";
  const listingVerdictSentence = listingComparable
    ? (listingVerdict === "fair"
      ? t("result.listingDeltaFair", { percent: Math.abs(listingDeltaPct).toFixed(1) })
      : t(listingVerdict === "under" ? "result.listingDeltaBelow" : "result.listingDeltaAbove", {
        amount: formatPrice(Math.abs(listingDelta)),
        percent: Math.abs(listingDeltaPct).toFixed(1),
      }))
    : null;
  const listingsCount = Number.isFinite(Number(market_stats?.comparable_count))
    ? Number(market_stats.comparable_count)
    : 0;
  const listingPreviewItems = (Array.isArray(data.relevant_listings) ? data.relevant_listings : [])
    .map((listing) => normalizeRelevantListing(listing, t, lang))
    .filter(Boolean)
    .slice(0, 3);
  const listingDuplicatesData = data.listing_duplicates || null;
  const listingDuplicateHighItems = (Array.isArray(listingDuplicatesData?.high) ? listingDuplicatesData.high : [])
    .map((listing) => normalizeDuplicateListing(listing, t, lang, "high"))
    .filter(Boolean);
  const listingDuplicateMediumItems = (Array.isArray(listingDuplicatesData?.medium) ? listingDuplicatesData.medium : [])
    .map((listing) => normalizeDuplicateListing(listing, t, lang, "medium"))
    .filter(Boolean);
  const listingDuplicateItems = [...listingDuplicateHighItems, ...listingDuplicateMediumItems];
  const listingDuplicateCount = listingDuplicatesData
    ? listingDuplicateItems.length
    : 0;
  const hasListingDuplicates = listingDuplicateCount > 0;
  const resultLayoutClassName = compactLayout
    ? "animate-fade-in flex flex-col gap-5"
    : "animate-fade-in flex flex-col gap-5 lg:gap-6";
  const analysisLayoutClassName = compactLayout
    ? "flex flex-col gap-5"
    : "flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)] lg:items-start lg:gap-6";
  const analysisColumnClassName = compactLayout
    ? "flex flex-col gap-5"
    : "flex flex-col gap-5";
  const supportColumnClassName = compactLayout
    ? "flex flex-col gap-5"
    : "flex flex-col gap-5";
  const actionButtonClassName = getActionButtonClassName(compactLayout);
  const primaryActionButtonClassName = `${actionButtonClassName} w-full cursor-pointer font-semibold bg-primary text-white shadow-lg shadow-primary/20 hover:-translate-y-0.5 hover:bg-primary-dark hover:shadow-xl hover:shadow-primary/25 transition-all flex items-center justify-center gap-2`;
  const secondaryActionButtonClassName = getSecondaryActionButtonClassName(compactLayout);
  const actionIconClassName = getActionIconClassName(compactLayout);
  const closeAuthModal = useCallback(() => {
    forgetPdfLoginReturn();
    setIsAuthModalOpen(false);
  }, []);
  const scrollToDuplicateListings = useCallback(() => {
    duplicatesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const headerControls = (
    <div className="flex items-center gap-2">
      <ResultDateBadge lang={lang} />
      <button
        type="button"
        onClick={handleToggleFavorite}
        className={`relative inline-flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer hover:bg-gray-100 transition-all duration-200 ${favoriteAnimating ? "scale-125" : "scale-100"
          } ${favorited ? "text-primary" : "text-gray-400 hover:text-gray-600"}`}
        title={favorited ? t("result.removeFavorite") : t("result.addFavorite")}
      >
        <BookmarkIcon size={22} filled={favorited} />
        {showLoginTooltip && (
          <span className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium whitespace-nowrap shadow-lg animate-fade-in">
            {t("result.loginToFavorite")}
            <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-gray-900" />
          </span>
        )}
      </button>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer hover:bg-red-50 transition-all duration-200 text-gray-400 hover:text-red-500"
        >
          <CloseIcon size={20} />
        </button>
      )}
    </div>
  );

  if (isRentEstimate) {
    return (
      <RentEstimateResult
        data={data}
        onReset={onReset}
        compactLayout={compactLayout}
      />
    );
  }

  if (showListingsView) {
    return (
      <ListingAlertConfigurator
        baseInput={input}
        filtersUsed={filters_used}
        count={listingsCount}
        onBack={() => setListingsMode(false)}
      />
    );
  }

  return (
    <div className={resultLayoutClassName}>
      <AuthRequiredModal
        open={isAuthModalOpen}
        copyKey={authModalCopyKey}
        showAuthOptions={authModalShowAuthOptions}
        onClose={closeAuthModal}
      />
      <ValuationPdfDialog
        open={isPdfDialogOpen}
        data={data}
        accessToken={session?.access_token || null}
        onAuthRequired={handlePdfAuthRequired}
        onClose={() => setIsPdfDialogOpen(false)}
      />

      {/* Property summary header */}
      <div className={`${compactLayout ? "" : "order-1"} rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8`}>
        <div className="flex flex-col gap-4">
          {listingComparison && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs sm:text-sm text-gray-400 uppercase font-medium">{t("result.listingAnalysisTitle")}</p>
              {headerControls}
            </div>
          )}
          <div className="flex items-start gap-4 sm:gap-5">
            {listingComparison ? (
              <div className="w-28 shrink-0 sm:w-32">
                <div
                  className={`flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-gray-100 ${listingImageUrl
                    ? "bg-cover bg-center"
                    : "text-gray-300"
                    }`}
                  style={listingImageUrl ? { backgroundImage: `url(${JSON.stringify(listingImageUrl)})` } : undefined}
                >
                  {!listingImageUrl && (
                    <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z" />
                      <path d="M9 21v-7h6v7" />
                      <path d="M7 11h2M15 11h2" />
                    </svg>
                  )}
                </div>
              </div>
            ) : (
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-primary" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
                  <path d="M9 21V12h6v9" />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0">
              {!listingComparison && (
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-gray-400 uppercase font-medium">{t("result.profileAnalyzed")}</p>
                  {headerControls}
                </div>
              )}
              <div className={`${listingComparison ? "mt-0" : "mt-4 -ml-16 w-[calc(100%+4rem)]"} ${compactLayout ? "lg:ml-0 lg:w-auto" : `lg:mt-0 lg:grid lg:grid-cols-2 lg:items-start lg:gap-0 ${listingComparison ? "lg:-ml-[9.25rem] lg:w-[calc(100%+9.25rem)]" : ""}`}`}>
                <div className={`min-w-0 ${compactLayout ? "" : listingComparison ? "lg:pl-[9.25rem] lg:pr-8" : "lg:pl-16 lg:pr-6"}`}>
                  <h2 className="text-xl font-bold text-gray-900 leading-snug">
                    {titleParts.join(" · ")}
                  </h2>
                  <p className="text-base text-gray-500 mt-1">
                    {input.district && `${t(`data.district.${input.district}`)}, `}{t(`data.city.${input.city}`)}
                    {listingComparison && listingAddressLabel ? `, ${listingAddressLabel}` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {input.building_type && (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium text-gray-600">
                        {t(`data.buildingType.${input.building_type}`)}
                      </span>
                    )}
                    {input.renovation && (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium text-gray-600">
                        {t(`data.renovationType.${input.renovation}`)}
                      </span>
                    )}
                    {floorLabel && (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium text-gray-600">
                        {floorLabel}
                      </span>
                    )}
                    {input.bathrooms_count != null && (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium text-gray-600">
                        {input.bathrooms_count === 0
                          ? t("result.noBathroom")
                          : input.bathrooms_count === 1
                            ? t("result.oneBathroom")
                            : t("result.bathrooms", { count: input.bathrooms_count })}
                      </span>
                    )}
                    {input.balconies_count != null && (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium text-gray-600">
                        {input.balconies_count === 0
                          ? t("result.noBalcony")
                          : input.balconies_count === 1
                            ? t("result.oneBalcony")
                            : t("result.balconies", { count: input.balconies_count })}
                      </span>
                    )}
                  </div>
                  {listingComparison && listingDuplicatesData && (
                    <button
                      type="button"
                      onClick={hasListingDuplicates ? scrollToDuplicateListings : undefined}
                      disabled={!hasListingDuplicates}
                      className={`mt-4 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                        hasListingDuplicates
                          ? "cursor-pointer border-primary/10 bg-primary/5 hover:border-primary/30 hover:bg-primary/10"
                          : "cursor-default border-emerald-100 bg-emerald-50"
                      }`}
                    >
                      {hasListingDuplicates ? (
                        <>
                          <span className="text-lg font-bold leading-none text-primary">{listingDuplicateCount.toLocaleString("ro-MD")}</span>
                          <span className="text-sm font-medium text-gray-600">
                            {t("result.listingDuplicateCount", { count: listingDuplicateCount })}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-semibold text-emerald-700">
                          {t("result.listingDuplicateNoneFound")}
                        </span>
                      )}
                    </button>
                  )}
                </div>
                {listingComparison ? (
                  <ListingPriceHistoryChart
                    history={listingComparison.price_history}
                    currency={listingCurrency}
                    compact={compactLayout}
                  />
                ) : (
                  <MarketTrendMiniChart trend={data.market_trend} compact={compactLayout} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main estimate */}
      <div className={`${compactLayout ? "" : "order-2"} rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden`}>
        {listingComparison ? (
          <>
            <div className="p-5 sm:p-6 lg:p-8">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch">
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-5 text-center sm:p-6">
                  <p className="text-sm font-medium text-gray-400">{t("result.estimatedPrice")}</p>
                  <p className="mt-2 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
                    {formatPrice(estimate.market_rate)}
                  </p>
                  <p className="mt-2 text-sm font-medium text-gray-500">
                    {hidePriceTiers ? (
                      <LockedValue onClick={openFullAnalysisAuthModal} text="€9.999/m²" className="text-gray-500" />
                    ) : (
                      `${formatPrice(estimate.price_per_m2)}/m²`
                    )}
                  </p>
                </div>

                <div className={`relative overflow-hidden rounded-xl border p-5 text-center sm:p-6 ${listingPanelBg} ${listingToneBorder}`}>
                  {listingComparable && (
                    <span className={`absolute inset-x-0 top-0 h-1 ${listingAccentBg}`} aria-hidden="true" />
                  )}
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-sm font-medium text-gray-500">{t("result.listingAskingPrice")}</p>
                    {listingComparable && (
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-white ${listingVerdictColor}`} aria-label={listingVerdictLabel} title={listingVerdictLabel}>
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          {listingVerdict === "under" ? (
                            <>
                              <path d="M12 5v14" />
                              <path d="m19 12-7 7-7-7" />
                            </>
                          ) : listingVerdict === "over" ? (
                            <>
                              <path d="M12 19V5" />
                              <path d="m5 12 7-7 7 7" />
                            </>
                          ) : (
                            <path d="M5 12h14" />
                          )}
                        </svg>
                      </span>
                    )}
                  </div>
                  <p className={`mt-2 text-4xl font-bold tracking-tight sm:text-5xl ${listingComparable ? listingVerdictColor : "text-gray-900"}`}>
                    {listingAskingLabel}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm font-medium">
                    {listingComparable ? (
                      <>
                        <span className={listingVerdictColor}>{formatTrendPercent(listingDeltaPct)}</span>
                        <span className="text-gray-300">·</span>
                        <span className={listingVerdictColor}>{listingDeltaAmountLabel}</span>
                      </>
                    ) : (
                      <span className="text-gray-500">{t("result.listingComparisonUnavailable")}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm">
                    <p className="text-xs font-medium text-gray-400">{t("result.fastSale")}</p>
                    <p className="mt-1 text-lg font-bold text-emerald-600">
                      {hidePriceTiers ? (
                        <LockedValue onClick={openFullAnalysisAuthModal} text="€999.999" className="text-emerald-600" />
                      ) : (
                        formatPrice(estimate.fast_sale)
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {hidePriceTiers ? (
                        <LockedValue onClick={openFullAnalysisAuthModal} text="-99%" />
                      ) : (
                        "-10%"
                      )}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm">
                    <p className="text-xs font-medium text-gray-400">{t("result.targetPrice")}</p>
                    <p className="mt-1 text-lg font-bold text-amber-600">
                      {hidePriceTiers ? (
                        <LockedValue onClick={openFullAnalysisAuthModal} text="€999.999" className="text-amber-600" />
                      ) : (
                        formatPrice(estimate.premium)
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {hidePriceTiers ? (
                        <LockedValue onClick={openFullAnalysisAuthModal} text="+99%" />
                      ) : (
                        "+8%"
                      )}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-xs font-medium text-gray-400">{t("result.listingAskingPerM2")}</p>
                  <p className={`mt-1 text-lg font-bold ${canShowListingPerM2 ? listingVerdictColor : "text-gray-900"}`}>
                    {canShowListingPerM2 ? `${formatPrice(listingPricePerM2)}/m²` : "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {hidePriceTiers ? (
                      <>
                        {t("result.marketPerM2")} <LockedValue onClick={openFullAnalysisAuthModal} text="€9.999/m²" />
                      </>
                    ) : canShowMarketPerM2 ? `${t("result.marketPerM2")} ${formatPrice(marketPricePerM2)}/m²` : t("result.marketPerM2")}
                  </p>
                </div>
              </div>
            </div>

            <div className={`border-t border-gray-100 px-5 py-4 sm:px-6 ${listingComparable ? listingVerdictBg : "bg-gray-50"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className={`text-sm font-bold sm:text-base ${listingComparable ? listingVerdictColor : "text-gray-600"}`}>
                  {listingComparable ? listingVerdictSentence : t("result.listingComparisonUnavailable")}
                </p>
                {listingUrl && (
                  <a
                    href={listingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex shrink-0 items-center justify-center rounded-lg border border-current px-3 py-2 text-sm font-bold transition-colors hover:bg-white/60 ${listingComparable ? listingVerdictColor : "text-primary"}`}
                  >
                    {t("result.viewListingCta")}
                  </a>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="p-6 sm:p-8 text-center border-b border-gray-100">
              <p className="text-base text-gray-400 mb-2">{t("result.estimatedPrice")}</p>
              <p className="text-6xl font-bold tracking-tight text-gray-900">
                {formatPrice(estimate.market_rate)}
              </p>
              <p className="text-base text-gray-500 mt-2">
                {hidePriceTiers ? (
                  <LockedValue onClick={openFullAnalysisAuthModal} text="€9.999/m²" className="text-gray-500" />
                ) : (
                  `${formatPrice(estimate.price_per_m2)}/m²`
                )}
              </p>
            </div>

            <div className="grid grid-cols-2 divide-x divide-gray-100 sm:grid-cols-3">
              <div className="p-5 text-center sm:p-6">
                <p className="text-sm text-gray-400 mb-1">{t("result.fastSale")}</p>
                <p className="text-xl font-bold text-emerald-600">
                  {hidePriceTiers ? (
                    <LockedValue onClick={openFullAnalysisAuthModal} text="€999.999" className="text-emerald-600" />
                  ) : (
                    formatPrice(estimate.fast_sale)
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {hidePriceTiers ? (
                    <LockedValue onClick={openFullAnalysisAuthModal} text="-99%" />
                  ) : (
                    "-10%"
                  )}
                </p>
              </div>
              <div className="hidden p-5 text-center bg-primary/5 sm:block sm:p-6">
                <p className="text-sm text-gray-400 mb-1">{t("result.marketPrice")}</p>
                <p className="text-xl font-bold text-primary">
                  {formatPrice(estimate.market_rate)}
                </p>
              </div>
              <div className="p-5 text-center sm:p-6">
                <p className="text-sm text-gray-400 mb-1">{t("result.targetPrice")}</p>
                <p className="text-xl font-bold text-amber-600">
                  {hidePriceTiers ? (
                    <LockedValue onClick={openFullAnalysisAuthModal} text="€999.999" className="text-amber-600" />
                  ) : (
                    formatPrice(estimate.premium)
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {hidePriceTiers ? (
                    <LockedValue onClick={openFullAnalysisAuthModal} text="+99%" />
                  ) : (
                    "+8%"
                  )}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {!isPaid && (
        <p className={`${compactLayout ? "" : "order-3"} text-sm text-gray-600 px-1`}>
          {freeMonthlyLimitReached ? t("result.freeMonthlyLimitReachedLine") : t("result.freeTierUncertaintyLine")}
        </p>
      )}

      <div className={`${analysisLayoutClassName} ${compactLayout ? "" : "order-4"}`}>
        <div className={analysisColumnClassName}>

          {/* Seller category breakdown */}
          {(data.estimates_by_seller?.individual || data.estimates_by_seller?.agency) && (
            <div className={`${compactLayout ? "" : "order-3"} rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden`}>
              <div className="p-4 sm:p-5 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{t("result.sellerBreakdown")}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{t("result.sellerBreakdownDesc")}</p>
                </div>
                {(hideSellerBreakdownValues || (indRate && agRate)) && (
                  <div className="flex flex-wrap items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{t("result.sellerDifference")}</span>
                    {hideSellerBreakdownValues ? (
                      <LockedValue onClick={openFullAnalysisAuthModal} text="+€99.999 (+9.9%)" className="text-gray-700" />
                    ) : (
                      <span className={`text-sm font-bold ${sellerDelta > 0 ? "text-amber-600" : sellerDelta < 0 ? "text-emerald-600" : "text-gray-900"}`}>
                        {sellerDelta > 0 ? "+" : ""}€{Math.abs(sellerDelta).toLocaleString("ro-MD")} ({sellerDelta > 0 ? "+" : ""}{sellerDeltaPct.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 divide-x divide-gray-100">
                <div className="p-4 sm:p-5 text-center">
                  <p className="text-sm text-gray-500 mb-1 font-medium">{t("result.sellerIndividual")}</p>
                  {data.estimates_by_seller.individual && (hideSellerBreakdownValues || data.estimates_by_seller.individual?.estimate?.market_rate) ? (
                    <>
                      <p className="text-xl font-bold text-gray-900">
                        {hideSellerBreakdownValues ? (
                          <LockedValue onClick={openFullAnalysisAuthModal} text="€999.999" className="text-gray-900" />
                        ) : (
                          formatPrice(data.estimates_by_seller.individual.estimate.market_rate)
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {hideSellerBreakdownValues ? (
                          <LockedValue onClick={openFullAnalysisAuthModal} text="€9.999/m²" className="text-gray-400" />
                        ) : (
                          `${formatPrice(data.estimates_by_seller.individual.estimate.price_per_m2)}/m²`
                        )}
                      </p>
                      {Number.isFinite(individualComparableCount) && individualComparableCount > 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          {t("result.trendListings", { count: individualComparableCount })}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-400 italic py-2 mt-1">{t("result.noData")}</p>
                  )}
                </div>
                <div className="p-4 sm:p-5 text-center">
                  <p className="text-sm text-gray-500 mb-1 font-medium">{t("result.sellerAgency")}</p>
                  {data.estimates_by_seller.agency && (hideSellerBreakdownValues || data.estimates_by_seller.agency?.estimate?.market_rate) ? (
                    <>
                      <p className="text-xl font-bold text-gray-900">
                        {hideSellerBreakdownValues ? (
                          <LockedValue onClick={openFullAnalysisAuthModal} text="€999.999" className="text-gray-900" />
                        ) : (
                          formatPrice(data.estimates_by_seller.agency.estimate.market_rate)
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {hideSellerBreakdownValues ? (
                          <LockedValue onClick={openFullAnalysisAuthModal} text="€9.999/m²" className="text-gray-400" />
                        ) : (
                          `${formatPrice(data.estimates_by_seller.agency.estimate.price_per_m2)}/m²`
                        )}
                      </p>
                      {Number.isFinite(agencyComparableCount) && agencyComparableCount > 0 && (
                        <p className="text-xs text-gray-400 mt-1">
                          {t("result.trendListings", { count: agencyComparableCount })}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-400 italic py-2 mt-1">{t("result.noData")}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {cadastral && (
            <CadastralDataCard
              cadastral={cadastral}
              className={compactLayout ? "" : "order-6"}
            />
          )}

          {/* Price position on range */}
          <div className={`${compactLayout ? "" : "order-2"} rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8`}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              {t("result.marketPosition")}
            </h3>
            <p className="text-sm text-gray-400 mb-5">
              {t("result.marketPositionDesc")}
            </p>

            <div className="relative pt-6 pb-1">
              <div
                className="absolute top-2 -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${markerPct}%` }}
              >
                <div className="w-0 h-0 border-l-[9px] border-l-transparent border-r-[9px] border-r-transparent border-t-[9px] border-t-primary" />
              </div>

              <div className="h-3 bg-gray-100 rounded-full relative overflow-hidden">
                <div
                  className="absolute inset-y-0 bg-linear-to-r from-emerald-200 via-primary/30 to-amber-200 rounded-full"
                  style={{ left: "10%", right: "10%" }}
                />
              </div>

              <div className="flex justify-between mt-3">
                <span className="text-xs text-gray-400">
                  {hideMarketPositionNumbers ? (
                    <LockedValue onClick={openFullAnalysisAuthModal} text="€999.999" />
                  ) : (
                    formatPrice(range.low)
                  )}
                </span>
                <span className="text-sm text-gray-500 font-medium">
                  {hideMarketPositionNumbers ? (
                    <LockedValue onClick={openFullAnalysisAuthModal} text={t("result.median", { price: "€9.999" })} />
                  ) : (
                    t("result.median", { price: formatPrice(market_stats.median_price_per_m2) })
                  )}
                </span>
                <span className="text-xs text-gray-400">
                  {hideMarketPositionNumbers ? (
                    <LockedValue onClick={openFullAnalysisAuthModal} text="€999.999" />
                  ) : (
                    formatPrice(range.high)
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* How we calculated */}
          <div className={`${compactLayout ? "" : "order-1"} rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8`}>
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              {t("result.howWeAnalyzed")}
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              {t("result.howWeAnalyzedDesc")}
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              <FilterBadge label={t(`data.city.${input.city}`)} active={true} />
              {input.district && (
                <FilterBadge
                  label={t(`data.district.${input.district}`)}
                  active={filters_used?.district !== false}
                />
              )}
              {input.rooms_count && (
                <FilterBadge
                  label={
                    input.rooms_count === 1
                      ? t("result.oneRoomFilter")
                      : t("result.roomsFilter", { count: input.rooms_count })
                  }
                  active={true}
                />
              )}
              {input.building_type && (
                <FilterBadge
                  label={t(`data.buildingType.${input.building_type}`)}
                  active={filters_used?.building_type !== false}
                />
              )}
              {input.renovation && (
                <FilterBadge
                  label={t(`data.renovationType.${input.renovation}`)}
                  active={filters_used?.renovation !== false}
                />
              )}
              {input.area_m2 && (
                <FilterBadge
                  label={
                    filters_used?.area !== false && filters_used?.area_tolerance
                      ? `${Math.round(input.area_m2 * (1 - filters_used.area_tolerance))}–${Math.round(input.area_m2 * (1 + filters_used.area_tolerance))}m²`
                      : `~${input.area_m2}m²`
                  }
                  active={filters_used?.area !== false}
                />
              )}
              {(input.floor || input.first_floor || input.last_floor) && (
                <FilterBadge
                  label={
                    input.first_floor || input.last_floor
                      ? [
                        input.first_floor ? t("result.floorOption.first") : null,
                        input.last_floor ? t("result.floorOption.last") : null,
                      ].filter(Boolean).join(", ")
                      : input.floor === 1
                      ? t("result.floorGround")
                      : input.total_floors && input.floor === input.total_floors
                        ? t("result.floorLast", { floor: input.floor })
                        : t("result.floorRange", {
                          from: Math.max(2, input.floor - 2),
                          to: input.total_floors
                            ? Math.min(input.total_floors - 1, input.floor + 2)
                            : input.floor + 2,
                        })
                  }
                  active={filters_used?.floor !== false}
                />
              )}
            </div>

            {feature_adjustments?.items?.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-gray-400 mb-2">{t("result.featureAdjustments")}</p>
                <div className="flex flex-wrap gap-2">
                  {feature_adjustments.items.map((item) => (
                    <FeatureAdjustmentBadge key={item.type} item={item} />
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {t("result.totalAdjustment")}{" "}
                  <span className={feature_adjustments.total_pct > 0 ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                    {feature_adjustments.total_pct > 0 ? "+" : ""}{feature_adjustments.total_pct}%
                  </span>{" "}
                  {t("result.vsComparables")}
                </p>
              </div>
            )}

            {anyDropped && (
              <p className="text-sm text-gray-600 bg-gray-100 rounded-lg px-4 py-2.5 mb-4 border border-gray-200">
                {t("result.droppedFilters")}
              </p>
            )}

            {district_coefficient?.applied ? (
              <div className="space-y-2">
                <div className="p-4 rounded-xl bg-gray-50">
                  <div className="flex items-center gap-4 justify-center">
                    <div className="text-center">
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                        {t("result.cityMedian")}
                      </p>
                      <p className="text-base font-bold text-gray-600">
                        {formatPrice(market_stats.median_price_per_m2)}/m²
                      </p>
                    </div>
                    <span className="text-gray-300 text-lg">×</span>
                    <div className="text-center">
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                        {t("result.districtCoef", { district: t(`data.district.${input.district}`) })}
                      </p>
                      <p className="text-base font-bold text-gray-600">
                        {district_coefficient.value}
                      </p>
                    </div>
                    <span className="text-gray-300 text-lg">=</span>
                    <div className="text-center">
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                        {t("result.adjusted")}
                      </p>
                      <p className="text-base font-bold text-primary">
                        {formatPrice(estimate.price_per_m2)}/m²
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-400 text-center">
                  {input.area_m2 ? `× ${input.area_m2}m² = ${formatPrice(estimate.market_rate)}` : formatPrice(estimate.market_rate)}
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-gray-50 text-center">
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                  {t("result.segmentMedian")}
                </p>
                <p className="text-2xl font-bold text-primary">
                  {hideMarketStatsValues ? (
                    <LockedValue onClick={openFullAnalysisAuthModal} text="€9.999/m²" className="text-primary" />
                  ) : (
                    `${formatPrice(market_stats.median_price_per_m2)}/m²`
                  )}
                </p>
                {input.area_m2 && (
                  <p className="text-sm text-gray-400 mt-1.5">
                    {hideMarketStatsValues ? (
                      <LockedValue onClick={openFullAnalysisAuthModal} text={`× ${input.area_m2}m² = €999.999`} />
                    ) : (
                      `× ${input.area_m2}m² = ${formatPrice(estimate.market_rate)}`
                    )}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* District comparison */}
          <DistrictComparison
            districts={district_comparison}
            currentDistrict={input.district}
            area={input.area_m2}
            blurValues={hideDistrictComparisonValues}
            onLockedClick={openFullAnalysisAuthModal}
            className={compactLayout ? "" : "order-4"}
          />

          {/* Market stats */}
          <div className={`${compactLayout ? "" : "order-5"} rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8`}>
            <h3 className="text-base font-semibold text-gray-900 mb-4">
              {t("result.marketStats")}
            </h3>
            <div className="grid grid-cols-2 gap-5">
              {/* <div>
            <p className="text-sm text-gray-400 mb-1">{t("result.comparableListings")}</p>
            <p className="text-xl font-bold text-gray-900">{market_stats.comparable_count}</p>
          </div> */}
              <div>
                <p className="text-sm text-gray-400 mb-1">{t("result.avgPricePerM2")}</p>
                <p className="text-xl font-bold text-gray-900">
                  {hideMarketStatsValues ? (
                    <LockedValue onClick={openFullAnalysisAuthModal} text="€9.999" />
                  ) : (
                    formatPrice(market_stats.avg_price_per_m2)
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">{t("result.medianPricePerM2")}</p>
                <p className="text-xl font-bold text-gray-900">
                  {hideMarketStatsValues ? (
                    <LockedValue onClick={openFullAnalysisAuthModal} text="€9.999" />
                  ) : (
                    formatPrice(market_stats.median_price_per_m2)
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">{t("result.avgTotalPrice")}</p>
                <p className="text-xl font-bold text-gray-900">
                  {hideMarketStatsValues ? (
                    <LockedValue onClick={openFullAnalysisAuthModal} text="€999.999" />
                  ) : (
                    formatPrice(market_stats.avg_price)
                  )}
                </p>
              </div>
            </div>
          </div>

        </div>
        <aside className={supportColumnClassName}>

          <DuplicateListingsPreview
            t={t}
            count={listingDuplicateCount}
            listings={listingDuplicateItems}
            sectionRef={duplicatesSectionRef}
          />

          {!hideMarketStatsValues && (
            <RelevantListingsPreview
              t={t}
              count={listingsCount}
              listings={listingPreviewItems}
              onViewAll={() => setListingsMode(true)}
              sidebar={!compactLayout}
            />
          )}

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setIsPdfDialogOpen(true)}
              className={primaryActionButtonClassName}
            >
              <svg viewBox="0 0 24 24" className={actionIconClassName} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M9 13h6" />
                <path d="M9 17h6" />
              </svg>
              {t("result.pdfButton")}
            </button>
            <button
              type="button"
              onClick={handleShare}
              className={secondaryActionButtonClassName}
            >
              {sharing ? (
                <>
                  <svg className={`${actionIconClassName} animate-spin`} viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  {t("result.sharing")}
                </>
              ) : copied ? (
                <>
                  <svg viewBox="0 0 24 24" className={actionIconClassName} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  {t("result.linkCopied")}
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className={actionIconClassName} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                  {t("result.shareAnalysis")}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onCompare}
              className={secondaryActionButtonClassName}
            >
              <svg viewBox="0 0 24 24" className={actionIconClassName} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="18" r="3" />
                <circle cx="6" cy="6" r="3" />
                <path d="M13 6h3a2 2 0 0 1 2 2v7" />
                <path d="M11 18H8a2 2 0 0 1-2-2V9" />
              </svg>
              {t("result.compare")}
            </button>
            <EditCriteriaButton onClick={onReset} compactLayout={compactLayout} />
          </div>
        </aside>
      </div>
    </div>
  );
}
