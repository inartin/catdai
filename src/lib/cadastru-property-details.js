export function cadastruPropertyDetails(cadastral, { lang, t, locked = false }) {
  const displayAddress =
    cadastral.apartment?.address ||
    cadastral.building?.address ||
    cadastral.lands?.[0]?.address ||
    cadastral.buildings?.[0]?.address ||
    cadastral.location?.display_name ||
    cadastral.matched_address;
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
      ["area", t("form.cadastralArea"), property?.area],
      ["area_m2", t("form.cadastralAreaM2"), formatSquareMeters(property?.area_m2)],
      ["object_type", t("form.cadastralObjectType"), property?.object_type],
      ["type", t("form.cadastralType"), property?.type],
      ["destination", t("form.cadastralDestination"), property?.destination],
      ["room_usage", t("form.cadastralRoomUsage"), property?.room_usage],
      ["use_mode", t("form.cadastralUseMode"), property?.use_mode],
      ["boundary_type", t("form.cadastralBoundaryType"), property?.boundary_type],
      ["land_use", t("form.cadastralLandUse"), kind === "land" ? property?.land_use : null],
      ["building_use", t("form.cadastralBuildingUse"), kind === "construction" ? property?.building_use : null],
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
      ["room_usage", t("form.cadastralRoomUsage"), cadastral.apartment?.room_usage],
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
