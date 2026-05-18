"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import AuthOptions from "@/components/AuthOptions";
import CloseIcon from "@/components/icons/CloseIcon";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "@/context/LanguageContext";

const defaultAlertFilters = {
  priceMin: "",
  priceMax: "",
  maxPricePerM2: "",
  areaMin: "",
  areaMax: "",
  floorMin: "",
  floorMax: "",
  firstFloor: false,
  lastFloor: false,
  sellerType: "all",
};

function compactObject(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => (
      value !== undefined && value !== null && value !== ""
    ))
  );
}

function parseOptionalNumber(value) {
  const normalized = String(value ?? "").replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function isEmptyRoomValue(value) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function formatRoomValue(value, t) {
  const roomsCount = Number(value);
  return roomsCount === 1
    ? t("result.oneRoom")
    : t("result.rooms", { count: Number.isFinite(roomsCount) ? roomsCount : value });
}

function formatRooms(input, t) {
  if (isEmptyRoomValue(input?.rooms_count)) return null;
  if (Array.isArray(input.rooms_count)) {
    return input.rooms_count.map((value) => formatRoomValue(value, t)).join(", ");
  }

  return formatRoomValue(input.rooms_count, t);
}

function formatFloor(input, t) {
  if (input?.floor === undefined || input?.floor === null || input?.floor === "") return null;
  const floor = Number(input?.floor);
  if (!Number.isFinite(floor)) return null;

  const totalFloors = Number(input?.total_floors);
  if (floor === 1) return t("result.groundFloor");
  if (Number.isFinite(totalFloors) && floor === totalFloors) {
    return t("result.lastFloor", { floor });
  }

  return Number.isFinite(totalFloors)
    ? t("result.floorOf", { floor, total: totalFloors })
    : t("result.floor", { floor });
}

export function buildListingAlertBaseFilters(input, filtersUsed) {
  return compactObject({
    city: input?.city,
    district: input?.district,
    rooms_count: input?.rooms_count,
    area_m2: input?.area_m2,
    floor: input?.floor,
    total_floors: input?.total_floors,
    building_type: input?.building_type,
    renovation: input?.renovation,
    bathrooms_count: input?.bathrooms_count,
    balconies_count: input?.balconies_count,
    filters_used: filtersUsed || undefined,
  });
}

export function buildListingAlertMarketFilterChips(input, t) {
  if (!input) return [];

  return [
    input.city ? t(`data.city.${input.city}`) : null,
    input.district ? t(`data.district.${input.district}`) : null,
    !isEmptyRoomValue(input.rooms_count) ? formatRooms(input, t) : null,
    input.area_m2 ? `~${input.area_m2}m²` : null,
    input.building_type ? t(`data.buildingType.${input.building_type}`) : null,
    input.renovation ? t(`data.renovationType.${input.renovation}`) : null,
    formatFloor(input, t),
  ].filter(Boolean);
}

function buildNotificationFilters(filters) {
  return compactObject({
    price_min: parseOptionalNumber(filters.priceMin),
    price_max: parseOptionalNumber(filters.priceMax),
    max_price_per_m2: parseOptionalNumber(filters.maxPricePerM2),
    area_min: parseOptionalNumber(filters.areaMin),
    area_max: parseOptionalNumber(filters.areaMax),
    floor_min: parseOptionalNumber(filters.floorMin),
    floor_max: parseOptionalNumber(filters.floorMax),
    first_floor: filters.firstFloor ? true : null,
    last_floor: filters.lastFloor ? true : null,
    seller_type: filters.sellerType === "all" ? null : filters.sellerType,
  });
}

function buildListingAlertLabel(input, t) {
  const roomsLabel = formatRooms(input, t);
  const district = input?.district ? `${t(`data.district.${input.district}`)}, ` : "";
  const city = input?.city ? t(`data.city.${input.city}`) : "";
  const propertyParts = [
    t("result.apartment"),
    roomsLabel,
    input?.area_m2 ? `· ${input.area_m2}m²` : null,
  ].filter(Boolean);

  return `${propertyParts.join(" ")} · ${district}${city}`;
}

function PlainFilterChip({ children }) {
  return (
    <span className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700">
      {children}
    </span>
  );
}

function FilterInput({ label, value, placeholder, onChange }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-gray-600">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </label>
  );
}

function SegmentedOption({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${active
        ? "border-primary bg-primary text-white shadow-sm"
        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
        }`}
    >
      {children}
    </button>
  );
}

function CheckboxOption({ checked, children, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
    >
      <span>{children}</span>
      <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${checked ? "border-primary bg-primary text-white" : "border-gray-300 text-transparent"}`}>
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3.5 8 3 3 6-6" />
        </svg>
      </span>
    </button>
  );
}

function SaveAlertAction({
  t,
  alertSaved,
  alertSaving,
  alertError,
  onSave,
  compact = false,
}) {
  return (
    <section className={`${compact
      ? "rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm sm:p-6"
      : "rounded-2xl border border-primary/20 bg-primary/5 p-6 shadow-sm"
      }`}
    >
      {!compact && (
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
      )}
      <div className={compact ? "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" : ""}>
        <div>
          <h3 className={`${compact ? "text-base" : "mt-4 text-base"} font-semibold text-gray-900`}>{t("result.saveAlertTitle")}</h3>
          <p className="mt-2 text-sm text-gray-600">{t("result.saveAlertDesc")}</p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={alertSaving || alertSaved}
          className={`${compact ? "sm:w-auto sm:min-w-48" : "mt-5 w-full"} flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-default disabled:bg-primary/70`}
        >
          {alertSaved ? (
            <>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              {t("result.alertSaved")}
            </>
          ) : alertSaving ? (
            t("result.savingAlert")
          ) : (
            t("result.saveAlert")
          )}
        </button>
      </div>
      {alertError && (
        <p className="mt-3 text-sm text-red-600">{alertError}</p>
      )}
    </section>
  );
}

export default function ListingAlertConfigurator({
  baseInput,
  filtersUsed,
  count = null,
  marketFilterChips,
  onBack,
  backLabel,
  title,
  description,
  baseFiltersTitle,
  baseFiltersDescription,
  baseContent,
  onBeforeSave,
  showAreaFilters = false,
  showDraftBadge = true,
  savePlacement = "aside",
  className = "",
}) {
  const { t } = useTranslation();
  const { session, isAuthenticated, clearAuthError } = useAuth();
  const [filters, setFilters] = useState(defaultAlertFilters);
  const [alertSaved, setAlertSaved] = useState(false);
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertError, setAlertError] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const chips = marketFilterChips?.length
    ? marketFilterChips
    : buildListingAlertMarketFilterChips(baseInput, t);
  const numericCount = Number(count);
  const showCount = count !== null && count !== undefined && Number.isFinite(numericCount);

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

  const openAuthModal = useCallback(() => {
    if (isAuthenticated) return;
    clearAuthError();
    setIsAuthModalOpen(true);
  }, [clearAuthError, isAuthenticated]);

  const updateFilter = (key, value) => {
    setAlertSaved(false);
    setAlertError("");
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveAlert = async () => {
    if (alertSaving || alertSaved) return;

    if (onBeforeSave && !onBeforeSave()) return;

    if (!isAuthenticated || !session?.access_token) {
      setAlertError("");
      openAuthModal();
      return;
    }

    setAlertSaving(true);
    setAlertError("");

    try {
      const res = await fetch("/api/listing-alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          label: buildListingAlertLabel(baseInput, t),
          website_enabled: true,
          telegram_enabled: false,
          base_filters: buildListingAlertBaseFilters(baseInput, filtersUsed),
          alert_filters: buildNotificationFilters(filters),
        }),
      });

      if (res.status === 401) {
        openAuthModal();
        return;
      }

      if (!res.ok) {
        throw new Error("Failed to save alert");
      }

      setAlertSaved(true);
    } catch {
      setAlertError(t("result.saveAlertError"));
    } finally {
      setAlertSaving(false);
    }
  };

  const authModal =
    isAuthModalOpen && typeof document !== "undefined"
      ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 cursor-zoom-out"
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
              {t("result.loginToSaveAlert")}
            </p>

            <AuthOptions />
          </div>
        </div>,
        document.body
      )
      : null;

  return (
    <div className={`animate-fade-in space-y-5 ${className}`}>
      {authModal}

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-400 transition-colors hover:text-gray-700"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          {backLabel || t("result.backToMarketAnalysis")}
        </button>
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-primary">{t("result.listingsViewEyebrow")}</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-gray-900">{title || t("result.listingsViewTitle")}</h2>
            <p className="mt-2 text-sm text-gray-500">{description || t("result.listingsViewDesc")}</p>
          </div>
          {showCount && (
            <div className="rounded-xl bg-gray-50 px-4 py-3 text-left sm:text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t("result.marketListings")}</p>
              <p className="text-xl font-bold text-gray-900">{numericCount.toLocaleString("ro-MD")}</p>
            </div>
          )}
        </div>
      </section>

      <div className={savePlacement === "after"
        ? "space-y-5"
        : "grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"
      }>
        <div className="space-y-5">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <h3 className="text-base font-semibold text-gray-900">{baseFiltersTitle || t("result.baseMarketFilters")}</h3>
            <p className="mt-1 text-sm text-gray-400">{baseFiltersDescription || t("result.baseMarketFiltersDesc")}</p>
            {baseContent ? (
              <div className="mt-5">{baseContent}</div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <PlainFilterChip key={chip}>{chip}</PlainFilterChip>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{t("result.listingFilters")}</h3>
                <p className="mt-1 text-sm text-gray-400">{t("result.listingFiltersDesc")}</p>
              </div>
              {showDraftBadge && (
                <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-600">
                  {t("result.uiDraft")}
                </span>
              )}
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <p className="mb-3 text-sm font-semibold text-gray-900">{t("result.budget")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FilterInput
                    label={t("result.priceFrom")}
                    value={filters.priceMin}
                    placeholder="60 000"
                    onChange={(value) => updateFilter("priceMin", value)}
                  />
                  <FilterInput
                    label={t("result.priceTo")}
                    value={filters.priceMax}
                    placeholder="120 000"
                    onChange={(value) => updateFilter("priceMax", value)}
                  />
                </div>
              </div>

              {showAreaFilters && (
                <div>
                  <p className="mb-3 text-sm font-semibold text-gray-900">{t("form.area")}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FilterInput
                      label={t("alerts.areaFrom")}
                      value={filters.areaMin}
                      placeholder="45"
                      onChange={(value) => updateFilter("areaMin", value)}
                    />
                    <FilterInput
                      label={t("alerts.areaTo")}
                      value={filters.areaMax}
                      placeholder="85"
                      onChange={(value) => updateFilter("areaMax", value)}
                    />
                  </div>
                </div>
              )}

              <FilterInput
                label={t("result.maxPricePerM2")}
                value={filters.maxPricePerM2}
                placeholder="1 700"
                onChange={(value) => updateFilter("maxPricePerM2", value)}
              />

              <div>
                <p className="mb-3 text-sm font-semibold text-gray-900">{t("form.floor")}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <FilterInput
                    label={t("result.floorFrom")}
                    value={filters.floorMin}
                    placeholder="1"
                    onChange={(value) => updateFilter("floorMin", value)}
                  />
                  <FilterInput
                    label={t("result.floorTo")}
                    value={filters.floorMax}
                    placeholder="25"
                    onChange={(value) => updateFilter("floorMax", value)}
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <CheckboxOption
                  checked={filters.firstFloor}
                  onChange={(value) => updateFilter("firstFloor", value)}
                >
                  {t("result.floorOption.first")}
                </CheckboxOption>
                <CheckboxOption
                  checked={filters.lastFloor}
                  onChange={(value) => updateFilter("lastFloor", value)}
                >
                  {t("result.floorOption.last")}
                </CheckboxOption>
              </div>

              <div>
                <p className="mb-3 text-sm font-semibold text-gray-900">{t("result.sellerTypeFilter")}</p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {["all", "owner", "agency", "developer"].map((option) => (
                    <SegmentedOption
                      key={option}
                      active={filters.sellerType === option}
                      onClick={() => updateFilter("sellerType", option)}
                    >
                      {t(`result.sellerType.${option}`)}
                    </SegmentedOption>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {savePlacement === "after" && (
            <SaveAlertAction
              t={t}
              alertSaved={alertSaved}
              alertSaving={alertSaving}
              alertError={alertError}
              onSave={handleSaveAlert}
              compact
            />
          )}
        </div>

        {savePlacement !== "after" && (
          <aside className="space-y-5">
            <SaveAlertAction
              t={t}
              alertSaved={alertSaved}
              alertSaving={alertSaving}
              alertError={alertError}
              onSave={handleSaveAlert}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
