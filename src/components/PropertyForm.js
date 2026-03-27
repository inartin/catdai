"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/context/LanguageContext";
import LoginButton from "@/components/LoginButton";

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
  "Construcţii noi",
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

const buildingPlan = [
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
      className={`w-4 h-4 text-gray-400 transition-transform duration-200 cursor-pointer ${open ? "rotate-180" : ""}`}
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

function SelectField({ label, required, value, onChange, placeholder, options, labelFn, disabled }) {
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
          disabled={disabled}
          className={`w-full appearance-none rounded-xl border border-gray-200 pl-4 pr-10 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors ${disabled ? "bg-gray-50 opacity-60 cursor-not-allowed" : "bg-white cursor-pointer"}`}
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {labelFn ? labelFn(opt) : opt}
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

function PillGroup({ options, value, onChange, columns, labelFn }) {
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
            {labelFn ? labelFn(opt) : opt}
          </button>
        );
      })}
    </div>
  );
}


export default function PropertyForm({ onBack, initialValues, onSubmit }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [form, setForm] = useState({
    city: initialValues?.city ?? "Chișinău",
    district: initialValues?.district ?? "",
    rooms_count: initialValues?.rooms_count ?? null,
    area_m2: initialValues?.area_m2 ?? "",
    floor: initialValues?.floor ?? "",
    total_floors: initialValues?.total_floors ?? "",
    building_type: initialValues?.building_type ?? "",
    renovation: initialValues?.renovation ?? "",
    bathrooms_count: initialValues?.bathrooms_count ?? null,
    balconies_count: initialValues?.balconies_count ?? null,
  });
  const [showOptional, setShowOptional] = useState(
    !!(initialValues?.floor || initialValues?.total_floors || initialValues?.bathrooms_count || initialValues?.balconies_count)
  );
  const [cadastralInput, setCadastralInput] = useState("");
  const [cadastralLoading, setCadastralLoading] = useState(false);
  const [cadastralError, setCadastralError] = useState(null);
  const [cadastralData, setCadastralData] = useState(null);
  const [highlightField, setHighlightField] = useState(null);
  const refCity = useRef(null);
  const refDistrict = useRef(null);
  const refRooms = useRef(null);
  const refArea = useRef(null);
  const refBuildingType = useRef(null);
  const refRenovation = useRef(null);

  const update = (key, value) => {
    setHighlightField(null);
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "city" && value !== prev.city) next.district = "";
      return next;
    });
  };

  const handleCadastralSearch = async () => {
    const trimmed = cadastralInput.trim();
    if (!trimmed) return;

    const cadastralRe = /^\d{5,7}\.\d{1,4}\.\d{2}\.\d{3}$/;
    if (!cadastralRe.test(trimmed)) {
      setCadastralError("cadastralInvalid");
      return;
    }

    setCadastralError(null);
    setCadastralLoading(true);

    try {
      const res = await fetch("/api/cadastral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadastral_number: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "not_found") {
          setCadastralError("cadastralNotFound");
        } else if (data.error === "invalid_format") {
          setCadastralError("cadastralInvalid");
        } else {
          setCadastralError("cadastralError");
        }
        return;
      }


      setCadastralData({
        building: data.building,
        apartment: data.apartment,
        location: data.location,
        partial: data.partial || false,
      });

      const f = data.form_fields || {};
      setForm((prev) => ({
        ...prev,
        ...(f.city && { city: f.city }),
        ...(f.district && { district: f.district }),
        ...(f.area_m2 && { area_m2: f.area_m2 }),
        ...(f.floor && { floor: f.floor }),
        ...(f.total_floors && { total_floors: f.total_floors }),
        ...(f.building_type && { building_type: f.building_type }),
        ...(f.bathrooms_count != null && { bathrooms_count: f.bathrooms_count }),
      }));

      if (f.floor || f.total_floors || f.bathrooms_count != null) {
        setShowOptional(true);
      }
    } catch {
      setCadastralError("cadastralError");
    } finally {
      setCadastralLoading(false);
    }
  };

  const handleSubmit = () => {
    const firstMissing = !form.city
      ? "city"
      : !form.district
        ? "district"
        : form.rooms_count == null
          ? "rooms_count"
          : !form.area_m2
            ? "area_m2"
            : !form.building_type
              ? "building_type"
              : !form.renovation
                ? "renovation"
                : null;
    if (firstMissing) {
      setHighlightField(firstMissing);
      const refMap = {
        city: refCity,
        district: refDistrict,
        rooms_count: refRooms,
        area_m2: refArea,
        building_type: refBuildingType,
        renovation: refRenovation,
      };
      refMap[firstMissing].current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const params = new URLSearchParams();
    params.set("city", form.city);
    params.set("district", form.district);
    params.set("rooms", String(form.rooms_count));
    params.set("area", String(form.area_m2));
    if (form.floor) params.set("floor", String(form.floor));
    if (form.total_floors) params.set("total_floors", String(form.total_floors));
    if (form.building_type) params.set("building_type", form.building_type);
    if (form.renovation) params.set("renovation", form.renovation);
    if (form.bathrooms_count != null) params.set("bathrooms", String(form.bathrooms_count));
    if (form.balconies_count != null) params.set("balconies", String(form.balconies_count));
    if (cadastralData && !cadastralError) {
      const cadastralNumber = cadastralInput.trim();
      if (cadastralNumber) {
        params.set("cadastral_number", cadastralNumber);
      }
    }
    params.set("_new", "1");

    if (onSubmit) {
      onSubmit(params);
      return;
    }

    router.push(`/evaluare?${params.toString()}`);
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
    if (form.bathrooms_count == null) s += 2;
    if (form.balconies_count == null) s += 2;
    return s;
  }, [form]);

  const isValid =
    form.city && form.district && form.rooms_count != null && form.area_m2 && form.building_type && form.renovation;

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
      <div className="max-w-2xl mx-auto">
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
          <span className="text-sm font-medium">{t("form.back")}</span>
        </button>

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3">
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
                {t("form.title")}
              </h1>
              <p className="text-sm text-gray-400">
                {t("form.subtitle")}
              </p>
            </div>
          </div>
          <LoginButton className="pt-1" />
        </div>

        {/* ── Accuracy meter ── */}
        <div className="mt-6 mb-8">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
              {t("form.accuracy")}
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
          {/* — Cadastral shortcut — */}
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-500 text-xs font-bold flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <span className="text-sm font-semibold text-gray-900">
                {t("form.cadastralSection")}
              </span>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1.5 block">
                {t("form.cadastralNumber")}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={t("form.cadastralPlaceholder")}
                  value={cadastralInput}
                  onChange={(e) => {
                    setCadastralInput(e.target.value);
                    if (cadastralError) setCadastralError(null);
                    if (cadastralData) setCadastralData(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCadastralSearch();
                  }}
                  disabled={cadastralLoading}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={handleCadastralSearch}
                  disabled={cadastralLoading || !cadastralInput.trim()}
                  className="px-5 py-3 rounded-xl text-sm font-medium transition-all duration-150 bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
                >
                  {cadastralLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t("form.cadastralSearching")}
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      {t("form.cadastralSearch")}
                    </>
                  )}
                </button>
              </div>
              {cadastralError && (
                <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                    <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM8 4a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                  </svg>
                  {t(`form.${cadastralError}`)}
                </p>
              )}
              {cadastralData && !cadastralError && !cadastralData.partial && (
                <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-200 p-3 animate-fade-in">
                  <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5 mb-2">
                    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                      <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z" clipRule="evenodd" />
                    </svg>
                    {t("form.cadastralFound")}
                  </p>

                  {cadastralData.apartment?.address && (
                    <p className="text-xs text-emerald-600">{cadastralData.apartment.address}</p>
                  )}
                </div>
              )}
              {cadastralData && !cadastralError && cadastralData.partial && (
                <div className="mt-3 rounded-xl bg-sky-50 border border-sky-200 p-3 animate-fade-in">
                  <p className="text-xs font-medium text-sky-700 flex items-center gap-1.5 mb-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                      <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clipRule="evenodd" />
                    </svg>
                    {t("form.cadastralPartial")}
                  </p>
                  {cadastralData.location?.display_name && (
                    <p className="text-xs text-sky-600">{cadastralData.location.display_name}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* — Section 1: Location — */}
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                1
              </span>
              <span className="text-sm font-semibold text-gray-900">
                {t("form.locationSection")}
              </span>
            </div>

            <div className="space-y-3">
              <div
                ref={refCity}
                className={`rounded-xl transition-all duration-300 ${highlightField === "city" ? "ring-2 ring-red-400 bg-red-50/50 p-2 -m-2" : ""}`}
              >
                <SelectField
                  label={t("form.city")}
                  required
                  value={form.city}
                  onChange={(v) => update("city", v)}
                  placeholder={t("form.selectCity")}
                  options={cities}
                  labelFn={(v) => t(`data.city.${v}`)}
                  disabled
                />
                <p className="mt-1.5 flex items-center gap-1 text-xs text-blue-600/70">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
                    <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clipRule="evenodd" />
                  </svg>
                  {t("form.cityOnlyNotice")}
                </p>
              </div>

              {form.city && districts.length > 0 && (
                <div
                  ref={refDistrict}
                  className={`animate-fade-in rounded-xl transition-all duration-300 ${highlightField === "district" ? "ring-2 ring-red-400 bg-red-50/50 p-2 -m-2" : ""}`}
                >
                  <SelectField
                    label={t("form.district")}
                    required
                    value={form.district}
                    onChange={(v) => update("district", v)}
                    placeholder={t("form.selectDistrict")}
                    options={districts}
                    labelFn={(v) => t(`data.district.${v}`)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* — Section 2: Property basics — */}
          {form.city && form.district && (
            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {t("form.propertySection")}
                </span>
              </div>

              <div className="space-y-4">
                <div
                  ref={refRooms}
                  className={`rounded-xl transition-all duration-300 ${highlightField === "rooms_count" ? "ring-2 ring-red-400 bg-red-50/50 p-2 -m-2" : ""}`}
                >
                  <label className="text-sm text-gray-600 mb-2 block">
                    {t("form.rooms")}
                    <span className="text-red-400 ml-0.5">*</span>
                  </label>
                  <PillGroup
                    options={roomOptions}
                    value={form.rooms_count}
                    onChange={(v) => update("rooms_count", v)}
                    columns={5}
                  />
                </div>

                <div
                  ref={refArea}
                  className={`rounded-xl transition-all duration-300 ${highlightField === "area_m2" ? "ring-2 ring-red-400 bg-red-50/50 p-2 -m-2" : ""}`}
                >
                  <label className="text-sm text-gray-600 mb-1.5 block">
                    {t("form.area")}
                    <span className="text-red-400 ml-0.5">*</span>
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={10000}
                    placeholder={t("form.areaPlaceholder")}
                    value={form.area_m2}
                    onChange={(e) => update("area_m2", e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  />
                </div>

                <div
                  ref={refBuildingType}
                  className={`rounded-xl transition-all duration-300 ${highlightField === "building_type" ? "ring-2 ring-red-400 bg-red-50/50 p-2 -m-2" : ""}`}
                >
                  <label className="text-sm text-gray-600 mb-2 block">
                    {t("form.buildingType")}
                    <span className="text-red-400 ml-0.5">*</span>
                  </label>
                  <PillGroup
                    options={buildingTypes}
                    value={form.building_type}
                    onChange={(v) => update("building_type", v)}
                    labelFn={(v) => t(`data.buildingType.${v}`)}
                  />
                </div>

                <div
                  ref={refRenovation}
                  className={`rounded-xl transition-all duration-300 ${highlightField === "renovation" ? "ring-2 ring-red-400 bg-red-50/50 p-2 -m-2" : ""}`}
                >
                  <label className="text-sm text-gray-600 mb-2 block">
                    {t("form.renovation")}
                    <span className="text-red-400 ml-0.5">*</span>
                  </label>
                  <PillGroup
                    options={renovationTypes}
                    value={form.renovation}
                    onChange={(v) => update("renovation", v)}
                    labelFn={(v) => t(`data.renovationType.${v}`)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* — Section 3: Optional — */}
          <div className="p-5 sm:p-6">
            <button
              type="button"
              onClick={() => setShowOptional((p) => !p)}
              className="w-full flex items-center justify-between"
            >
              <div className="flex items-center cursor-pointer gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-50 text-amber-500 text-xs font-bold flex items-center justify-center">
                  +
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {t("form.optionalSection")}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* {optionalGain > 0 && (
                  <span className="text-xs text-amber-500 font-medium">
                    {t("form.accuracyGain", { gain: optionalGain })}
                  </span>
                )} */}
                <ChevronIcon open={showOptional} />
              </div>
            </button>

            {showOptional && (
              <div className="mt-5 space-y-4 animate-fade-in">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-600 mb-1.5 block">
                      {t("form.floor")}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      placeholder={t("form.floorPlaceholder")}
                      value={form.floor}
                      onChange={(e) => update("floor", e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-1.5 block">
                      {t("form.totalFloors")}
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      placeholder={t("form.totalFloorsPlaceholder")}
                      value={form.total_floors}
                      onChange={(e) => update("total_floors", e.target.value)}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-600 mb-2 block">
                      {t("form.bathrooms")}
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
                      {t("form.balconies")}
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

        {/* ── CTA ── */}
        <button
          type="button"
          onClick={handleSubmit}
          className="w-full mt-6 py-4 rounded-2xl text-base font-semibold transition-all duration-200 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98]"
        >
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
          {t("form.submit")}
        </button>

        {/* ── Social proof ── */}
        <p className="text-center text-xs text-gray-400 mt-3">
          {form.city ? t("form.socialProof", { city: t(`data.city.${form.city}`) }) : ""}
        </p>
      </div>
    </section>
  );
}
