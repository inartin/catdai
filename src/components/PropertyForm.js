"use client";

import { useState, useMemo } from "react";

const cities = [
  "Chișinău",
  "Bălți",
  "Cahul",
  "Ungheni",
  "Soroca",
  "Orhei",
  "Edineț",
  "Comrat",
];

const districtsByCity = {
  Chișinău: [
    "Centru",
    "Botanica",
    "Buiucani",
    "Ciocana",
    "Râșcani",
    "Telecentru",
    "Sculeni",
    "Poșta Veche",
    "Durlești",
    "Codru",
    "Aeroport",
    "Periferie"
  ],
  Bălți: ["Centru", "Dacia", "Slobozia", "Pământeni"],
  Cahul: ["Centru"],
  Ungheni: ["Centru"],
  Soroca: ["Centru"],
  Orhei: ["Centru"],
  Edineț: ["Centru"],
  Comrat: ["Centru"],
};

const roomOptions = [1, 2, 3, 4, "5+"];
const buildingTypes = [
  "Construcţii noi",  // 10,482 listings
  "Secundar", 
];
const renovationTypes = [
  "Euroreparație",
  "Variantă albă",
  "Reparație cosmetică",
  "Design individual",
  "Fără reparație",
  "Construcție nefinisată",
  "Are nevoie de reparație",
  "Dat în exploatare",
  "Variantă sură",
];
const countOptions = [0, 1, 2, "3+"];

// To do:
const buildingPlan= [
  "Seria 102",
  "Seria 135",
  "Seria 143",
  "Seria MS",
  "Cărămidă",
  "Monolit",
  "MS",
  "Stalinca"
]

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SelectField({ label, required, value, onChange, placeholder, options }) {
  return (
    <div>
      <label className="text-sm text-gray-600 mb-1.5 block">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-gray-200 bg-white pl-4 pr-10 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors cursor-pointer"
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <ChevronIcon open={false} />
        </div>
      </div>
    </div>
  );
}

function PillGroup({ options, value, onChange, columns }) {
  const gridClass = columns
    ? `grid gap-2`
    : "flex flex-wrap gap-2";
  const colStyle = columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : {};

  return (
    <div className={gridClass} style={colStyle}>
      {options.map((opt) => {
        const active = String(value) === String(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`py-2.5 px-3 rounded-xl text-sm font-medium border transition-all duration-150 ${active
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
              }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function formatPrice(num) {
  if (num == null) return "—";
  return "€" + Math.round(num).toLocaleString("ro-MD");
}

function FilterBadge({ label, active }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
        active
          ? "bg-primary/10 text-primary"
          : "bg-gray-100 text-gray-400 line-through"
      }`}
    >
      {active ? (
        <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm3.78-9.72a.75.75 0 0 0-1.06-1.06L7 8.94 5.28 7.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.06 0l4.25-4.25z" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="w-3 h-3" fill="currentColor">
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zM4.22 4.22a.75.75 0 0 1 1.06 0L8 6.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L9.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 0 1-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 0 1 0-1.06z" />
        </svg>
      )}
      {label}
    </span>
  );
}

function DistrictComparison({ districts, currentDistrict, area }) {
  if (!districts || districts.length < 2) return null;

  const maxPpm = Math.max(...districts.map((d) => d.median_ppm));

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 sm:p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">
        Comparație pe sectoare
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Aceleași filtre aplicate în alte sectoare
      </p>
      <div className="space-y-2">
        {districts.map((d) => {
          const isCurrent = d.district === currentDistrict;
          const widthPct = Math.max(8, (d.median_ppm / maxPpm) * 100);
          const totalPrice = Math.round(d.median_ppm * area);
          return (
            <div key={d.district} className="flex items-center gap-2">
              <span
                className={`text-xs w-20 shrink-0 truncate text-right ${
                  isCurrent ? "font-bold text-primary" : "text-gray-500"
                }`}
              >
                {d.district}
              </span>
              <div className="flex-1 h-6 bg-gray-50 rounded relative overflow-hidden">
                <div
                  className={`h-full rounded transition-all ${
                    isCurrent ? "bg-primary/20" : "bg-gray-200"
                  }`}
                  style={{ width: `${widthPct}%` }}
                />
                <span
                  className={`absolute inset-y-0 flex items-center text-[11px] tabular-nums ${
                    widthPct > 50 ? "right-2" : "left-2"
                  } ${isCurrent ? "font-bold text-primary" : "text-gray-600"}`}
                  style={widthPct > 50 ? {} : { left: `calc(${widthPct}% + 8px)` }}
                >
                  €{totalPrice.toLocaleString("ro-MD")}
                </span>
              </div>
              <span className="text-[10px] text-gray-400 w-10 shrink-0 tabular-nums">
                ({d.count})
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400 mt-3">
        Prețul estimat pentru {area}m² · (nr. anunțuri)
      </p>
    </div>
  );
}


function EstimateResult({ data, onReset }) {
  const { estimate, range, market_stats, filters_used, district_coefficient, district_comparison, input } = data;

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

  return (
    <div className="animate-fade-in space-y-4">
      {/* Main estimate */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 text-center border-b border-gray-100">
          <p className="text-sm text-gray-400 mb-1">Prețul de piață estimat</p>
          <p className="text-4xl font-bold tracking-tight text-gray-900">
            {formatPrice(estimate.market_rate)}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            {formatPrice(estimate.price_per_m2)}/m²
          </p>
          <span
            className={`inline-block mt-3 px-3 py-1 rounded-full text-xs font-semibold ${confidenceColor[estimate.confidence] || confidenceColor.low}`}
          >
            Încredere: {confidenceLabel[estimate.confidence] || estimate.confidence}
          </span>
        </div>

        <div className="grid grid-cols-3 divide-x divide-gray-100">
          <div className="p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Vânzare rapidă</p>
            <p className="text-lg font-bold text-emerald-600">
              {formatPrice(estimate.fast_sale)}
            </p>
            <p className="text-[10px] text-gray-400">-10%</p>
          </div>
          <div className="p-4 text-center bg-primary/5">
            <p className="text-xs text-gray-400 mb-1">Preț de piață</p>
            <p className="text-lg font-bold text-primary">
              {formatPrice(estimate.market_rate)}
            </p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Premium</p>
            <p className="text-lg font-bold text-amber-600">
              {formatPrice(estimate.premium)}
            </p>
            <p className="text-[10px] text-gray-400">+8%</p>
          </div>
        </div>
      </div>

      {/* Price position on range */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          Poziția ta pe piață
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Bazat pe {market_stats.comparable_count} anunțuri comparabile din
          segment
        </p>

        <div className="relative pt-5 pb-1">
          {/* Marker */}
          <div
            className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
            style={{ left: `${markerPct}%` }}
          >
            <span className="text-[10px] font-bold text-primary whitespace-nowrap">
              Tu
            </span>
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-primary" />
          </div>

          {/* Track */}
          <div className="h-2.5 bg-gray-100 rounded-full relative overflow-hidden">
            <div
              className="absolute inset-y-0 bg-linear-to-r from-emerald-200 via-primary/30 to-amber-200 rounded-full"
              style={{ left: "10%", right: "10%" }}
            />
          </div>

          {/* Labels */}
          <div className="flex justify-between mt-2">
            <span className="text-[10px] text-gray-400">
              {formatPrice(range.low)}
            </span>
            <span className="text-[10px] text-gray-500 font-medium">
              Median: {formatPrice(market_stats.median_price_per_m2)}/m²
            </span>
            <span className="text-[10px] text-gray-400">
              {formatPrice(range.high)}
            </span>
          </div>
        </div>
      </div>

      {/* How we calculated */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          Cum am calculat
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Prețul median al {market_stats.comparable_count} anunțuri similare,
          filtrate după:
        </p>

        {/* Filter badges */}
        <div className="flex flex-wrap gap-1.5 mb-3">
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

        {anyDropped && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-3">
            Filtrele tăiate au fost extinse pentru a avea suficiente anunțuri
            comparabile.
          </p>
        )}

        {/* Median explanation */}
        {district_coefficient?.applied ? (
          <div className="space-y-2">
            <div className="p-3 rounded-xl bg-gray-50">
              <div className="flex items-center gap-3 justify-center">
                <div className="text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                    Median oraș
                  </p>
                  <p className="text-sm font-bold text-gray-600">
                    {formatPrice(market_stats.median_price_per_m2)}/m²
                  </p>
                </div>
                <span className="text-gray-300">×</span>
                <div className="text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                    Coef. {input.district}
                  </p>
                  <p className="text-sm font-bold text-gray-600">
                    {district_coefficient.value}
                  </p>
                </div>
                <span className="text-gray-300">=</span>
                <div className="text-center">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                    Ajustat
                  </p>
                  <p className="text-sm font-bold text-primary">
                    {formatPrice(estimate.price_per_m2)}/m²
                  </p>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 text-center">
              × {input.area_m2}m² = {formatPrice(estimate.market_rate)}
            </p>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-gray-50 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
              Preț median al segmentului
            </p>
            <p className="text-lg font-bold text-primary">
              {formatPrice(market_stats.median_price_per_m2)}/m²
            </p>
            <p className="text-xs text-gray-400 mt-1">
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
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Statistici piață
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-400">Anunțuri comparabile</span>
            <p className="font-semibold">{market_stats.comparable_count}</p>
          </div>
          <div>
            <span className="text-gray-400">Preț mediu/m²</span>
            <p className="font-semibold">
              {formatPrice(market_stats.avg_price_per_m2)}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Preț median/m²</span>
            <p className="font-semibold">
              {formatPrice(market_stats.median_price_per_m2)}
            </p>
          </div>
          <div>
            <span className="text-gray-400">Preț mediu total</span>
            <p className="font-semibold">
              {formatPrice(market_stats.avg_price)}
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="w-full py-4 rounded-2xl text-base font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
      >
        Evaluare nouă
      </button>
    </div>
  );
}

export default function PropertyForm({ onBack }) {
  const [form, setForm] = useState({
    city: "",
    district: "",
    rooms_count: null,
    area_m2: "",
    floor: "",
    total_floors: "",
    building_type: "",
    renovation: "",
    bathrooms_count: null,
    balconies_count: null,
  });
  const [showOptional, setShowOptional] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const update = (key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "city" && value !== prev.city) next.district = "";
      return next;
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const roomsVal = form.rooms_count === "5+" ? 5 : form.rooms_count;
      const bathroomsVal =
        form.bathrooms_count === "3+" ? 3 : form.bathrooms_count;
      const balconiesVal =
        form.balconies_count === "3+" ? 3 : form.balconies_count;

      const res = await fetch("/api/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: form.city,
          district: form.district,
          rooms_count: roomsVal,
          area_m2: form.area_m2,
          floor: form.floor || null,
          total_floors: form.total_floors || null,
          building_type: form.building_type || null,
          renovation: form.renovation || null,
          bathrooms_count: bathroomsVal,
          balconies_count: balconiesVal,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || data.error || "A apărut o eroare");
        return;
      }

      setResult(data);
    } catch (err) {
      setError("Eroare de conexiune. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
  };

  const accuracy = useMemo(() => {
    let s = 0;
    if (form.city) s += 20;
    if (form.district) s += 15;
    if (form.rooms_count != null) s += 20;
    if (form.area_m2) s += 20;
    if (form.floor) s += 5;
    if (form.total_floors) s += 3;
    if (form.building_type) s += 7;
    if (form.renovation) s += 6;
    if (form.bathrooms_count != null) s += 2;
    if (form.balconies_count != null) s += 2;
    return s;
  }, [form]);

  const optionalGain = useMemo(() => {
    let s = 0;
    if (!form.floor) s += 5;
    if (!form.total_floors) s += 3;
    if (!form.building_type) s += 7;
    if (!form.renovation) s += 6;
    if (form.bathrooms_count == null) s += 2;
    if (form.balconies_count == null) s += 2;
    return s;
  }, [form]);

  const isValid =
    form.city && form.district && form.rooms_count != null && form.area_m2;

  const districts = districtsByCity[form.city] || [];

  const meterColor =
    accuracy < 40
      ? "bg-red-400"
      : accuracy < 75
        ? "bg-amber-400"
        : "bg-emerald-500";

  const meterTextColor =
    accuracy < 40
      ? "text-gray-400"
      : accuracy < 75
        ? "text-amber-600"
        : "text-emerald-600";

  return (
    <section className="py-8 px-4">
      <div className="max-w-xl mx-auto">
        {/* ── Back ── */}
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors mb-6 group"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 transition-transform group-hover:-translate-x-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">Înapoi</span>
        </button>

        {/* ── Header ── */}
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center shrink-0">
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Evaluare Imobil
            </h1>
            <p className="text-sm text-gray-400">
              Completează detaliile pentru o estimare precisă
            </p>
          </div>
        </div>

        {/* ── Accuracy meter (Variable Reward — self-mastery) ── */}
        <div className="mt-6 mb-8">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              Precizia estimării
            </span>
            <span className={`text-xs font-bold ${meterTextColor}`}>
              {accuracy}%
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${meterColor}`}
              style={{ width: `${accuracy}%` }}
            />
          </div>
        </div>

        {/* ── Form card ── */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden divide-y divide-gray-100">
          {/* — Section 1: Location — */}
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                1
              </span>
              <span className="text-sm font-semibold text-gray-900">
                Locație
              </span>
            </div>

            <div className="space-y-3">
              <SelectField
                label="Oraș"
                required
                value={form.city}
                onChange={(v) => update("city", v)}
                placeholder="Selectează orașul"
                options={cities}
              />

              {form.city && districts.length > 0 && (
                <div className="animate-fade-in">
                  <SelectField
                    label="Sector / Zonă"
                    required
                    value={form.district}
                    onChange={(v) => update("district", v)}
                    placeholder="Selectează sectorul"
                    options={districts}
                  />
                </div>
              )}
            </div>
          </div>

          {/* — Section 2: Property basics — */}
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                2
              </span>
              <span className="text-sm font-semibold text-gray-900">
                Proprietate
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600 mb-2 block">
                  Număr camere
                  <span className="text-red-400 ml-0.5">*</span>
                </label>
                <PillGroup
                  options={roomOptions}
                  value={form.rooms_count}
                  onChange={(v) => update("rooms_count", v)}
                  columns={5}
                />
              </div>

              <div>
                <label className="text-sm text-gray-600 mb-1.5 block">
                  Suprafață (m²)
                  <span className="text-red-400 ml-0.5">*</span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="ex. 65"
                  value={form.area_m2}
                  onChange={(e) => update("area_m2", e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                />
              </div>
            </div>
          </div>

          {/* — Section 3: Optional (Investment loop) — */}
          <div className="p-5 sm:p-6">
            <button
              type="button"
              onClick={() => setShowOptional((p) => !p)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-50 text-amber-500 text-xs font-bold flex items-center justify-center">
                  +
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  Detalii suplimentare
                </span>
              </div>

              <div className="flex items-center gap-2">
                {optionalGain > 0 && (
                  <span className="text-xs text-amber-500 font-medium">
                    +{optionalGain}% precizie
                  </span>
                )}
                <ChevronIcon open={showOptional} />
              </div>
            </button>

            {showOptional && (
              <div className="mt-5 space-y-4 animate-fade-in">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-600 mb-1.5 block">
                      Etaj
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="ex. 4"
                      value={form.floor}
                      onChange={(e) => update("floor", e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1.5 block">
                      Etaje total
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="ex. 9"
                      value={form.total_floors}
                      onChange={(e) => update("total_floors", e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-600 mb-2 block">
                    Tip construcție
                  </label>
                  <PillGroup
                    options={buildingTypes}
                    value={form.building_type}
                    onChange={(v) => update("building_type", v)}
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600 mb-2 block">
                    Starea reparației
                  </label>
                  <PillGroup
                    options={renovationTypes}
                    value={form.renovation}
                    onChange={(v) => update("renovation", v)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-600 mb-2 block">
                      Băi
                    </label>
                    <PillGroup
                      options={[1, 2, "3+"]}
                      value={form.bathrooms_count}
                      onChange={(v) => update("bathrooms_count", v)}
                      columns={3}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-2 block">
                      Balcoane
                    </label>
                    <PillGroup
                      options={countOptions}
                      value={form.balconies_count}
                      onChange={(v) => update("balconies_count", v)}
                      columns={4}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
            {error}
          </div>
        )}

        {result ? (
          <div className="mt-6">
            <EstimateResult data={result} onReset={handleReset} />
          </div>
        ) : (
          <>
            {/* ── CTA ── */}
            <button
              type="button"
              disabled={!isValid || loading}
              onClick={handleSubmit}
              className={`w-full mt-6 py-4 rounded-2xl text-base font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                isValid && !loading
                  ? "bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98]"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {loading ? (
                <svg
                  className="w-5 h-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="opacity-25"
                  />
                  <path
                    d="M4 12a8 8 0 018-8"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
              )}
              {loading ? "Se calculează..." : "Estimează Prețul"}
            </button>

            {/* ── Social proof ── */}
            <p className="text-center text-xs text-gray-400 mt-3">
              Bazat pe analiza a 1,200+ anunțuri din{" "}
              {form.city || "Republica Moldova"}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
