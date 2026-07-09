import { buildFeatureCreditRequiredPayload } from "@/lib/paid-feature-usage";

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
  };

  return {
    cadastral_number: maskCadastralNumber ? "0100201.999.01.0101" : payload?.cadastral_number,
    status: payload?.status,
    source: payload?.source,
    method: payload?.method,
    partial: payload?.partial,
    apartment: maskObjectFields(apartment, ["address", "floor"]),
    building: maskObjectFields(building, ["address", "classifier"]),
    location: maskObjectFields(payload?.location || {}, ["display_name", "road", "house_number", "suburb", "city", "postcode"]),
    matched_address: payload?.matched_address || payload?.building_address || payload?.geocoded_address || null,
    request_address: payload?.request_address || null,
    form_fields: maskObjectFields(payload?.form_fields || {}, ["city", "district", "floor"]),
    full_access: false,
    access_tier: "free",
    locked_sections: {
      ...(payload?.locked_sections || {}),
      cadastru_details: true,
      ...(maskCadastralNumber ? { cadastral_number: true } : {}),
    },
    access_limit: buildFeatureCreditRequiredPayload(CADASTRU_LOOKUP_FEATURE_KEY, reason),
  };
}
