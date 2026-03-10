"use client";

import { useState } from "react";

function formatPrice(num) {
  if (num == null) return "—";
  return "€" + Math.round(num).toLocaleString("ro-MD");
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

function DistrictComparison({ districts, currentDistrict, area }) {
  if (!districts || districts.length < 2) return null;

  const maxPpm = Math.max(...districts.map((d) => d.median_ppm));

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8">
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        Comparație pe sectoare
      </h3>
      <p className="text-sm text-gray-400 mb-5">
        Aceleași filtre aplicate în alte sectoare
      </p>
      <div className="space-y-3">
        {districts.map((d) => {
          const isCurrent = d.district === currentDistrict;
          const widthPct = Math.max(8, (d.median_ppm / maxPpm) * 100);
          const totalPrice = Math.round(d.median_ppm * area);
          return (
            <div key={d.district} className="flex items-center gap-3">
              <span
                className={`text-sm w-24 shrink-0 truncate text-right ${
                  isCurrent ? "font-bold text-primary" : "text-gray-500"
                }`}
              >
                {d.district}
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
                  €{totalPrice.toLocaleString("ro-MD")}
                </span>
              </div>
              <span className="text-xs text-gray-400 w-12 shrink-0 tabular-nums">
                ({d.count})
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-4">
        Prețul estimat pentru {area}m² · (nr. anunțuri)
      </p>
    </div>
  );
}

export default function EstimateResult({ data, onReset }) {
  const { estimate, range, market_stats, filters_used, district_coefficient, district_comparison, input, feature_adjustments } = data;
  const [copied, setCopied] = useState(false);

  const confidenceLabel = {
    high: "Înaltă",
    medium: "Medie",
    low: "Scăzută",
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

  const rangeMin = market_stats.min_price_per_m2 * input.area_m2;
  const rangeMax = market_stats.max_price_per_m2 * input.area_m2;
  const rangeSpan = rangeMax - rangeMin || 1;
  const markerPct = Math.max(
    2,
    Math.min(98, ((estimate.market_rate - rangeMin) / rangeSpan) * 100)
  );

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const roomsLabel = input.rooms_count === 1
    ? "1 cameră"
    : `${input.rooms_count} camere`;

  const floorLabel = (() => {
    if (!input.floor) return null;
    if (input.floor === 1) return "Parter";
    if (input.total_floors && input.floor === input.total_floors) return `Etaj ultim (${input.floor})`;
    return input.total_floors
      ? `Etaj ${input.floor}/${input.total_floors}`
      : `Etaj ${input.floor}`;
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
            <p className="text-sm text-gray-400 mb-1 uppercase tracking-wide font-medium">Proprietate evaluată</p>
            <h2 className="text-xl font-bold text-gray-900 leading-snug">
              Apartament {roomsLabel} · {input.area_m2}m²
            </h2>
            <p className="text-base text-gray-500 mt-1">
              {input.district && `${input.district}, `}{input.city}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {input.building_type && (
                <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium text-gray-600">
                  {input.building_type}
                </span>
              )}
              {input.renovation && (
                <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium text-gray-600">
                  {input.renovation}
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
                    ? "Fără baie"
                    : `${input.bathrooms_count} ${input.bathrooms_count === 1 ? "baie" : "băi"}`}
                </span>
              )}
              {input.balconies_count != null && (
                <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-gray-100 text-sm font-medium text-gray-600">
                  {input.balconies_count === 0
                    ? "Fără balcon"
                    : `${input.balconies_count} ${input.balconies_count === 1 ? "balcon" : "balcoane"}`}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main estimate */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="p-6 sm:p-8 text-center border-b border-gray-100">
          <p className="text-base text-gray-400 mb-2">Prețul de piață estimat</p>
          <p className="text-6xl font-bold tracking-tight text-gray-900">
            {formatPrice(estimate.market_rate)}
          </p>
          <p className="text-base text-gray-500 mt-2">
            {formatPrice(estimate.price_per_m2)}/m²
          </p>
          {/* <span
            className={`inline-block mt-4 px-4 py-1.5 rounded-full text-sm font-semibold ${confidenceColor[estimate.confidence] || confidenceColor.low}`}
          >
            Încredere: {confidenceLabel[estimate.confidence] || estimate.confidence}
          </span> */}
        </div>

        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <div className="p-5 sm:p-6 text-center">
            <p className="text-sm text-gray-400 mb-1">Vânzare rapidă</p>
            <p className="text-xl font-bold text-emerald-600">
              {formatPrice(estimate.fast_sale)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">-10%</p>
          </div>
          <div className="p-5 sm:p-6 text-center bg-primary/5">
            <p className="text-sm text-gray-400 mb-1">Preț de piață</p>
            <p className="text-xl font-bold text-primary">
              {formatPrice(estimate.market_rate)}
            </p>
          </div>
          <div className="p-5 sm:p-6 text-center">
            <p className="text-sm text-gray-400 mb-1">Premium</p>
            <p className="text-xl font-bold text-amber-600">
              {formatPrice(estimate.premium)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">+8%</p>
          </div>
        </div>
      </div>

      {/* Price position on range */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8">
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          Poziția pe piață
        </h3>
        <p className="text-sm text-gray-400 mb-5">
          Bazat pe analiza anunțurilor comparabile din segment
        </p>

        <div className="relative pt-6 pb-1">
          <div
            className="absolute top-2 -translate-x-1/2 flex flex-col items-center"
            style={{ left: `${markerPct}%` }}
          >
            {/* <span className="text-xs font-bold text-primary whitespace-nowrap">
              Tu
            </span> */}
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
              Median: {formatPrice(market_stats.median_price_per_m2)}/m²
            </span>
            <span className="text-xs text-gray-400">
              {formatPrice(range.high)}
            </span>
          </div>
        </div>
      </div>

      {/* How we calculated */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8">
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          Cum am calculat
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Prețul median al anunțurilor similare, filtrate după:
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <FilterBadge label={input.city} active={true} />
          {input.district && (
            <FilterBadge
              label={input.district}
              active={filters_used?.district !== false}
            />
          )}
          {input.rooms_count && (
            <FilterBadge
              label={`${input.rooms_count} ${input.rooms_count === 1 ? "cameră" : "camere"}`}
              active={true}
            />
          )}
          {input.building_type && (
            <FilterBadge
              label={input.building_type}
              active={filters_used?.building_type !== false}
            />
          )}
          {input.renovation && (
            <FilterBadge
              label={input.renovation}
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
                  ? "Etaj 1 (parter)"
                  : input.total_floors && input.floor === input.total_floors
                    ? `Etaj ultim (${input.floor})`
                    : `Etaj ${Math.max(2, input.floor - 2)}–${
                        input.total_floors
                          ? Math.min(input.total_floors - 1, input.floor + 2)
                          : input.floor + 2
                      }`
              }
              active={filters_used?.floor !== false}
            />
          )}
        </div>

        {feature_adjustments?.items?.length > 0 && (
          <div className="mb-4">
            <p className="text-sm text-gray-400 mb-2">Ajustări pentru caracteristici:</p>
            <div className="flex flex-wrap gap-2">
              {feature_adjustments.items.map((item) => (
                <FeatureAdjustmentBadge key={item.type} item={item} />
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Ajustare totală:{" "}
              <span className={feature_adjustments.total_pct > 0 ? "text-emerald-600 font-medium" : "text-red-500 font-medium"}>
                {feature_adjustments.total_pct > 0 ? "+" : ""}{feature_adjustments.total_pct}%
              </span>{" "}
              față de media comparabilelor
            </p>
          </div>
        )}

        {anyDropped && (
          <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-4 py-2.5 mb-4">
            Filtrele tăiate au fost extinse pentru a avea suficiente anunțuri comparabile.
          </p>
        )}

        {district_coefficient?.applied ? (
          <div className="space-y-2">
            <div className="p-4 rounded-xl bg-gray-50">
              <div className="flex items-center gap-4 justify-center">
                <div className="text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                    Median oraș
                  </p>
                  <p className="text-base font-bold text-gray-600">
                    {formatPrice(market_stats.median_price_per_m2)}/m²
                  </p>
                </div>
                <span className="text-gray-300 text-lg">×</span>
                <div className="text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                    Coef. {input.district}
                  </p>
                  <p className="text-base font-bold text-gray-600">
                    {district_coefficient.value}
                  </p>
                </div>
                <span className="text-gray-300 text-lg">=</span>
                <div className="text-center">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                    Ajustat
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
              Preț median al segmentului
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
      />

      {/* Market stats */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-6 sm:p-8">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          Statistici piață
        </h3>
        <div className="grid grid-cols-2 gap-5">
          <div>
            <p className="text-sm text-gray-400 mb-1">Anunțuri comparabile</p>
            <p className="text-xl font-bold text-gray-900">{market_stats.comparable_count}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-1">Preț mediu/m²</p>
            <p className="text-xl font-bold text-gray-900">
              {formatPrice(market_stats.avg_price_per_m2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-1">Preț median/m²</p>
            <p className="text-xl font-bold text-gray-900">
              {formatPrice(market_stats.median_price_per_m2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400 mb-1">Preț mediu total</p>
            <p className="text-xl font-bold text-gray-900">
              {formatPrice(market_stats.avg_price)}
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
          Editează parametrii
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="py-5 rounded-2xl text-base font-semibold border border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 transition-colors flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Link copiat!
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              Distribuie
            </>
          )}
        </button>
      </div>
    </div>
  );
}
