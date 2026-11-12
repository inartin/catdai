"use client";

import { useTranslation } from "@/context/LanguageContext";
import LockIcon from "@/components/icons/LockIcon";
import CadastruFreshnessNote from "@/components/CadastruFreshnessNote";
import { cadastruValueLabel } from "@/lib/cadastru-value-labels";
import { cadastruPropertyDetails } from "@/lib/cadastru-property-details";

export default function CadastralDataCard({
  cadastral,
  className = "",
  locked = false,
  onLockedClick,
  showRevealButton = false,
  hideCompactRevealButton = false,
  revealButtonLabel,
  desktopRevealButtonLabel,
  desktopRevealDescription,
  onRegistryRetry,
  registryRetrying = false,
  children,
}) {
  const { lang, t } = useTranslation();

  if (!cadastral) return null;

  const { displayAddress, unitTitle, apartmentRows, buildingRows, lands, buildings: addressBuildings } =
    cadastruPropertyDetails(cadastral, { lang, t, locked: locked || cadastral.locked_sections?.cadastru_details === true });
  const hasAddressProperties = lands.length > 0 || addressBuildings.length > 0;
  const hasApartmentDetails = Boolean(
    cadastral.apartment?.area_m2 ||
      cadastral.apartment?.floor ||
      cadastral.apartment?.toilet ||
      cadastral.apartment?.bathroom ||
      cadastral.apartment?.is_last_floor ||
      cadastral.apartment?.estimated_value_lei ||
      cadastral.apartment?.object_type ||
      cadastral.apartment?.type ||
      cadastral.apartment?.destination ||
      cadastral.apartment?.room_usage ||
      cadastral.apartment?.ownership_type ||
      cadastral.apartment?.transactions_count ||
      cadastral.apartment?.real_rights ||
      cadastral.apartment?.notes ||
      cadastral.apartment?.restrictions
  );
  const hasBuildingDetails = Boolean(
    cadastral.building?.classifier ||
      cadastral.building?.total_floors ||
      cadastral.building?.condition ||
      cadastral.building?.construction_year ||
      cadastral.building?.wall_material ||
      cadastral.building?.water ||
      cadastral.building?.sewage ||
      cadastral.building?.gas ||
      cadastral.building?.electricity
  );
  // Optional registry enrichment can fail after the property was found.
  // An echoed search number alone does not establish a usable result.
  const hasPropertyResult = lands.some((property) => property?.cadastral_number)
    || addressBuildings.some((property) => property?.cadastral_number)
    || Boolean(cadastral.cadastral_number && (displayAddress || hasApartmentDetails || hasBuildingDetails));
  const hasFullDetails = (hasApartmentDetails && hasBuildingDetails) || hasAddressProperties;
  const widthClass = hasFullDetails ? "w-full" : "mx-auto w-full max-w-xl";
  const detailsGridClass = hasFullDetails
    ? "grid gap-6 lg:grid-cols-2 lg:gap-8"
    : "grid gap-6";
  const detailValueClass = "min-w-0 break-words text-right font-medium text-gray-900";
  const hasLockedDetails = locked || cadastral.locked_sections?.cadastru_details === true;
  const isAddressLocked = hasLockedDetails && cadastral.locked_sections?.address === true;
  const locality = cadastral.address_locality;
  const addressDetail = locality && displayAddress?.startsWith(`${locality}, `)
    ? displayAddress.slice(locality.length + 2) : displayAddress;
  const showLockedRevealButton = Boolean(showRevealButton && hasLockedDetails && onLockedClick);
  const showCompactRevealButton = showLockedRevealButton && !hideCompactRevealButton;
  const revealButton = showCompactRevealButton ? (
    <button
      type="button"
      onClick={onLockedClick}
      className={`inline-flex min-h-10 w-max cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 sm:px-5 ${desktopRevealButtonLabel ? "lg:hidden" : ""} ${cadastral.cadastral_number ? "absolute inset-y-0 left-1/2 h-10 max-w-[calc(100%-1.5rem)] -translate-x-1/2 whitespace-nowrap" : "max-w-full"}`}
    >
      <LockIcon size={16} strokeWidth={2.2} />
      {revealButtonLabel || t("cadastru.unlockData")}
    </button>
  ) : null;
  const isCadastralNumberLocked = hasLockedDetails && cadastral.locked_sections?.cadastral_number === true;
  const isVisibleLockedField = (section, field) => (
    (section === "apartment" && field === "floor") ||
    (section === "building" && field === "classifier")
  );
  const isFieldLocked = (section, field) => hasLockedDetails && !isVisibleLockedField(section, field);
  const lockedValueProps = (section, field) => {
    if (!isFieldLocked(section, field)) return {};
    return {
      role: onLockedClick ? "button" : undefined,
      tabIndex: onLockedClick ? 0 : undefined,
      onClick: onLockedClick,
      onKeyDown: (event) => {
        if (!onLockedClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onLockedClick();
        }
      },
    };
  };
  const valueClassName = (section, field) => (
    `${detailValueClass} ${isFieldLocked(section, field) ? "select-none blur-sm cursor-pointer" : ""}`
  );
  const cadastralNumberProps = isCadastralNumberLocked
    ? {
        role: onLockedClick ? "button" : undefined,
        tabIndex: onLockedClick ? 0 : undefined,
        onClick: onLockedClick,
        onKeyDown: (event) => {
          if (!onLockedClick) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onLockedClick();
          }
        },
      }
    : {};
  const detailRow = (section, field, label, value) => {
    if (value === null || value === undefined || value === "") return null;
    return (
      <div key={field} className="flex items-start justify-between gap-4 text-base">
        <span className="text-gray-500">{label}</span>
        <span className={valueClassName(section, field)} {...lockedValueProps(section, field)}>
          {cadastruValueLabel(value, field, lang)}
        </span>
      </div>
    );
  };
  const propertyCard = (property, kind, index, count) => (
    <div key={`${kind}-${property?.cadastral_number || index}`} className="min-w-0 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
      <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-emerald-700">
        {kind === "land" ? t("form.cadastralLand") : t("form.cadastralConstruction")}
        {count > 1 ? ` ${index + 1}` : ""}
      </p>
      <div className="space-y-2.5">
        {property.rows.map(([field, label, value]) => detailRow(kind, field, label, value))}
      </div>
    </div>
  );

  const card = (
    <div className={`${className} ${widthClass} overflow-hidden rounded-2xl border-2 border-emerald-200 bg-white shadow-md`}>
      <div className="flex items-center gap-2.5 bg-emerald-700 px-6 py-4">
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-6 w-6 shrink-0 text-white">
          <path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.844-8.791a.75.75 0 0 0-1.188-.918l-3.7 4.79-1.649-1.833a.75.75 0 1 0-1.114 1.004l2.25 2.5a.75.75 0 0 0 1.15-.043l4.25-5.5Z" clipRule="evenodd" />
        </svg>
        <span className="text-xl font-semibold text-white">{t("result.cadastralDataTitle")}</span>
      </div>

      <div className="space-y-5 p-6 sm:p-8">
        {cadastral.cadastral_number && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              {t("cadastru.numberLabel")}
            </p>
            <div className={showCompactRevealButton && isCadastralNumberLocked ? "relative mt-2 min-h-10" : "relative mt-1"}>
              <p
                className={`font-mono text-xl font-semibold tracking-wide text-emerald-950 ${isCadastralNumberLocked ? "select-none blur-sm cursor-pointer" : ""}`}
                {...cadastralNumberProps}
              >
                {cadastral.cadastral_number}
              </p>
              {isCadastralNumberLocked ? revealButton : null}
            </div>
          </div>
        )}

        {displayAddress && (
          <p className="text-base text-gray-600">
            {isAddressLocked ? <>
              {locality ? `${locality}, ` : null}
              <span className="select-none blur-sm cursor-pointer" {...lockedValueProps("address", "address")} aria-label={t("cadastru.payToUnlock")}>
                {addressDetail}
              </span>
            </> : displayAddress}
          </p>
        )}

        {!cadastral.cadastral_number && showCompactRevealButton && (
          <div className={`flex justify-center ${desktopRevealButtonLabel ? "lg:hidden" : ""}`}>
            {revealButton}
          </div>
        )}

        {(hasApartmentDetails || hasBuildingDetails) && (
          <div className={detailsGridClass}>
            {hasApartmentDetails && (
              <div className="min-w-0">
                <p className="mb-2.5 text-sm font-semibold uppercase tracking-wider text-emerald-700">
                  {unitTitle}
                </p>
                <div className="space-y-2.5">
                  {apartmentRows.map(([field, label, value]) => detailRow("apartment", field, label, value))}
                </div>
              </div>
            )}

            {hasBuildingDetails && (
              <div className={`min-w-0 ${hasApartmentDetails ? "border-t border-emerald-100 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0" : ""}`}>
                <p className="mb-2.5 text-sm font-semibold uppercase tracking-wider text-emerald-700">
                  {t("form.cadastralBuilding")}
                </p>
                <div className="space-y-2.5">
                  {buildingRows.map(([field, label, value]) => detailRow("building", field, label, value))}
                </div>
              </div>
            )}
          </div>
        )}

        {hasAddressProperties && (
          <div className="grid gap-4 lg:grid-cols-2">
            {lands.map((property, index) => propertyCard(property, "land", index, lands.length))}
            {addressBuildings.map((property, index) => propertyCard(property, "construction", index, addressBuildings.length))}
          </div>
        )}

        {showLockedRevealButton && desktopRevealButtonLabel ? (
          <div className="hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-6 lg:block">
            {desktopRevealDescription ? (
              <p className="mx-auto mb-4 max-w-3xl text-center text-base leading-relaxed text-gray-700">{desktopRevealDescription}</p>
            ) : null}
            <button
              type="button"
              onClick={onLockedClick}
              className="inline-flex min-h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-xl bg-emerald-700 px-6 py-4 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
            >
              <LockIcon size={20} strokeWidth={2.2} />
              {desktopRevealButtonLabel}
            </button>
          </div>
        ) : null}
        {cadastral.registry_unavailable && !hasPropertyResult ? (
          <div role="status" className="mt-4 rounded-xl bg-sky-50 p-4 text-sm text-sky-950">
            <p>{t("cadastru.registryUnavailablePartial")}</p>
            {onRegistryRetry ? <button type="button" disabled={registryRetrying}
              onClick={onRegistryRetry} className="mt-2 cursor-pointer font-semibold underline disabled:cursor-wait disabled:opacity-60">
              {t(registryRetrying ? "cadastru.registryRetrying" : "cadastru.retrySearch")}
            </button> : null}
          </div>
        ) : null}
        <CadastruFreshnessNote freshness={cadastral.data_freshness} />
      </div>
    </div>
  );

  return children ? (
    <div className={widthClass}>
      {card}
      {children}
    </div>
  ) : card;
}
