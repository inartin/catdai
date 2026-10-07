import { matchDistrict } from "./validation.js";

function matchPayloadDistrict(data, city) {
  return matchDistrict(data?.district, city) || matchDistrict(data?.form_fields?.district, city);
}

export function buildFullAccessAddressResultParams(data, { city, resolvedStreetParams = {}, skipCache = false } = {}) {
  const district = matchPayloadDistrict(data, city);
  return new URLSearchParams({
    cadastral_number: data.cadastral_number,
    source: "address",
    ...(district ? { district } : {}),
    ...(data.cadastru_evaluation_token ? { cadastru_evaluation: data.cadastru_evaluation_token } : {}),
    ...resolvedStreetParams,
    ...(skipCache ? { skipcache: "true" } : {}),
  });
}

export function resolveValuationDistrict(cadastral, city, addressDistrict) {
  if (city !== "Chișinău") return null;
  return matchDistrict(addressDistrict, city) || matchPayloadDistrict(cadastral, city);
}
