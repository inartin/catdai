"use client";

import { useTranslation } from "@/context/LanguageContext";

export default function CadastralDataCard({
  cadastral,
  className = "",
  locked = false,
  onLockedClick,
  forceDesktopLayout = false,
}) {
  const { t } = useTranslation();

  if (!cadastral) return null;

  const displayAddress =
    cadastral.apartment?.address ||
    cadastral.building?.address ||
    cadastral.location?.display_name ||
    cadastral.matched_address;
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
  const hasFullDetails = hasApartmentDetails && hasBuildingDetails;
  const hasLimitedCadastralData = Boolean(cadastral.partial || !hasApartmentDetails || !hasBuildingDetails);
  const widthClass = hasFullDetails || forceDesktopLayout ? "w-full" : "mx-auto w-full max-w-xl";
  const detailsGridClass = hasFullDetails || forceDesktopLayout
    ? `grid gap-6 ${forceDesktopLayout ? "grid-cols-2 gap-8" : "lg:grid-cols-2 lg:gap-8"}`
    : "grid gap-6";
  const detailValueClass = "min-w-0 break-words text-right font-medium text-gray-900";
  const hasLockedDetails = locked || cadastral.locked_sections?.cadastru_details === true;
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
  const detailRow = (section, field, label, value) => {
    if (!value) return null;
    return (
      <div className="flex items-start justify-between gap-4 text-base">
        <span className="text-gray-500">{label}</span>
        <span className={valueClassName(section, field)} {...lockedValueProps(section, field)}>
          {value}
        </span>
      </div>
    );
  };
  const floorValue = cadastral.apartment?.floor
    ? cadastral.building?.total_floors && !isFieldLocked("building", "total_floors")
      ? t("form.floorOf", { floor: cadastral.apartment.floor, total: cadastral.building.total_floors })
      : cadastral.apartment.floor
    : null;
  const roomTypeValue = cadastral.apartment?.type && cadastral.apartment.type !== cadastral.apartment?.room_usage
    ? cadastral.apartment.type
    : null;

  return (
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
            <p className="mt-1 font-mono text-xl font-semibold tracking-wide text-emerald-950">
              {cadastral.cadastral_number}
            </p>
          </div>
        )}

        {displayAddress && (
          <p className="text-base text-gray-600">
            {displayAddress}
          </p>
        )}

        {hasLimitedCadastralData && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
            <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600">
              <path fillRule="evenodd" d="M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Zm-8-4a.875.875 0 1 0 0 1.75A.875.875 0 0 0 10 6Zm.75 4a.75.75 0 0 0-1.5 0v4a.75.75 0 0 0 1.5 0v-4Z" clipRule="evenodd" />
            </svg>
            <p>{t("cadastru.limitedDataNote")}</p>
          </div>
        )}

        {(hasApartmentDetails || hasBuildingDetails) && (
          <div className={detailsGridClass}>
            {hasApartmentDetails && (
              <div className="min-w-0">
                <p className="mb-2.5 text-sm font-semibold uppercase tracking-wider text-emerald-700">
                  {t("form.cadastralApartment")}
                </p>
                <div className="space-y-2.5">
                  {detailRow("apartment", "area_m2", t("form.cadastralArea"), cadastral.apartment?.area_m2 ? `${cadastral.apartment.area_m2} m²` : null)}
                  {detailRow("apartment", "floor", t("form.cadastralFloor"), floorValue)}
                  {detailRow("apartment", "toilet", t("form.cadastralToilet"), cadastral.apartment?.toilet)}
                  {detailRow("apartment", "bathroom", t("form.cadastralBathroom"), cadastral.apartment?.bathroom)}
                  {detailRow("apartment", "is_last_floor", t("form.cadastralLastFloor"), cadastral.apartment?.is_last_floor)}
                  {detailRow("apartment", "estimated_value_lei", t("form.cadastralEstimatedValue"), cadastral.apartment?.estimated_value_lei ? `${cadastral.apartment.estimated_value_lei} lei` : null)}
                  {detailRow("apartment", "object_type", t("form.cadastralObjectType"), cadastral.apartment?.object_type)}
                  {detailRow("apartment", "type", t("form.cadastralRoomType"), roomTypeValue)}
                  {detailRow("apartment", "destination", t("form.cadastralDestination"), cadastral.apartment?.destination)}
                  {detailRow("apartment", "room_usage", t("form.cadastralRoomUsage"), cadastral.apartment?.room_usage)}
                  {detailRow("apartment", "ownership_type", t("form.cadastralPropertyType"), cadastral.apartment?.ownership_type)}
                  {detailRow("apartment", "transactions_count", t("form.cadastralTransactions"), cadastral.apartment?.transactions_count)}
                  {detailRow("apartment", "real_rights", t("form.cadastralRealRights"), cadastral.apartment?.real_rights)}
                  {detailRow("apartment", "notes", t("form.cadastralNotes"), cadastral.apartment?.notes)}
                  {detailRow("apartment", "restrictions", t("form.cadastralRestrictions"), cadastral.apartment?.restrictions)}
                </div>
              </div>
            )}

            {hasBuildingDetails && (
              <div className={`min-w-0 ${hasApartmentDetails ? forceDesktopLayout ? "border-l border-emerald-100 pl-8" : "border-t border-emerald-100 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0" : ""}`}>
                <p className="mb-2.5 text-sm font-semibold uppercase tracking-wider text-emerald-700">
                  {t("form.cadastralBuilding")}
                </p>
                <div className="space-y-2.5">
                  {detailRow("building", "classifier", t("form.cadastralClassifier"), cadastral.building?.classifier)}
                  {detailRow("building", "total_floors", t("form.cadastralTotalFloors"), cadastral.building?.total_floors)}
                  {detailRow("building", "condition", t("form.cadastralCondition"), cadastral.building?.condition)}
                  {detailRow("building", "construction_year", t("form.cadastralYear"), cadastral.building?.construction_year)}
                  {detailRow("building", "wall_material", t("form.cadastralWallMaterial"), cadastral.building?.wall_material)}
                  {detailRow("building", "water", t("form.cadastralWater"), cadastral.building?.water)}
                  {detailRow("building", "sewage", t("form.cadastralSewage"), cadastral.building?.sewage)}
                  {detailRow("building", "gas", t("form.cadastralGas"), cadastral.building?.gas)}
                  {detailRow("building", "electricity", t("form.cadastralElectricity"), cadastral.building?.electricity)}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pt-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            {t("result.cadastralDataSource")}
          </span>
        </div>
      </div>
    </div>
  );
}
