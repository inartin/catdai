import { buildFeatureCreditRequiredPayload } from "@/lib/paid-feature-usage";
import { resolveCadastruCityFromAddress, resolveCadastruSupportedCity } from "@/lib/cadastru-supported-cities";
import { cadastruMapLocation, redactCadastruMapData } from "@/lib/cadastru-map";
import { cadastruDisplayAddress, cadastruReportBlockedByRegistry, hasDuplicateFootprintArea, isCadastruNonResidential } from "@/lib/cadastru-property-details";

const CADASTRU_LOOKUP_FEATURE_KEY = "cadastru_lookup";

function maskValue(value) {
  if (value === null || value === undefined || value === "") return value;
  return String(value).replace(/[\s\S]/g, "||");
}

const AREA_FIELDS = new Set(["area", "area_m2", "footprint_area_m2", "interior_area_m2", "exterior_area_m2"]);
const AREA_UNIT_SUFFIX = /(\s+(?:m²|m2|m\^2|ha))$/iu;

function maskAreaValue(value) {
  if (value === null || value === undefined || value === "") return value;
  const text = String(value);
  const unit = text.match(AREA_UNIT_SUFFIX);
  const number = unit ? text.slice(0, unit.index) : text;
  return `${maskValue(number)}${unit?.[1] || ""}`;
}

function maskObjectFields(source, visibleFields = [], options = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const visible = new Set(visibleFields);
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      visible.has(key) ? value : options.preserveAreaUnits && AREA_FIELDS.has(key)
        ? maskAreaValue(value) : maskValue(value),
    ])
  );
}

function maskPropertyCollection(items, displayAddress, construction = false) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => {
    const visibleFields = ["map_location", "map_geometry"];
    if (item?.address === displayAddress) visibleFields.push("address");
    const masked = maskObjectFields(item, visibleFields, { preserveAreaUnits: true });
    if (construction && hasDuplicateFootprintArea(item)) delete masked.area_m2;
    const utilities = item?.utilities;
    return utilities && typeof utilities === "object" && !Array.isArray(utilities)
      ? { ...masked, utilities: maskObjectFields(utilities) } : masked;
  });
}

function addressLocality(payload) {
  const addresses = [payload?.apartment?.address, payload?.building?.address,
    payload?.matched_address, payload?.building_address, payload?.geocoded_address,
    payload?.resolved_address, payload?.request_address, payload?.location?.display_name,
    ...(Array.isArray(payload?.lands) ? payload.lands : []).map((item) => item?.address),
    ...(Array.isArray(payload?.buildings) ? payload.buildings : []).map((item) => item?.address)];
  return addresses.map(resolveCadastruCityFromAddress).find(Boolean)
    || [payload?.location?.village, payload?.location?.town, payload?.location?.city,
      payload?.form_fields?.city, payload?.parsed_input?.city].map(resolveCadastruSupportedCity).find(Boolean)
    || null;
}

const ADDRESS_FIELDS = new Set(["address", "display_name", "matched_address", "building_address",
  "geocoded_address", "request_address", "resolved_address", "full_address", "formatted_address"]);
const ADDRESS_PARTS = new Set(["road", "street", "street_name", "house_number", "building_number",
  "apartment_number", "postcode"]);

function maskAddresses(value, placeholder) {
  if (Array.isArray(value)) return value.map((item) => maskAddresses(item, placeholder));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    ADDRESS_FIELDS.has(key) && typeof item === "string" && item
      ? /^\|+$/.test(item) ? item : placeholder
      : ADDRESS_PARTS.has(key) && (typeof item === "string" || typeof item === "number")
        ? maskValue(item)
        : maskAddresses(item, placeholder),
  ]));
}

export function buildCadastruPreviewPayload(payload, reason = "no_credit", options = {}) {
  const maskCadastralNumber = options?.maskCadastralNumber === true;
  const apartment = {
    ...(payload?.apartment || {}),
    address: payload?.apartment?.address || payload?.matched_address || null,
    floor: payload?.apartment?.floor || payload?.apartment_floor || null,
  };
  const building = {
    ...(payload?.building || {}),
    address: payload?.building?.address || payload?.building_address || null,
    construction_year:
      payload?.building?.construction_year || payload?.building_construction_year || null,
  };
  const hasAddressProperties = Boolean(payload?.lands?.length || payload?.buildings?.length);
  const displayAddress = cadastruDisplayAddress({ ...payload, apartment, building });
  const accessLimit = buildFeatureCreditRequiredPayload(CADASTRU_LOOKUP_FEATURE_KEY, reason);
  if (cadastruReportBlockedByRegistry(payload)) accessLimit.purchase = null;

  const preview = redactCadastruMapData({
    cadastral_number: hasAddressProperties
      ? payload?.cadastral_number
      : maskCadastralNumber
        ? "0100201.999.01.0101"
        : payload?.cadastral_number,
    status: payload?.status,
    source: payload?.source,
    method: payload?.method,
    partial: payload?.partial,
    ...(payload?.registry_unavailable ? { registry_unavailable: true } : {}),
    ...(payload?.apartment_unavailable ? { apartment_unavailable: true } : {}),
    ...(payload?.data_freshness ? { data_freshness: payload.data_freshness } : {}),
    district: payload?.district || null,
    map_location: payload?.map_location || null,
    map_geometry: payload?.map_geometry || null,
    apartment: {
      ...maskObjectFields(apartment, ["address", "floor", "map_location"], { preserveAreaUnits: true }),
      ...(isCadastruNonResidential(apartment) ? { unit_kind: "non_residential" } : {}),
    },
    building: maskObjectFields(building, ["address", "classifier", "map_location", "map_geometry"], { preserveAreaUnits: true }),
    lands: maskPropertyCollection(payload?.lands, displayAddress),
    buildings: maskPropertyCollection(payload?.buildings, displayAddress, true),
    location: maskObjectFields(payload?.location || {}, ["display_name", "road", "house_number", "suburb", "city", "postcode"]),
    matched_address: payload?.matched_address || payload?.building_address || payload?.geocoded_address || null,
    request_address: payload?.request_address || null,
    resolved_address: payload?.resolved_address || null,
    street_resolution: payload?.street_resolution || null,
    form_fields: maskObjectFields(payload?.form_fields || {}, ["city", "district", "floor"]),
    full_access: false,
    access_tier: "free",
    locked_sections: {
      ...(payload?.locked_sections || {}),
      cadastru_details: true,
      map: true,
      ...(maskCadastralNumber && !hasAddressProperties ? { cadastral_number: true } : {}),
    },
    access_limit: accessLimit,
  });
  preview.map_preview = { available: Boolean(cadastruMapLocation(payload)) };
  if (options?.maskAddress !== true) return preview;
  const locality = addressLocality(payload);
  const placeholder = [locality, "str. Exemplu 10, ap. 1"].filter(Boolean).join(", ");
  return {
    ...maskAddresses(preview, placeholder),
    address_locality: locality,
    street_resolution: null,
    locked_sections: { ...preview.locked_sections, address: true },
  };
}
