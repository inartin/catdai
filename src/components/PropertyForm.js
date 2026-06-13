"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";
import BackButton from "@/components/BackButton";
import AuthRequiredModal from "@/components/AuthRequiredModal";
import InfoCallout from "@/components/InfoCallout";
import CadastralQuickSearchCard from "@/components/CadastralQuickSearchCard";
import { validateCadastralNumber } from "@/lib/validation";

const cities = [
  "Chișinău",
  "Durlești",
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
    "Codru",
    "Aeroport"
  ],
};

const roomOptions = [1, 2, 3, 4, "5+"];
const buildingTypes = [
  "Construcţii noi",
  "Secundar",
];
const renovationTypes = [
  "Euroreparație",
  "Reparație cosmetică",
  "Variantă albă",
  "Fără reparație",
];

const renovationTypeGroups = {
  "Euroreparație": ["Euroreparație", "Design individual"],
  "Reparație cosmetică": ["Reparație cosmetică"],
  "Variantă albă": ["Variantă albă"],
  "Fără reparație": [
    "Fără reparație",
    "Construcție nefinisată",
    "Are nevoie de reparație",
    "Variantă sură",
    "Dat în exploatare",
  ],
};

function normalizeRenovationSelection(value) {
  if (!value) return "";
  for (const [label, members] of Object.entries(renovationTypeGroups)) {
    if (members.includes(value)) return label;
  }
  return value;
}
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

function CalculatorIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-5 h-5"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8" />
      <path d="M8 11h.01" />
      <path d="M12 11h.01" />
      <path d="M16 11h.01" />
      <path d="M8 15h.01" />
      <path d="M12 15h.01" />
      <path d="M16 15h.01" />
      <path d="M8 19h.01" />
      <path d="M12 19h.01" />
      <path d="M16 19h.01" />
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

function MultiSelectField({ label, required, values, onChange, placeholder, options, labelFn }) {
  const selected = Array.isArray(values) ? values : [];

  const toggle = (option) => {
    onChange(
      selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option]
    );
  };

  return (
    <div>
      {label && (
        <label className="text-sm text-gray-600 mb-1.5 block">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      <div className="rounded-xl border border-gray-200 bg-white p-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((option) => {
            const active = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggle(option)}
                className={`min-h-10 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200 hover:bg-white"
                  }`}
              >
                {labelFn ? labelFn(option) : option}
              </button>
            );
          })}
        </div>
        {selected.length === 0 && (
          <p className="px-1 pt-2 text-xs text-gray-400">{placeholder}</p>
        )}
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

function CheckboxOption({ checked, onChange, children }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/20"
      />
      <span>{children}</span>
    </label>
  );
}

function isTrueValue(value) {
  return value === true || value === "true" || value === "1";
}

export default function PropertyForm({ onBack, initialValues, onSubmit, onValidSubmit, variant = "estimate" }) {
  const router = useRouter();
  const { t } = useTranslation();
  const { session, isAuthenticated, clearAuthError } = useAuth();
  const isCalculatorMode = variant === "rentYieldCalculator";
  const estimateModes = [
    { key: "sale", label: t("form.estimateModeSale") },
    { key: "rent", label: t("form.estimateModeRent") },
  ];
  const initialFirstFloor = isTrueValue(initialValues?.first_floor);
  const initialLastFloor = isTrueValue(initialValues?.last_floor);
  const [estimateMode, setEstimateMode] = useState(isCalculatorMode ? "sale" : initialValues?.type === "rent" || initialValues?.mode === "rent" ? "rent" : "sale");
  const isRentMode = !isCalculatorMode && estimateMode === "rent";
  const [form, setForm] = useState({
    city: initialValues?.city ?? "Chișinău",
    district: initialValues?.district ?? "",
    rooms_count: initialValues?.rooms_count ?? null,
    area_m2: initialValues?.area_m2 ?? "",
    floor: initialFirstFloor || initialLastFloor ? "" : initialValues?.floor ?? "",
    first_floor: initialFirstFloor,
    last_floor: initialLastFloor,
    total_floors: initialValues?.total_floors ?? "",
    building_type: initialValues?.building_type ?? "",
    renovation: normalizeRenovationSelection(initialValues?.renovation ?? ""),
    bathrooms_count: initialValues?.bathrooms_count ?? null,
    balconies_count: initialValues?.balconies_count ?? null,
  });
  const [calculatorForm, setCalculatorForm] = useState({
    apartment_price: initialValues?.apartment_price ?? "",
    additional_investments: initialValues?.additional_investments ?? "",
    include_rent_tax: isTrueValue(initialValues?.include_rent_tax),
  });
  const [showOptional, setShowOptional] = useState(
    !!((!initialFirstFloor && !initialLastFloor && initialValues?.floor) || initialFirstFloor || initialLastFloor || initialValues?.total_floors || initialValues?.bathrooms_count || initialValues?.balconies_count)
  );
  const [cadastralInput, setCadastralInput] = useState("");
  const [rentDistricts, setRentDistricts] = useState(
    Array.isArray(initialValues?.districts) && initialValues.districts.length > 0
      ? initialValues.districts
      : initialValues?.district ? [initialValues.district] : []
  );
  const [rentBuildingTypes, setRentBuildingTypes] = useState(
    Array.isArray(initialValues?.building_types) && initialValues.building_types.length > 0
      ? initialValues.building_types
      : initialValues?.building_type ? [initialValues.building_type] : []
  );
  const [cadastralLoading, setCadastralLoading] = useState(false);
  const [cadastralError, setCadastralError] = useState(null);
  const [cadastralData, setCadastralData] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [highlightField, setHighlightField] = useState(null);
  const refCity = useRef(null);
  const refDistrict = useRef(null);
  const refRooms = useRef(null);
  const refArea = useRef(null);
  const refBuildingType = useRef(null);
  const refRenovation = useRef(null);
  const refApartmentPrice = useRef(null);

  const update = (key, value) => {
    setHighlightField(null);
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "city" && value !== prev.city) {
        next.district = "";
        setRentDistricts([]);
        setRentBuildingTypes([]);
      }
      if ((key === "first_floor" || key === "last_floor") && value) next.floor = "";
      if (key === "floor" && value !== "") {
        next.first_floor = false;
        next.last_floor = false;
      }
      return next;
    });
  };

  const updateCalculator = (key, value) => {
    setHighlightField(null);
    setCalculatorForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCadastralSearch = async () => {
    if (!isAuthenticated) {
      clearAuthError();
      setIsAuthModalOpen(true);
      return;
    }

    const validation = validateCadastralNumber(cadastralInput);
    if (!validation.valid) {
      setCadastralError("cadastralInvalid");
      return;
    }

    setCadastralError(null);
    setCadastralLoading(true);

    try {
      const res = await fetch("/api/cadastral", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ cadastral_number: validation.value }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401 || data.error === "unauthorized") {
          clearAuthError();
          setIsAuthModalOpen(true);
        } else if (data.error === "not_found") {
          setCadastralError("cadastralNotFound");
        } else if (data.error === "invalid_format") {
          setCadastralError("cadastralInvalid");
        } else {
          setCadastralError("cadastralError");
        }
        return;
      }


      const isLockedCadastralPreview = data.locked_sections?.cadastru_details === true;
      setCadastralData({
        building: data.building,
        apartment: data.apartment,
        location: data.location,
        partial: data.partial || false,
        locked_sections: data.locked_sections || {},
        access_limit: data.access_limit || null,
      });

      const f = data.form_fields || {};
      setForm((prev) => ({
        ...prev,
        ...(f.city && { city: f.city }),
        ...(f.district && { district: f.district }),
        ...(!isLockedCadastralPreview && f.area_m2 && { area_m2: f.area_m2 }),
        ...(f.floor && !prev.first_floor && !prev.last_floor && { floor: f.floor }),
        ...(!isLockedCadastralPreview && f.total_floors && { total_floors: f.total_floors }),
        ...(!isLockedCadastralPreview && f.building_type && { building_type: f.building_type }),
        ...(!isLockedCadastralPreview && f.bathrooms_count != null && { bathrooms_count: f.bathrooms_count }),
      }));

      if (f.floor || (!isLockedCadastralPreview && (f.total_floors || f.bathrooms_count != null))) {
        setShowOptional(true);
      }
    } catch {
      setCadastralError("cadastralError");
    } finally {
      setCadastralLoading(false);
    }
  };

  const handleSubmit = () => {
    const needsDistrict = (districtsByCity[form.city] || []).length > 0;
    const hasDistrict = isRentMode ? rentDistricts.length > 0 : !!form.district;
    const firstMissing = !form.city
      ? "city"
      : needsDistrict && !hasDistrict
        ? "district"
        : form.rooms_count == null
          ? "rooms_count"
          : !isRentMode && !form.building_type
            ? "building_type"
            : !form.renovation
              ? "renovation"
              : isCalculatorMode && !calculatorForm.apartment_price
                ? "apartment_price"
                : null;
    if (firstMissing) {
      setHighlightField(firstMissing);
      const refMap = {
        city: refCity,
        district: refDistrict,
        rooms_count: refRooms,
        building_type: refBuildingType,
        renovation: refRenovation,
        apartment_price: refApartmentPrice,
      };
      refMap[firstMissing].current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const params = new URLSearchParams();
    params.set("city", form.city);
    if (isRentMode) {
      params.set("type", "rent");
      rentDistricts.forEach((district) => params.append("district", district));
      rentBuildingTypes.forEach((buildingType) => params.append("building_type", buildingType));
    } else if (form.district) {
      params.set("district", form.district);
    }
    params.set("rooms", String(form.rooms_count));
    if (form.area_m2) params.set("area", String(form.area_m2));
    if (form.floor) params.set("floor", String(form.floor));
    if (form.first_floor) params.set("first_floor", "1");
    if (form.last_floor) params.set("last_floor", "1");
    if (form.total_floors) params.set("total_floors", String(form.total_floors));
    if (!isRentMode && form.building_type) params.set("building_type", form.building_type);
    if (form.renovation) params.set("renovation", form.renovation);
    if (form.bathrooms_count != null) params.set("bathrooms", String(form.bathrooms_count));
    if (form.balconies_count != null) params.set("balconies", String(form.balconies_count));
    if (cadastralData && !cadastralError) {
      const cadastralNumber = cadastralInput.trim();
      if (cadastralNumber) {
        params.set("cadastral_number", cadastralNumber);
      }
    }
    if (isCalculatorMode) {
      params.set("apartment_price", String(calculatorForm.apartment_price));
      if (calculatorForm.additional_investments) {
        params.set("additional_investments", String(calculatorForm.additional_investments));
      }
      if (calculatorForm.include_rent_tax) {
        params.set("include_rent_tax", "1");
      }
    }
    params.set("_new", "1");

    if (onSubmit) {
      onValidSubmit?.();
      onSubmit(params);
      return;
    }

    const targetUrl = `/evaluare?${params.toString()}`;
    if (onValidSubmit?.(targetUrl) === false) return;

    router.push(targetUrl);
  };

  const accuracy = useMemo(() => {
    let s = 0;
    if (form.city) s += 20;
    if (isRentMode ? rentDistricts.length > 0 : form.district) s += 15;
    if (form.rooms_count != null) s += 20;
    if (form.area_m2) s += 20;
    if (form.floor || form.first_floor || form.last_floor) s += 5;
    if (!isRentMode && form.total_floors) s += 3;
    if (isRentMode ? rentBuildingTypes.length > 0 : form.building_type) s += 7;
    if (form.renovation) s += 6;
    if (form.bathrooms_count != null) s += 2;
    if (!isRentMode && form.balconies_count != null) s += 2;
    return s;
  }, [form, isRentMode, rentBuildingTypes, rentDistricts]);

  const optionalGain = useMemo(() => {
    let s = 0;
    if (!form.floor && !form.first_floor && !form.last_floor) s += 5;
    if (!form.total_floors) s += 3;
    if (form.bathrooms_count == null) s += 2;
    if (form.balconies_count == null) s += 2;
    return s;
  }, [form]);

  const isValid =
    form.city
    && ((districtsByCity[form.city] || []).length === 0 || (isRentMode ? rentDistricts.length > 0 : form.district))
    && form.rooms_count != null
    && (isRentMode || form.building_type)
    && form.renovation
    && (!isCalculatorMode || calculatorForm.apartment_price);

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

  const calculatorCardShellClass = "rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden";
  const calculatorStandaloneCardClass = `${calculatorCardShellClass} p-5 sm:p-6`;
  const formCardClass = "mt-6 space-y-5";
  const locationSectionClass = "p-5 sm:p-6";

  const renderCadastralQuickSearch = (className = "") => (
    <CadastralQuickSearchCard
      value={cadastralInput}
      onChange={(value) => {
        setCadastralInput(value);
        if (cadastralError) setCadastralError(null);
        if (cadastralData) setCadastralData(null);
      }}
      onSearch={handleCadastralSearch}
      loading={cadastralLoading}
      error={cadastralError ? t(`form.${cadastralError}`) : ""}
      successText={!cadastralError && cadastralData && !cadastralData.partial ? cadastralData.apartment?.address || " " : ""}
      partialText={!cadastralError && cadastralData?.partial ? cadastralData.location?.display_name || " " : ""}
      className={className}
    />
  );

  const renderOptionalDetails = (className = "p-5 sm:p-6") => (
    <div className={className}>
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
          <div className={`${isRentMode ? "" : "grid grid-cols-2 gap-3"}`}>
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
                disabled={form.first_floor || form.last_floor}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
            {!isRentMode && (
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
            )}
          </div>
          {!isRentMode && !isCalculatorMode && (
          <div className="grid gap-2 sm:grid-cols-2">
            <CheckboxOption
              checked={form.first_floor}
              onChange={(value) => update("first_floor", value)}
            >
              {t("result.floorOption.first")}
            </CheckboxOption>
            <CheckboxOption
              checked={form.last_floor}
              onChange={(value) => update("last_floor", value)}
            >
              {t("result.floorOption.last")}
            </CheckboxOption>
          </div>
          )}

          <div className={`${isRentMode ? "" : "grid grid-cols-2 gap-3"}`}>
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
            {!isRentMode && (
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
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section className="py-8 px-4">
      <AuthRequiredModal
        open={isAuthModalOpen}
        copyKey="cadastru.loginToUse"
        onClose={() => setIsAuthModalOpen(false)}
      />
      <div className="max-w-2xl mx-auto">
        <BackButton onClick={onBack} className="mb-6">
          {t("form.back")}
        </BackButton>

        {!isCalculatorMode && (
          <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
            <div className="grid grid-cols-2 gap-1">
              {estimateModes.map((mode) => {
                const active = estimateMode === mode.key;
                return (
                  <button
                    key={mode.key}
                    type="button"
                    onClick={() => setEstimateMode(mode.key)}
                    className={`min-h-11 rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-150 ${active
                      ? "bg-primary text-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      }`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center shrink-0">
              {isCalculatorMode ? (
                <CalculatorIcon />
              ) : (
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
              )}
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {isCalculatorMode ? t("calculator.title") : isRentMode ? t("form.rentTitle") : t("form.title")}
              </h1>
              <p className="text-sm text-gray-400">
                {isCalculatorMode ? t("calculator.subtitle") : isRentMode ? t("form.rentSubtitle") : t("form.subtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* ── Accuracy meter ── */}
        {!isCalculatorMode && (
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
        )}

        {/* ── Form card ── */}
        <div className={formCardClass}>
          {isCalculatorMode && (
            <div className={calculatorStandaloneCardClass}>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {t("calculator.investmentSection")}
                </span>
              </div>

              <div className="space-y-4">
                <div
                  ref={refApartmentPrice}
                  className={`rounded-xl transition-all duration-300 ${highlightField === "apartment_price" ? "ring-2 ring-red-400 bg-red-50/50 p-2 -m-2" : ""}`}
                >
                  <label className="text-sm text-gray-600 mb-1.5 block">
                    {t("calculator.apartmentPrice")}
                    <span className="text-red-400 ml-0.5">*</span>
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    placeholder={t("calculator.apartmentPricePlaceholder")}
                    value={calculatorForm.apartment_price}
                    onChange={(e) => updateCalculator("apartment_price", e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-600 mb-1.5 block">
                    {t("calculator.additionalInvestments")}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder={t("calculator.additionalInvestmentsPlaceholder")}
                    value={calculatorForm.additional_investments}
                    onChange={(e) => updateCalculator("additional_investments", e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  />
                </div>

                <CheckboxOption
                  checked={calculatorForm.include_rent_tax}
                  onChange={(value) => updateCalculator("include_rent_tax", value)}
                >
                  {t("calculator.includeRentTax")}
                </CheckboxOption>
              </div>
            </div>
          )}

          <div className={calculatorCardShellClass}>
          {isCalculatorMode ? (
          <div className="p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                2
              </span>
              <span className="text-sm font-semibold text-gray-900">
                {t("form.locationSection")}
              </span>
            </div>

            {renderCadastralQuickSearch("mb-6")}

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
                  className={`rounded-xl transition-all duration-300 ${highlightField === "district" ? "ring-2 ring-red-400 bg-red-50/50 p-2 -m-2" : ""}`}
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
          ) : (
          <>
          {/* — Section 1: Location — */}
          <div className={locationSectionClass}>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                {isCalculatorMode ? 2 : 1}
              </span>
              <span className="text-sm font-semibold text-gray-900">
                {t("form.locationSection")}
              </span>
            </div>

            {!isRentMode && (
              <div className="mb-6">
                {renderCadastralQuickSearch()}
              </div>
            )}

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
                  className={`rounded-xl transition-all duration-300 ${highlightField === "district" ? "ring-2 ring-red-400 bg-red-50/50 p-2 -m-2" : ""}`}
                >
                  {isRentMode ? (
                    <MultiSelectField
                      label={t("form.district")}
                      required
                      values={rentDistricts}
                      onChange={setRentDistricts}
                      placeholder={t("form.selectDistricts")}
                      options={districts}
                      labelFn={(v) => t(`data.district.${v}`)}
                    />
                  ) : (
                    <SelectField
                      label={t("form.district")}
                      required
                      value={form.district}
                      onChange={(v) => update("district", v)}
                      placeholder={t("form.selectDistrict")}
                      options={districts}
                      labelFn={(v) => t(`data.district.${v}`)}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
          </>
          )}
          </div>

          {/* — Section 2: Property basics — */}
          {form.city && ((districtsByCity[form.city] || []).length === 0 || (isRentMode ? rentDistricts.length > 0 : form.district)) && (
            <div className={calculatorStandaloneCardClass}>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                  {isCalculatorMode ? 3 : 2}
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {isCalculatorMode ? t("calculator.propertySection") : t("form.propertySection")}
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
                    {!isRentMode && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  {isRentMode ? (
                    <MultiSelectField
                      values={rentBuildingTypes}
                      onChange={setRentBuildingTypes}
                      placeholder={t("form.selectBuildingTypes")}
                      options={buildingTypes}
                      labelFn={(v) => t(`data.buildingType.${v}`)}
                    />
                  ) : (
                    <PillGroup
                      options={buildingTypes}
                      value={form.building_type}
                      onChange={(v) => update("building_type", v)}
                      labelFn={(v) => t(`data.buildingType.${v}`)}
                    />
                  )}
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
              <div className="mt-6">
                {renderOptionalDetails("p-0")}
              </div>
            </div>
          )}
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
          {isCalculatorMode ? t("calculator.submit") : t("form.submit")}
        </button>

        {!isCalculatorMode && (
        <p className="mt-4 text-center text-sm text-gray-500">
          {t("form.linkAnalyzerPrompt")}{" "}
          <Link
            href="/verifica-anunt?from=estimeaza"
            className="font-semibold text-primary transition-colors hover:text-primary-dark"
          >
            {t("form.linkAnalyzerCta")}
          </Link>
        </p>
        )}

        {/* ── Social proof ── */}
        <p className="text-center text-xs text-gray-400 mt-3">
          {form.city ? t("form.socialProof", { city: t(`data.city.${form.city}`) }) : ""}
        </p>

        {isCalculatorMode && (
          <InfoCallout title={t("calculator.infoTitle")} className="mt-6">
            {t("calculator.infoText")}
          </InfoCallout>
        )}
      </div>
    </section>
  );
}
