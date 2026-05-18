"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Footer from "@/components/Footer";
import ListingAlertConfigurator from "@/components/ListingAlertConfigurator";
import Navbar from "@/components/Navbar";
import LoginButton from "@/components/LoginButton";
import { useTranslation } from "@/context/LanguageContext";

const cities = ["Chișinău", "Durlești"];

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
    "Aeroport",
  ],
};

const roomOptions = [1, 2, 3, 4, "5+"];
const buildingTypes = ["Construcţii noi", "Secundar"];
const renovationTypes = [
  "Euroreparație",
  "Reparație cosmetică",
  "Variantă albă",
  "Fără reparație",
];

function normalizeRoomCount(value) {
  return value === "5+" ? 5 : value;
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 text-gray-400"
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

function SelectField({ label, required, value, onChange, placeholder, options, labelFn, highlighted }) {
  return (
    <div className={`rounded-xl transition-all duration-300 ${highlighted ? "ring-2 ring-red-400 bg-red-50/50 p-2 -m-2" : ""}`}>
      <label className="mb-1.5 block text-sm text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-xl border border-gray-200 bg-white py-3 pl-4 pr-10 text-sm text-gray-800 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {labelFn ? labelFn(option) : option}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          <ChevronIcon />
        </div>
      </div>
    </div>
  );
}

function PillGroup({ options, value, onChange, columns, labelFn, highlighted }) {
  return (
    <div className={`rounded-xl transition-all duration-300 ${highlighted ? "ring-2 ring-red-400 bg-red-50/50 p-2 -m-2" : ""}`}>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns || options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const active = String(value) === String(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-150 ${active
                ? "border-primary bg-primary text-white shadow-sm"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                }`}
            >
              {labelFn ? labelFn(option) : option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RequiredLabel({ children }) {
  return (
    <label className="mb-2 block text-sm text-gray-600">
      {children}
      <span className="ml-0.5 text-red-400">*</span>
    </label>
  );
}

export default function AlertsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [baseFilters, setBaseFilters] = useState({
    city: "Chișinău",
    district: "",
    rooms_count: null,
    building_type: "",
    renovation: "",
  });
  const [highlightField, setHighlightField] = useState(null);
  const refCity = useRef(null);
  const refDistrict = useRef(null);
  const refRooms = useRef(null);
  const refBuildingType = useRef(null);
  const refRenovation = useRef(null);
  const districts = districtsByCity[baseFilters.city] || [];

  const updateBaseFilter = (key, value) => {
    setHighlightField(null);
    setBaseFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "city" && value !== prev.city) next.district = "";
      return next;
    });
  };

  const validateBaseFilters = () => {
    const needsDistrict = districts.length > 0;
    const firstMissing = !baseFilters.city
      ? "city"
      : needsDistrict && !baseFilters.district
        ? "district"
        : baseFilters.rooms_count == null
          ? "rooms_count"
          : !baseFilters.building_type
            ? "building_type"
            : !baseFilters.renovation
              ? "renovation"
              : null;

    if (!firstMissing) return true;

    setHighlightField(firstMissing);
    const refMap = {
      city: refCity,
      district: refDistrict,
      rooms_count: refRooms,
      building_type: refBuildingType,
      renovation: refRenovation,
    };
    refMap[firstMissing].current?.scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  };

  const normalizedBaseFilters = {
    ...baseFilters,
    rooms_count: normalizeRoomCount(baseFilters.rooms_count),
  };

  const baseContent = (
    <div className="space-y-5">
      <div ref={refCity}>
        <SelectField
          label={t("form.city")}
          required
          value={baseFilters.city}
          onChange={(value) => updateBaseFilter("city", value)}
          placeholder={t("form.selectCity")}
          options={cities}
          labelFn={(value) => t(`data.city.${value}`)}
          highlighted={highlightField === "city"}
        />
        <p className="mt-1.5 flex items-center gap-1 text-xs text-blue-600/70">
          {t("form.cityOnlyNotice")}
        </p>
      </div>

      {baseFilters.city && districts.length > 0 && (
        <div ref={refDistrict}>
          <SelectField
            label={t("form.district")}
            required
            value={baseFilters.district}
            onChange={(value) => updateBaseFilter("district", value)}
            placeholder={t("form.selectDistrict")}
            options={districts}
            labelFn={(value) => t(`data.district.${value}`)}
            highlighted={highlightField === "district"}
          />
        </div>
      )}

      <div ref={refRooms}>
        <RequiredLabel>{t("form.rooms")}</RequiredLabel>
        <PillGroup
          options={roomOptions}
          value={baseFilters.rooms_count}
          onChange={(value) => updateBaseFilter("rooms_count", value)}
          columns={5}
          highlighted={highlightField === "rooms_count"}
        />
      </div>

      <div ref={refBuildingType}>
        <RequiredLabel>{t("form.buildingType")}</RequiredLabel>
        <PillGroup
          options={buildingTypes}
          value={baseFilters.building_type}
          onChange={(value) => updateBaseFilter("building_type", value)}
          labelFn={(value) => t(`data.buildingType.${value}`)}
          highlighted={highlightField === "building_type"}
        />
      </div>

      <div ref={refRenovation}>
        <RequiredLabel>{t("form.renovation")}</RequiredLabel>
        <PillGroup
          options={renovationTypes}
          value={baseFilters.renovation}
          onChange={(value) => updateBaseFilter("renovation", value)}
          labelFn={(value) => t(`data.renovationType.${value}`)}
          highlighted={highlightField === "renovation"}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mb-6 flex items-center gap-1.5 text-sm font-medium text-gray-400 transition-colors hover:text-gray-700"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            {t("form.back")}
          </button>

          <div className="mb-6 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </span>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">{t("alerts.pageTitle")}</h1>
                <p className="mt-1 text-sm text-gray-500">{t("alerts.pageSubtitle")}</p>
              </div>
            </div>
            <LoginButton className="pt-1" />
          </div>

          <ListingAlertConfigurator
            baseInput={normalizedBaseFilters}
            title={t("alerts.configTitle")}
            description={t("alerts.configDesc")}
            baseFiltersTitle={t("alerts.baseFiltersTitle")}
            baseFiltersDescription={t("alerts.baseFiltersDesc")}
            baseContent={baseContent}
            onBeforeSave={validateBaseFilters}
            showAreaFilters
            showDraftBadge={false}
            savePlacement="after"
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
