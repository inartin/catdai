"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import BookmarkIcon from "@/components/icons/BookmarkIcon";
import CloseIcon from "@/components/icons/CloseIcon";
import AuthOptions from "@/components/AuthOptions";
import ListingAlertConfigurator from "@/components/ListingAlertConfigurator";
import ValuationPdfDialog from "@/components/ValuationPdfDialog";

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
    tags,
  };
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

function DistrictComparison({ districts, currentDistrict, area, className = "" }) {
  const { t } = useTranslation();

  if (!districts || districts.length < 2) return null;

  const areaValue = Number(area);
  const hasArea = Number.isFinite(areaValue) && areaValue > 0;
  const numericMedians = districts
    .map((d) => Number(d?.median_ppm))
    .filter((value) => Number.isFinite(value) && value > 0);
  const maxPpm = numericMedians.length > 0 ? Math.max(...numericMedians) : null;

  return (
    <div className={`${className} rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8`}>
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        {t("result.districtComparison")}
      </h3>
      <p className="text-sm text-gray-400 mb-5">
        {t("result.districtComparisonDesc")}
      </p>
      <div className="space-y-3">
        {districts.map((d) => {
          const isCurrent = d.district === currentDistrict;
          const medianPpm = Number(d?.median_ppm);
          const relativeWidthFromPayload = Number(d?.relative_width_pct);
          const widthPct =
            Number.isFinite(relativeWidthFromPayload)
              ? relativeWidthFromPayload
              : (Number.isFinite(medianPpm) && maxPpm
                ? Math.max(8, (medianPpm / maxPpm) * 100)
                : 8);
          const totalPrice =
            hasArea && Number.isFinite(medianPpm) ? Math.round(medianPpm * areaValue) : null;

          return (
            <div key={d.district} className="flex items-center gap-3">
              <span
                className={`text-sm w-24 shrink-0 truncate text-right ${isCurrent ? "font-bold text-primary" : "text-gray-500"
                  }`}
              >
                {t(`data.district.${d.district}`)}
              </span>
              <div className="flex-1 h-8 bg-gray-50 rounded relative overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${isCurrent ? "bg-primary/20" : "bg-gray-200"
                    }`}
                  style={{ width: `${widthPct}%` }}
                />
                <span
                  className={`absolute inset-y-0 flex items-center text-sm tabular-nums ${widthPct > 50 ? "right-2" : "left-2"
                    } ${isCurrent ? "font-bold text-primary" : "text-gray-600"}`}
                  style={widthPct > 50 ? {} : { left: `calc(${widthPct}% + 8px)` }}
                >
                  {totalPrice == null
                    ? (Number.isFinite(medianPpm) ? `${formatPrice(medianPpm)}/m²` : "—")
                    : `€${totalPrice.toLocaleString("ro-MD")}`}
                </span>
              </div>
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
  const [showListingsView, setShowListingsView] = useState(false);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const favoriteChecked = useRef(false);
  const { t, lang } = useTranslation();
  const { session, isAuthenticated, clearAuthError } = useAuth();

  const isPaid = data.access_tier === "paid";

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

  useEffect(() => {
    if (!isAuthModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isAuthModalOpen]);

  useEffect(() => {
    if (!isAuthModalOpen) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsAuthModalOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isAuthModalOpen]);

  const openAuthModal = useCallback((copyKey = "result.comingSoon") => {
    if (isAuthenticated) return;
    setAuthModalCopyKey(typeof copyKey === "string" ? copyKey : "result.comingSoon");
    clearAuthError();
    setIsAuthModalOpen(true);
  }, [clearAuthError, isAuthenticated]);

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

  const todayFormatted = new Date().toLocaleDateString(
    lang === "ru" ? "ru-RU" : "ro-RO",
    { day: "numeric", month: "long", year: "numeric" }
  );

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
  const listingsCount = Number.isFinite(Number(market_stats?.comparable_count))
    ? Number(market_stats.comparable_count)
    : 0;
  const listingPreviewItems = (Array.isArray(data.relevant_listings) ? data.relevant_listings : [])
    .map((listing) => normalizeRelevantListing(listing, t, lang))
    .filter(Boolean)
    .slice(0, 3);
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
  const actionButtonClassName = compactLayout
    ? "py-5 rounded-2xl text-base"
    : "px-3 py-4 rounded-2xl text-sm min-[360px]:whitespace-nowrap lg:py-4";
  const primaryActionButtonClassName = `${actionButtonClassName} w-full cursor-pointer font-semibold bg-primary text-white shadow-lg shadow-primary/20 hover:-translate-y-0.5 hover:bg-primary-dark hover:shadow-xl hover:shadow-primary/25 transition-all flex items-center justify-center gap-2`;
  const secondaryActionButtonClassName = `${actionButtonClassName} w-full cursor-pointer font-semibold border border-gray-200 text-gray-700 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-sm transition-all flex items-center justify-center gap-2`;
  const actionIconClassName = compactLayout
    ? "w-5 h-5"
    : "h-4 w-4 shrink-0";

  const authModal =
    isAuthModalOpen && typeof document !== "undefined"
      ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 cursor-zoom-out"
          onClick={() => setIsAuthModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="relative max-w-md w-full rounded-2xl overflow-hidden shadow-2xl bg-white p-6 sm:p-7 cursor-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(false)}
              aria-label="Close"
              className="absolute top-3 right-3 inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <CloseIcon size={18} />
            </button>

            <p className="text-center text-base font-medium text-gray-800 mb-4 px-8">
              {t(authModalCopyKey)}
            </p>

            <AuthOptions />
          </div>
        </div>,
        document.body
      )
      : null;

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
      {authModal}
      <ValuationPdfDialog
        open={isPdfDialogOpen}
        data={data}
        accessToken={session?.access_token || null}
        onClose={() => setIsPdfDialogOpen(false)}
      />

      {/* Property summary header */}
      <div className={`${compactLayout ? "" : "order-1"} rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8`}>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-primary" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />
              <path d="M9 21V12h6v9" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-gray-400 uppercase tracking-wide font-medium">{t("result.profileAnalyzed")}</p>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/8 text-xs font-medium text-primary">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  {todayFormatted}
                </span>
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
            </div>
            <div className={`mt-4 -ml-16 w-[calc(100%+4rem)] ${compactLayout ? "lg:ml-0 lg:w-auto" : "lg:mt-0 lg:grid lg:grid-cols-2 lg:items-start lg:gap-0"}`}>
              <div className={`min-w-0 ${compactLayout ? "" : "lg:pl-16 lg:pr-6"}`}>
                <h2 className="text-xl font-bold text-gray-900 leading-snug">
                  {titleParts.join(" · ")}
                </h2>
                <p className="text-base text-gray-500 mt-1">
                  {input.district && `${t(`data.district.${input.district}`)}, `}{t(`data.city.${input.city}`)}
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
              </div>
              <MarketTrendMiniChart trend={data.market_trend} compact={compactLayout} />
            </div>
          </div>
        </div>
      </div>

      {/* Main estimate */}
      <div className={`${compactLayout ? "" : "order-2"} rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden`}>
        <div className="p-6 sm:p-8 text-center border-b border-gray-100">
          <p className="text-base text-gray-400 mb-2">{t("result.estimatedPrice")}</p>
          <p className="text-6xl font-bold tracking-tight text-gray-900">
            {formatPrice(estimate.market_rate)}
          </p>
          <p className="text-base text-gray-500 mt-2">
            {formatPrice(estimate.price_per_m2)}/m²
          </p>
        </div>

        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <div className="p-5 sm:p-6 text-center">
            <p className="text-sm text-gray-400 mb-1">{t("result.fastSale")}</p>
            <p className="text-xl font-bold text-emerald-600">
              {formatPrice(estimate.fast_sale)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              -10%
            </p>
          </div>
          <div className="p-5 sm:p-6 text-center bg-primary/5">
            <p className="text-sm text-gray-400 mb-1">{t("result.marketPrice")}</p>
            <p className="text-xl font-bold text-primary">
              {formatPrice(estimate.market_rate)}
            </p>
          </div>
          <div className="p-5 sm:p-6 text-center">
            <p className="text-sm text-gray-400 mb-1">{t("result.targetPrice")}</p>
            <p className="text-xl font-bold text-amber-600">
              {formatPrice(estimate.premium)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              +8%
            </p>
          </div>
        </div>
      </div>

      {!isPaid && (
        <p className={`${compactLayout ? "" : "order-3"} text-sm text-gray-600 px-1`}>
          {t("result.freeTierUncertaintyLine")}
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
                {indRate && agRate && (
                  <div className="flex flex-wrap items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{t("result.sellerDifference")}</span>
                    <span className={`text-sm font-bold ${sellerDelta > 0 ? "text-amber-600" : sellerDelta < 0 ? "text-emerald-600" : "text-gray-900"}`}>
                      {sellerDelta > 0 ? "+" : ""}€{Math.abs(sellerDelta).toLocaleString("ro-MD")} ({sellerDelta > 0 ? "+" : ""}{sellerDeltaPct.toFixed(1)}%)
                    </span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 divide-x divide-gray-100">
                <div className="p-4 sm:p-5 text-center">
                  <p className="text-sm text-gray-500 mb-1 font-medium">{t("result.sellerIndividual")}</p>
                  {data.estimates_by_seller.individual?.estimate?.market_rate ? (
                    <>
                      <p className="text-xl font-bold text-gray-900">
                        {formatPrice(data.estimates_by_seller.individual.estimate.market_rate)}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatPrice(data.estimates_by_seller.individual.estimate.price_per_m2)}/m²
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
                  {data.estimates_by_seller.agency?.estimate?.market_rate ? (
                    <>
                      <p className="text-xl font-bold text-gray-900">
                        {formatPrice(data.estimates_by_seller.agency.estimate.market_rate)}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatPrice(data.estimates_by_seller.agency.estimate.price_per_m2)}/m²
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

          {cadastral && !cadastral.partial && (
            <div className={`${compactLayout ? "" : "order-6"} rounded-2xl border-2 border-emerald-200 bg-white shadow-md overflow-hidden`}>
              <div className="bg-emerald-700 px-6 py-4 flex items-center gap-2.5">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-6 h-6 shrink-0 text-white">
                  <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z" clipRule="evenodd" />
                </svg>
                <span className="text-xl font-semibold text-white">{t("result.cadastralDataTitle")}</span>
              </div>

              <div className="p-6 sm:p-8 space-y-5">
                {(cadastral.apartment?.address || cadastral.building?.address) && (
                  <p className="text-base text-gray-600">
                    {cadastral.apartment?.address || cadastral.building?.address}
                  </p>
                )}

                <div>
                  <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700 mb-2.5">{t("form.cadastralApartment")}</p>
                  <div className="space-y-2.5">
                    {cadastral.apartment?.area_m2 && (
                      <div className="flex justify-between text-base">
                        <span className="text-gray-500">{t("form.cadastralArea")}</span>
                        <span className="font-medium text-gray-900">{cadastral.apartment.area_m2} m²</span>
                      </div>
                    )}
                    {cadastral.apartment?.floor && (
                      <div className="flex justify-between text-base">
                        <span className="text-gray-500">{t("form.cadastralFloor")}</span>
                        <span className="font-medium text-gray-900">
                          {cadastral.building?.total_floors
                            ? t("form.floorOf", { floor: cadastral.apartment.floor, total: cadastral.building.total_floors })
                            : cadastral.apartment.floor}
                        </span>
                      </div>
                    )}
                    {cadastral.apartment?.toilet && (
                      <div className="flex justify-between text-base">
                        <span className="text-gray-500">{t("form.cadastralToilet")}</span>
                        <span className="font-medium text-gray-900">{cadastral.apartment.toilet}</span>
                      </div>
                    )}
                    {cadastral.apartment?.bathroom && (
                      <div className="flex justify-between text-base">
                        <span className="text-gray-500">{t("form.cadastralBathroom")}</span>
                        <span className="font-medium text-gray-900">{cadastral.apartment.bathroom}</span>
                      </div>
                    )}
                    {cadastral.apartment?.is_last_floor && (
                      <div className="flex justify-between text-base">
                        <span className="text-gray-500">{t("form.cadastralLastFloor")}</span>
                        <span className="font-medium text-gray-900">{cadastral.apartment.is_last_floor}</span>
                      </div>
                    )}
                    {cadastral.apartment?.estimated_value_lei && (
                      <div className="flex justify-between text-base">
                        <span className="text-gray-500">{t("form.cadastralEstimatedValue")}</span>
                        <span className="font-medium text-gray-900">{cadastral.apartment.estimated_value_lei} lei</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-emerald-100" />

                <div>
                  <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700 mb-2.5">{t("form.cadastralBuilding")}</p>
                  <div className="space-y-2.5">
                    {cadastral.building?.classifier && (
                      <div className="flex justify-between text-base"><span className="text-gray-500">{t("form.cadastralClassifier")}</span><span className="font-medium text-gray-900">{cadastral.building.classifier}</span></div>
                    )}
                    {cadastral.building?.total_floors && (
                      <div className="flex justify-between text-base"><span className="text-gray-500">{t("form.cadastralTotalFloors")}</span><span className="font-medium text-gray-900">{cadastral.building.total_floors}</span></div>
                    )}
                    {cadastral.building?.condition && (
                      <div className="flex justify-between text-base"><span className="text-gray-500">{t("form.cadastralCondition")}</span><span className="font-medium text-gray-900">{cadastral.building.condition}</span></div>
                    )}
                    {cadastral.building?.construction_year && (
                      <div className="flex justify-between text-base"><span className="text-gray-500">{t("form.cadastralYear")}</span><span className="font-medium text-gray-900">{cadastral.building.construction_year}</span></div>
                    )}
                    {cadastral.building?.wall_material && (
                      <div className="flex justify-between text-base"><span className="text-gray-500">{t("form.cadastralWallMaterial")}</span><span className="font-medium text-gray-900">{cadastral.building.wall_material}</span></div>
                    )}
                    {cadastral.building?.water && (
                      <div className="flex justify-between text-base"><span className="text-gray-500">{t("form.cadastralWater")}</span><span className="font-medium text-gray-900">{cadastral.building.water}</span></div>
                    )}
                    {cadastral.building?.sewage && (
                      <div className="flex justify-between text-base"><span className="text-gray-500">{t("form.cadastralSewage")}</span><span className="font-medium text-gray-900">{cadastral.building.sewage}</span></div>
                    )}
                    {cadastral.building?.gas && (
                      <div className="flex justify-between text-base"><span className="text-gray-500">{t("form.cadastralGas")}</span><span className="font-medium text-gray-900">{cadastral.building.gas}</span></div>
                    )}
                    {cadastral.building?.electricity && (
                      <div className="flex justify-between text-base"><span className="text-gray-500">{t("form.cadastralElectricity")}</span><span className="font-medium text-gray-900">{cadastral.building.electricity}</span></div>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    {t("result.cadastralDataSource")}
                  </span>
                </div>
              </div>
            </div>
          )}

          {cadastral?.partial && (
            <div className={`${compactLayout ? "" : "order-6"} rounded-2xl border border-sky-200 bg-sky-50 shadow-sm p-6 sm:p-8`}>
              <p className="text-sm font-medium text-sky-700 flex items-center gap-1.5 mb-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 shrink-0">
                  <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clipRule="evenodd" />
                </svg>
                {t("result.cadastralDataTitle")}
              </p>
              {cadastral.location?.display_name && (
                <p className="text-sm text-sky-700">{cadastral.location.display_name}</p>
              )}
              <p className="text-xs text-sky-600 mt-3">{t("result.cadastralDataSource")}</p>
            </div>
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
                  {formatPrice(range.low)}
                </span>
                <span className="text-sm text-gray-500 font-medium">
                  {t("result.median", { price: formatPrice(market_stats.median_price_per_m2) })}
                </span>
                <span className="text-xs text-gray-400">
                  {formatPrice(range.high)}
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
                  {formatPrice(market_stats.median_price_per_m2)}/m²
                </p>
                {input.area_m2 && (
                  <p className="text-sm text-gray-400 mt-1.5">
                    × {input.area_m2}m² = {formatPrice(estimate.market_rate)}
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
                  {formatPrice(market_stats.avg_price_per_m2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">{t("result.medianPricePerM2")}</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatPrice(market_stats.median_price_per_m2)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">{t("result.avgTotalPrice")}</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatPrice(market_stats.avg_price)}
                </p>
              </div>
            </div>
          </div>

        </div>
        <aside className={supportColumnClassName}>

          <RelevantListingsPreview
            t={t}
            count={listingsCount}
            listings={listingPreviewItems}
            onViewAll={() => setListingsMode(true)}
            sidebar={!compactLayout}
          />

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
            <button
              type="button"
              onClick={onReset}
              className={secondaryActionButtonClassName}
            >
              <svg viewBox="0 0 24 24" className={actionIconClassName} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              {t("result.changeCriteria")}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
