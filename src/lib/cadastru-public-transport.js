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

function validServiceDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
}

function optionalNonnegative(value) {
  return value === undefined || (Number.isFinite(value) && value >= 0);
}

function validVillageTimetable(timetable) {
  return typeof timetable?.locality === "string" && Boolean(timetable.locality.trim())
    && (timetable.refresh_at === undefined || Number.isFinite(Date.parse(timetable.refresh_at)))
    && Array.isArray(timetable.routes) && timetable.routes.length > 0
    && timetable.routes.every((route) => route && typeof route.from === "string" && typeof route.to === "string"
      && typeof route.to_chisinau === "boolean" && Array.isArray(route.via)
      && (route.service_date === undefined || validServiceDate(route.service_date))
      && optionalNonnegative(route.distance_km)
      && route.via.every((place) => typeof place === "string")
      && Array.isArray(route.departures) && route.departures.every((departure) =>
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(departure?.time)
        && optionalNonnegative(departure.distance_km) && optionalNonnegative(departure.fare_mdl)
        && Array.isArray(departure.days) && departure.days.every((day) => Number.isInteger(day) && day >= 1 && day <= 7))
      && typeof route.source?.name === "string" && validServiceDate(route.source.date) && typeof route.source.url === "string"
      && route.source.url.startsWith("https://"));
}

export function validPublicTransportResult(data) {
  return data && typeof data === "object"
    && ["nearby", "locality"].includes(data.scope)
    && (data.village_timetable === undefined || validVillageTimetable(data.village_timetable))
    && Array.isArray(data.route_groups)
    && data.route_groups.every((group) => group && typeof group.mode === "string"
      && Array.isArray(group.routes)
      && group.routes.every((route) => route && typeof route.ref === "string" && route.ref.trim()));
}
