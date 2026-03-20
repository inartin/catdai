"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";

function formatPrice(num) {
  if (num == null) return "—";
  return "€" + Math.round(num).toLocaleString("ro-MD");
}

function LockedValue({ text = "999999", className = "" }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!showTooltip) return;
    const timer = setTimeout(() => setShowTooltip(false), 2000);
    return () => clearTimeout(timer);
  }, [showTooltip]);

  const handleClick = useCallback((e) => {
    e.stopPropagation();
    setShowTooltip(true);
  }, []);

  return (
    <span className="relative inline-block">
      <span
        aria-hidden
        className={`inline-block select-none blur-sm cursor-pointer ${className}`}
        onClick={handleClick}
      >
        {text}
      </span>
      {showTooltip && (
        <span className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium whitespace-nowrap shadow-lg animate-fade-in">
          {t("result.comingSoon")}
          <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-gray-900" />
        </span>
      )}
    </span>
  );
}

function FilterBadge({ label, active }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
        active
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
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
        isPositive
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

function DistrictComparison({ districts, currentDistrict, area, blurValues }) {
  const { t } = useTranslation();

  if (!districts || districts.length < 2) return null;

  const numericMedians = districts
    .map((d) => Number(d?.median_ppm))
    .filter((value) => Number.isFinite(value) && value > 0);
  const maxPpm = numericMedians.length > 0 ? Math.max(...numericMedians) : null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8">
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
            Number.isFinite(medianPpm) ? Math.round(medianPpm * area) : null;

          return (
            <div key={d.district} className="flex items-center gap-3">
              <span
                className={`text-sm w-24 shrink-0 truncate text-right ${
                  isCurrent ? "font-bold text-primary" : "text-gray-500"
                }`}
              >
                {t(`data.district.${d.district}`)}
              </span>
              <div className="flex-1 h-8 bg-gray-50 rounded relative overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${
                    isCurrent ? "bg-primary/20" : "bg-gray-200"
                  }`}
                  style={{ width: `${widthPct}%` }}
                />
                <span
                  className={`absolute inset-y-0 flex items-center text-sm tabular-nums ${
                    widthPct > 50 ? "right-2" : "left-2"
                  } ${isCurrent ? "font-bold text-primary" : "text-gray-600"}`}
                  style={widthPct > 50 ? {} : { left: `calc(${widthPct}% + 8px)` }}
                >
                  {blurValues || totalPrice == null ? (
                    <LockedValue
                      text="€99.999"
                      className={isCurrent ? "text-primary" : "text-gray-500"}
                    />
                  ) : (
                    `€${totalPrice.toLocaleString("ro-MD")}`
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-4">
        {t("result.estimatedForArea", { area })}
      </p>
    </div>
  );
}

export default function EstimateResult({ data, onReset }) {
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
  const { t, lang } = useTranslation();
  const { session } = useAuth();

  const isPaid = data.access_tier === "paid";
  const lockedSections = data.locked_sections || {};
  const hidePriceTiers = !isPaid && lockedSections.price_tiers !== false;
  const hideCadastralDetails = !isPaid && lockedSections.cadastral_details !== false;
  const hideMarketPositionNumbers = !isPaid && lockedSections.market_position_numbers !== false;
  const hideDistrictComparisonValues = !isPaid && lockedSections.district_comparison_values !== false;
  const hideMarketStatsValues = !isPaid && lockedSections.market_stats_values !== false;

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
    input.floor && filters_used.floor === false,
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
      ["city", "district", "rooms", "area", "floor", "total_floors", "building_type", "renovation", "bathrooms", "balconies", "cadastral_number"].forEach((key) => {
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

  const floorLabel = (() => {
    if (!input.floor) return null;
    if (input.floor === 1) return t("result.groundFloor");
    if (input.total_floors && input.floor === input.total_floors)
      return t("result.lastFloor", { floor: input.floor });
    return input.total_floors
      ? t("result.floorOf", { floor: input.floor, total: input.total_floors })
      : t("result.floor", { floor: input.floor });
  })();

  return (
    <div className="animate-fade-in space-y-5">
      {/* Property summary header */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8">
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
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/8 text-xs font-medium text-primary">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                {todayFormatted}
              </span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 leading-snug">
              {t("result.apartment")} {roomsLabel} · {input.area_m2}m²
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
        </div>
      </div>

      {/* Main estimate */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
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
              {hidePriceTiers ? (
                <LockedValue text="€999.999" className="text-emerald-600" />
              ) : (
                formatPrice(estimate.fast_sale)
              )}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {hidePriceTiers ? (
                <LockedValue text="-99%" />
              ) : (
                "-10%"
              )}
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
              {hidePriceTiers ? (
                <LockedValue text="€999.999" className="text-amber-600" />
              ) : (
                formatPrice(estimate.premium)
              )}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {hidePriceTiers ? (
                <LockedValue text="+99%" />
              ) : (
                "+8%"
              )}
            </p>
          </div>
        </div>
      </div>

      {!isPaid && (
        <p className="text-sm text-gray-600 px-1">
          {t("result.freeTierUncertaintyLine")}
        </p>
      )}

      {cadastral && !cadastral.partial && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm p-6 sm:p-8">
          <p className="text-2xl font-medium text-emerald-700 flex items-center gap-1.5 mb-2">
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-6 h-6 shrink-0">
              <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z" clipRule="evenodd" />
            </svg>
            {t("result.cadastralDataTitle")}
          </p>

          {(cadastral.apartment?.address || cadastral.building?.address) && (
            <p className="text-sm text-emerald-700 mb-3">
              {cadastral.apartment?.address || cadastral.building?.address}
            </p>
          )}

          <p className="text-sm font-medium text-emerald-800 mb-1.5">{t("form.cadastralApartment")}</p>
          <div className="text-sm text-emerald-700 space-y-1 mb-3">
            {cadastral.apartment?.area_m2 && (
              <p>{t("form.cadastralArea")}: <span className="font-medium">{cadastral.apartment.area_m2} m²</span></p>
            )}
            {cadastral.apartment?.floor && (
              <p>{t("form.cadastralFloor")}: <span className="font-medium">
                {cadastral.building?.total_floors
                  ? t("form.floorOf", { floor: cadastral.apartment.floor, total: cadastral.building.total_floors })
                  : cadastral.apartment.floor}
              </span></p>
            )}
            {hideCadastralDetails ? (
              <p>
                {t("form.cadastralEstimatedValue")}:{" "}
                <LockedValue text="999999 lei" className="font-medium" />
              </p>
            ) : (
              cadastral.apartment?.estimated_value_lei && (
                <p>{t("form.cadastralEstimatedValue")}: <span className="font-medium">{cadastral.apartment.estimated_value_lei} lei</span></p>
              )
            )}
          </div>

          <p className="text-sm font-medium text-emerald-800 mb-1.5">{t("form.cadastralBuilding")}</p>
          <div className="text-sm text-emerald-700 space-y-1">
            {hideCadastralDetails ? (
              <>
                <p>{t("form.cadastralClassifier")}: <LockedValue text="999999" className="font-medium" /></p>
                <p>{t("form.cadastralCondition")}: <LockedValue text="999999" className="font-medium" /></p>
                <p>{t("form.cadastralYear")}: <LockedValue text="9999" className="font-medium" /></p>
                <p>{t("form.cadastralWallMaterial")}: <LockedValue text="999999" className="font-medium" /></p>
                <p>{t("form.cadastralWater")}: <LockedValue text="999999" className="font-medium" /></p>
                <p>{t("form.cadastralSewage")}: <LockedValue text="999999" className="font-medium" /></p>
                <p>{t("form.cadastralGas")}: <LockedValue text="999999" className="font-medium" /></p>
              </>
            ) : (
              <>
                {cadastral.building?.classifier && (
                  <p>{t("form.cadastralClassifier")}: <span className="font-medium">{cadastral.building.classifier}</span></p>
                )}
                {cadastral.building?.condition && (
                  <p>{t("form.cadastralCondition")}: <span className="font-medium">{cadastral.building.condition}</span></p>
                )}
                {cadastral.building?.construction_year && (
                  <p>{t("form.cadastralYear")}: <span className="font-medium">{cadastral.building.construction_year}</span></p>
                )}
                {cadastral.building?.wall_material && (
                  <p>{t("form.cadastralWallMaterial")}: <span className="font-medium">{cadastral.building.wall_material}</span></p>
                )}
                {cadastral.building?.water && (
                  <p>{t("form.cadastralWater")}: <span className="font-medium">{cadastral.building.water}</span></p>
                )}
                {cadastral.building?.sewage && (
                  <p>{t("form.cadastralSewage")}: <span className="font-medium">{cadastral.building.sewage}</span></p>
                )}
                {cadastral.building?.gas && (
                  <p>{t("form.cadastralGas")}: <span className="font-medium">{cadastral.building.gas}</span></p>
                )}
              </>
            )}
          </div>
          <p className="text-xs text-emerald-600 mt-4">{t("result.cadastralDataSource")}</p>
        </div>
      )}

      {cadastral?.partial && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 shadow-sm p-6 sm:p-8">
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
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8">
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
                <LockedValue text="€999.999" />
              ) : (
                formatPrice(range.low)
              )}
            </span>
            <span className="text-sm text-gray-500 font-medium">
              {hideMarketPositionNumbers ? (
                <LockedValue text={t("result.median", { price: "€999.999" })} />
              ) : (
                t("result.median", { price: formatPrice(market_stats.median_price_per_m2) })
              )}
            </span>
            <span className="text-xs text-gray-400">
              {hideMarketPositionNumbers ? (
                <LockedValue text="€999.999" />
              ) : (
                formatPrice(range.high)
              )}
            </span>
          </div>
        </div>
      </div>

      {/* How we calculated */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8">
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
          {input.floor && (
            <FilterBadge
              label={
                input.floor === 1
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
              × {input.area_m2}m² = {formatPrice(estimate.market_rate)}
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
            <p className="text-sm text-gray-400 mt-1.5">
              × {input.area_m2}m² = {formatPrice(estimate.market_rate)}
            </p>
          </div>
        )}
      </div>

      {/* District comparison */}
      <DistrictComparison
        districts={district_comparison}
        currentDistrict={input.district}
        area={input.area_m2}
        blurValues={hideDistrictComparisonValues}
      />

      {/* Market stats */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8">
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
                <LockedValue text="€999.999" />
              ) : (
                formatPrice(market_stats.avg_price_per_m2)
              )}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-1">{t("result.medianPricePerM2")}</p>
            <p className="text-xl font-bold text-gray-900">
              {hideMarketStatsValues ? (
                <LockedValue text="€999.999" />
              ) : (
                formatPrice(market_stats.median_price_per_m2)
              )}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-1">{t("result.avgTotalPrice")}</p>
            <p className="text-xl font-bold text-gray-900">
              {hideMarketStatsValues ? (
                <LockedValue text="€999.999" />
              ) : (
                formatPrice(market_stats.avg_price)
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onReset}
          className="py-5 rounded-2xl text-base font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          {t("result.changeCriteria")}
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="py-5 rounded-2xl text-base font-semibold border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition-colors flex items-center justify-center gap-2"
        >
          {sharing ? (
            <>
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {t("result.sharing")}
            </>
          ) : copied ? (
            <>
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {t("result.linkCopied")}
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              {t("result.shareAnalysis")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
