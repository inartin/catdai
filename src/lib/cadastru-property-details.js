import { cadastruValueLabel } from "./cadastru-value-labels.js";

const COMMERCIAL_UNIT_ROWS = {
  located_in_basement: "cadastralUnitBasement",
  located_in_semi_basement: "cadastralUnitSemiBasement",
  located_on_first_floor: "cadastralUnitFirstFloor",
  located_on_second_floor: "cadastralUnitSecondFloor",
  located_on_third_floor: "cadastralUnitThirdFloor",
  located_on_fourth_floor_or_above: "cadastralUnitFourthFloorOrAbove",
  located_in_attic: "cadastralUnitAttic",
  condition: "cadastralUnitCondition",
  heating: "cadastralUnitHeating",
  autonomous_exit: "cadastralUnitAutonomousExit",
};

export function isCadastruNonResidential(unit) {
  if (unit?.unit_kind === "non_residential") return true;
  const destination = String(unit?.destination ?? "").trim().toLowerCase().normalize("NFD");
  return /^nelocativ[ae]?$/.test(destination.replace(/\p{Diacritic}/gu, ""));
}

export function cadastruDisplayAddress(cadastral) {
  return cadastral?.apartment?.address
    || cadastral?.building?.address
    || cadastral?.lands?.[0]?.address
    || cadastral?.buildings?.[0]?.address
    || cadastral?.location?.display_name
    || cadastral?.matched_address;
}

export function cadastruReportBlockedByRegistry(payload) {
  if (!payload?.registry_unavailable) return false;
  // A verified property with a sourced address or assessed value still has
  // report data when other registry requests fail. Bare map recovery waits.
  const hasReportDetails = [payload.lands, payload.buildings].some((properties) =>
    Array.isArray(properties) && properties.some((property) =>
      property?.cadastral_number && (property.address || property.estimated_value_lei)));
  return !hasReportDetails;
}

export function hasDuplicateFootprintArea(property) {
  const footprint = property?.footprint_area_m2;
  return !property?.area && footprint != null && footprint !== ""
    && String(property.area_m2) === String(footprint);
}

export function cadastruPropertyDetails(cadastral, { lang, t, locked = false }) {
  const unit = cadastral.apartment;
  const nonResidential = isCadastruNonResidential(unit);
  const usageInTitle = nonResidential && !locked && unit.room_usage;
  const unitTitle = nonResidential
    ? usageInTitle ? cadastruValueLabel(unit.room_usage, "room_usage", lang) : t("form.cadastralNonResidentialUnit")
    : t("form.cadastralApartment");
  const displayAddress = cadastruDisplayAddress(cadastral);
  const floorValue = cadastral.apartment?.floor
    ? cadastral.building?.total_floors && !locked
      ? t("form.floorOf", { floor: cadastral.apartment.floor, total: cadastral.building.total_floors })
      : cadastral.apartment.floor
    : null;
  const roomTypeValue = cadastral.apartment?.type && cadastral.apartment.type !== cadastral.apartment?.room_usage
    ? cadastral.apartment.type
    : null;
  const formatSquareMeters = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return value ? `${value} m²` : null;
    return `${new Intl.NumberFormat(lang === "en" ? "en-GB" : lang === "ru" ? "ru-RU" : "ro-MD", { maximumFractionDigits: 2 }).format(number)} m²`;
  };
  const formatEstimatedValue = (value) => (
    value === null || value === undefined || value === "" ? null : `${value} MDL`
  );
  const propertyRows = (property, kind) => ({
    cadastral_number: property?.cadastral_number,
    rows: [
      ["cadastral_number", t("cadastru.numberLabel"), property?.cadastral_number],
      ["address", t("form.cadastralAddress"), property?.address !== displayAddress ? property?.address : null],
      ["area", t("form.cadastralArea"), property?.area],
      ["area_m2", t("form.cadastralAreaM2"), !locked && kind === "construction" && hasDuplicateFootprintArea(property)
        ? null : formatSquareMeters(property?.area_m2)],
      ["object_type", t("form.cadastralObjectType"), property?.object_type],
      ["type", t("form.cadastralType"), property?.type],
      ["destination", t("form.cadastralDestination"), property?.destination],
      ["room_usage", t("form.cadastralRoomUsage"), property?.room_usage],
      ["use_mode", t("form.cadastralUseMode"), property?.use_mode],
      ["boundary_type", t("form.cadastralBoundaryType"), property?.boundary_type],
      ...(kind === "land" ? [
        ["land_use", t("form.cadastralLandUse"), property?.land_use],
        ["slope", t("form.cadastralLandSlope"), property?.slope],
        ["access_road", t("form.cadastralAccessRoad"), property?.access_road],
        ["street_position", t("form.cadastralStreetPosition"), property?.street_position],
        ["traffic_intensity", t("form.cadastralTrafficIntensity"), property?.traffic_intensity],
        ["electricity", t("form.cadastralElectricitySupply"), property?.utilities?.electricity],
        ["water", t("form.cadastralWater"), property?.utilities?.water],
        ["sewage", t("form.cadastralSewage"), property?.utilities?.sewage],
        ["gas", t("form.cadastralGas"), property?.utilities?.gas],
      ] : []),
      ["building_use", t("form.cadastralBuildingUse"), kind === "construction" ? property?.building_use : null],
      ...(kind === "construction" ? [
        ["footprint_area_m2", t("form.cadastralFootprintArea"), formatSquareMeters(property?.footprint_area_m2)],
        ["interior_area_m2", t("form.cadastralInteriorArea"), formatSquareMeters(property?.interior_area_m2)],
        ["exterior_area_m2", t("form.cadastralExteriorArea"), formatSquareMeters(property?.exterior_area_m2)],
        ["construction_year", t("form.cadastralYear"), property?.construction_year],
        ["basement", t("form.cadastralBasement"), property?.basement],
        ["semi_basement", t("form.cadastralSemiBasement"), property?.semi_basement],
        ["attic", t("form.cadastralAttic"), property?.attic],
        ["built_in_garage", t("form.cadastralBuiltInGarage"), property?.built_in_garage],
        ["wall_material", t("form.cadastralWallMaterial"), property?.wall_material],
        ["roof_material", t("form.cadastralRoofMaterial"), property?.roof_material],
        ["electricity", t("form.cadastralElectricitySupply"), property?.electricity],
        ["water", t("form.cadastralWater"), property?.water],
        ["sewage", t("form.cadastralSewage"), property?.sewage],
        ["gas", t("form.cadastralGas"), property?.gas],
        ["heating", t("form.cadastralUnitHeating"), property?.heating],
        ["condition", t("form.cadastralUnitCondition"), property?.condition],
        ["completion_percent", t("form.cadastralCompletion"), property?.completion_percent == null || property.completion_percent === ""
          ? null : `${String(property.completion_percent).replace(/\s*%$/, "")}%`],
      ] : []),
      ["estimated_value_lei", t("form.cadastralEstimatedValue"), formatEstimatedValue(property?.estimated_value_lei)],
      ["last_estimated_at", t("form.cadastralLastEstimatedAt"), property?.last_estimated_at],
      ["ownership_type", t("form.cadastralPropertyType"), property?.ownership_type],
      ["transactions_count", t("form.cadastralTransactions"), property?.transactions_count],
      ["real_rights", t("form.cadastralRealRights"), property?.real_rights],
      ["notes", t("form.cadastralNotes"), property?.notes],
      ["restrictions", t("form.cadastralRestrictions"), property?.restrictions],
    ],
  });
  return {
    displayAddress,
    unitTitle,
    apartmentRows: [
      ["area_m2", t("form.cadastralArea"), cadastral.apartment?.area_m2 ? `${cadastral.apartment.area_m2} m²` : null],
      ["floor", t("form.cadastralFloor"), floorValue],
      ["toilet", t("form.cadastralToilet"), cadastral.apartment?.toilet],
      ["bathroom", t("form.cadastralBathroom"), cadastral.apartment?.bathroom],
      ["is_last_floor", t("form.cadastralLastFloor"), cadastral.apartment?.is_last_floor],
      ["estimated_value_lei", t("form.cadastralEstimatedValue"), cadastral.apartment?.estimated_value_lei ? `${cadastral.apartment.estimated_value_lei} ${lang === "en" ? "MDL" : "lei"}` : null],
      ["object_type", t("form.cadastralObjectType"), cadastral.apartment?.object_type],
      ["type", t("form.cadastralRoomType"), roomTypeValue],
      ["destination", t("form.cadastralDestination"), cadastral.apartment?.destination],
      ["room_usage", t("form.cadastralRoomUsage"), usageInTitle ? null : unit?.room_usage],
      ...(nonResidential ? Object.entries(COMMERCIAL_UNIT_ROWS)
        .map(([field, label]) => [field, t(`form.${label}`), unit[field]]) : []),
      ["ownership_type", t("form.cadastralPropertyType"), cadastral.apartment?.ownership_type],
      ["transactions_count", t("form.cadastralTransactions"), cadastral.apartment?.transactions_count],
      ["real_rights", t("form.cadastralRealRights"), cadastral.apartment?.real_rights],
      ["notes", t("form.cadastralNotes"), cadastral.apartment?.notes],
      ["restrictions", t("form.cadastralRestrictions"), cadastral.apartment?.restrictions],
    ],
    buildingRows: [
      ["classifier", t("form.cadastralClassifier"), cadastral.building?.classifier],
      ["total_floors", t("form.cadastralTotalFloors"), cadastral.building?.total_floors],
      ["condition", t("form.cadastralCondition"), cadastral.building?.condition],
      ["construction_year", t("form.cadastralYear"), cadastral.building?.construction_year],
      ["wall_material", t("form.cadastralWallMaterial"), cadastral.building?.wall_material],
      ["water", t("form.cadastralWater"), cadastral.building?.water],
      ["sewage", t("form.cadastralSewage"), cadastral.building?.sewage],
      ["gas", t("form.cadastralGas"), cadastral.building?.gas],
      ["electricity", t("form.cadastralElectricity"), cadastral.building?.electricity],
    ],
    lands: (Array.isArray(cadastral.lands) ? cadastral.lands : []).map((item) => propertyRows(item, "land")),
    buildings: (Array.isArray(cadastral.buildings) ? cadastral.buildings : []).map((item) => propertyRows(item, "construction")),
  };
}
