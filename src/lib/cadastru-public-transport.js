import { resolveCadastruCityFromAddress } from "@/lib/cadastru-supported-cities";
import { nearbyAddressFromCadastru } from "@/lib/cadastru-nearby";

function validLocation(location) {
  return Number.isFinite(location?.latitude) && Math.abs(location.latitude) <= 90
    && Number.isFinite(location?.longitude) && Math.abs(location.longitude) <= 180;
}

export function publicTransportInputFromCadastru(payload) {
  const address = nearbyAddressFromCadastru(payload);
  if (address) return address;

  const location = [
    payload?.map_location,
    payload?.building?.map_location,
    payload?.apartment?.map_location,
    ...(Array.isArray(payload?.buildings) ? payload.buildings.map((item) => item?.map_location) : []),
    ...(Array.isArray(payload?.lands) ? payload.lands.map((item) => item?.map_location) : []),
  ].find(validLocation);
  const addresses = [
    payload?.apartment?.address,
    payload?.building?.address,
    payload?.matched_address,
    payload?.buildings?.[0]?.address,
    payload?.lands?.[0]?.address,
    payload?.resolved_address,
    payload?.request_address,
    payload?.location?.display_name,
  ];
  const locality = addresses.map(resolveCadastruCityFromAddress).find(Boolean)
    || [payload?.form_fields?.city, payload?.location?.city, payload?.parsed_input?.city]
      .find((value) => typeof value === "string" && value.trim() && value.length <= 100)?.trim();

  if (!location && !locality) return null;
  return {
    ...(location ? { latitude: location.latitude, longitude: location.longitude } : {}),
    ...(locality ? { locality } : {}),
  };
}

export function validPublicTransportResult(data) {
  return data && typeof data === "object"
    && ["nearby", "locality"].includes(data.scope)
    && Array.isArray(data.route_groups)
    && data.route_groups.every((group) => group && typeof group.mode === "string"
      && Array.isArray(group.routes)
      && group.routes.every((route) => route && typeof route.ref === "string" && route.ref.trim()));
}
