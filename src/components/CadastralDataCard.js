"use client";

import { useTranslation } from "@/context/LanguageContext";

export default function CadastralDataCard({ cadastral, className = "" }) {
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
      cadastral.apartment?.type ||
      cadastral.apartment?.destination ||
      cadastral.apartment?.last_estimated_at ||
      cadastral.apartment?.ownership_type ||
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
  const widthClass = hasFullDetails ? "w-full" : "mx-auto w-full max-w-xl";
  const detailsGridClass = hasFullDetails ? "grid gap-6 lg:grid-cols-2 lg:gap-8" : "grid gap-6";
  const detailValueClass = "whitespace-nowrap text-right font-medium text-gray-900";

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
                  {cadastral.apartment?.area_m2 && (
                    <div className="flex items-start justify-between gap-4 text-base">
                      <span className="text-gray-500">{t("form.cadastralArea")}</span>
                      <span className={detailValueClass}>{cadastral.apartment.area_m2} m²</span>
                    </div>
                  )}
                  {cadastral.apartment?.floor && (
                    <div className="flex items-start justify-between gap-4 text-base">
                      <span className="text-gray-500">{t("form.cadastralFloor")}</span>
                      <span className={detailValueClass}>
                        {cadastral.building?.total_floors
                          ? t("form.floorOf", { floor: cadastral.apartment.floor, total: cadastral.building.total_floors })
                          : cadastral.apartment.floor}
                      </span>
                    </div>
                  )}
                  {cadastral.apartment?.toilet && (
                    <div className="flex items-start justify-between gap-4 text-base">
                      <span className="text-gray-500">{t("form.cadastralToilet")}</span>
                      <span className={detailValueClass}>{cadastral.apartment.toilet}</span>
                    </div>
                  )}
                  {cadastral.apartment?.bathroom && (
                    <div className="flex items-start justify-between gap-4 text-base">
                      <span className="text-gray-500">{t("form.cadastralBathroom")}</span>
                      <span className={detailValueClass}>{cadastral.apartment.bathroom}</span>
                    </div>
                  )}
                  {cadastral.apartment?.is_last_floor && (
                    <div className="flex items-start justify-between gap-4 text-base">
                      <span className="text-gray-500">{t("form.cadastralLastFloor")}</span>
                      <span className={detailValueClass}>{cadastral.apartment.is_last_floor}</span>
                    </div>
                  )}
                  {cadastral.apartment?.estimated_value_lei && (
                    <div className="flex items-start justify-between gap-4 text-base">
                      <span className="text-gray-500">{t("form.cadastralEstimatedValue")}</span>
                      <span className={detailValueClass}>{cadastral.apartment.estimated_value_lei} lei</span>
                    </div>
                  )}
                  {cadastral.apartment?.type && (
                    <div className="flex items-start justify-between gap-4 text-base">
                      <span className="text-gray-500">{t("form.cadastralRoomType")}</span>
                      <span className={detailValueClass}>{cadastral.apartment.type}</span>
                    </div>
                  )}
                  {cadastral.apartment?.destination && (
                    <div className="flex items-start justify-between gap-4 text-base">
                      <span className="text-gray-500">{t("form.cadastralDestination")}</span>
                      <span className={detailValueClass}>{cadastral.apartment.destination}</span>
                    </div>
                  )}
                  {cadastral.apartment?.last_estimated_at && (
                    <div className="flex items-start justify-between gap-4 text-base">
                      <span className="text-gray-500">{t("form.cadastralLastValuation")}</span>
                      <span className={detailValueClass}>{cadastral.apartment.last_estimated_at}</span>
                    </div>
                  )}
                  {cadastral.apartment?.ownership_type && (
                    <div className="flex items-start justify-between gap-4 text-base">
                      <span className="text-gray-500">{t("form.cadastralPropertyType")}</span>
                      <span className={detailValueClass}>{cadastral.apartment.ownership_type}</span>
                    </div>
                  )}
                  {cadastral.apartment?.real_rights && (
                    <div className="flex items-start justify-between gap-4 text-base">
                      <span className="text-gray-500">{t("form.cadastralRealRights")}</span>
                      <span className={detailValueClass}>{cadastral.apartment.real_rights}</span>
                    </div>
                  )}
                  {cadastral.apartment?.notes && (
                    <div className="flex items-start justify-between gap-4 text-base">
                      <span className="text-gray-500">{t("form.cadastralNotes")}</span>
                      <span className={detailValueClass}>{cadastral.apartment.notes}</span>
                    </div>
                  )}
                  {cadastral.apartment?.restrictions && (
                    <div className="flex items-start justify-between gap-4 text-base">
                      <span className="text-gray-500">{t("form.cadastralRestrictions")}</span>
                      <span className={detailValueClass}>{cadastral.apartment.restrictions}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {hasBuildingDetails && (
              <div className={`min-w-0 ${hasApartmentDetails ? "border-t border-emerald-100 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0" : ""}`}>
                <p className="mb-2.5 text-sm font-semibold uppercase tracking-wider text-emerald-700">
                  {t("form.cadastralBuilding")}
                </p>
                <div className="space-y-2.5">
                  {cadastral.building?.classifier && (
                    <div className="flex items-start justify-between gap-4 text-base"><span className="text-gray-500">{t("form.cadastralClassifier")}</span><span className={detailValueClass}>{cadastral.building.classifier}</span></div>
                  )}
                  {cadastral.building?.total_floors && (
                    <div className="flex items-start justify-between gap-4 text-base"><span className="text-gray-500">{t("form.cadastralTotalFloors")}</span><span className={detailValueClass}>{cadastral.building.total_floors}</span></div>
                  )}
                  {cadastral.building?.condition && (
                    <div className="flex items-start justify-between gap-4 text-base"><span className="text-gray-500">{t("form.cadastralCondition")}</span><span className={detailValueClass}>{cadastral.building.condition}</span></div>
                  )}
                  {cadastral.building?.construction_year && (
                    <div className="flex items-start justify-between gap-4 text-base"><span className="text-gray-500">{t("form.cadastralYear")}</span><span className={detailValueClass}>{cadastral.building.construction_year}</span></div>
                  )}
                  {cadastral.building?.wall_material && (
                    <div className="flex items-start justify-between gap-4 text-base"><span className="text-gray-500">{t("form.cadastralWallMaterial")}</span><span className={detailValueClass}>{cadastral.building.wall_material}</span></div>
                  )}
                  {cadastral.building?.water && (
                    <div className="flex items-start justify-between gap-4 text-base"><span className="text-gray-500">{t("form.cadastralWater")}</span><span className={detailValueClass}>{cadastral.building.water}</span></div>
                  )}
                  {cadastral.building?.sewage && (
                    <div className="flex items-start justify-between gap-4 text-base"><span className="text-gray-500">{t("form.cadastralSewage")}</span><span className={detailValueClass}>{cadastral.building.sewage}</span></div>
                  )}
                  {cadastral.building?.gas && (
                    <div className="flex items-start justify-between gap-4 text-base"><span className="text-gray-500">{t("form.cadastralGas")}</span><span className={detailValueClass}>{cadastral.building.gas}</span></div>
                  )}
                  {cadastral.building?.electricity && (
                    <div className="flex items-start justify-between gap-4 text-base"><span className="text-gray-500">{t("form.cadastralElectricity")}</span><span className={detailValueClass}>{cadastral.building.electricity}</span></div>
                  )}
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
