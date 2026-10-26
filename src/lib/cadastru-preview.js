import { buildFeatureCreditRequiredPayload } from "@/lib/paid-feature-usage";
import { resolveCadastruCityFromAddress, resolveCadastruSupportedCity } from "@/lib/cadastru-supported-cities";

const CADASTRU_LOOKUP_FEATURE_KEY = "cadastru_lookup";

function maskValue(value) {
  if (value === null || value === undefined || value === "") return value;
  return String(value).replace(/[\s\S]/g, "|");
}

function maskObjectFields(source, visibleFields = []) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const visible = new Set(visibleFields);
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      visible.has(key) ? value : maskValue(value),
    ])
  );
}

function maskPropertyCollection(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => maskObjectFields(item, ["address", "map_location", "map_geometry"]));
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
      ? placeholder
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

  const preview = {
    cadastral_number: hasAddressProperties
      ? payload?.cadastral_number
      : maskCadastralNumber
        ? "0100201.999.01.0101"
        : payload?.cadastral_number,
    status: payload?.status,
    source: payload?.source,
    method: payload?.method,
    partial: payload?.partial,
    ...(payload?.apartment_unavailable ? { apartment_unavailable: true } : {}),
    ...(payload?.data_freshness ? { data_freshness: payload.data_freshness } : {}),
    district: payload?.district || null,
    map_location: payload?.map_location || null,
    map_geometry: payload?.map_geometry || null,
    apartment: maskObjectFields(apartment, ["address", "floor", "map_location"]),
    building: maskObjectFields(building, ["address", "classifier", "construction_year", "map_location", "map_geometry"]),
    lands: maskPropertyCollection(payload?.lands),
    buildings: maskPropertyCollection(payload?.buildings),
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
      ...(maskCadastralNumber && !hasAddressProperties ? { cadastral_number: true } : {}),
    },
    access_limit: buildFeatureCreditRequiredPayload(CADASTRU_LOOKUP_FEATURE_KEY, reason),
  };
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
