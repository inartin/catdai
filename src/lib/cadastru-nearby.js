import { resolveCadastruCityFromAddress, resolveCadastruSupportedCity } from "@/lib/cadastru-supported-cities";

const ROAD_TYPES = {
  "str-la": "str-la",
  stradela: "str-la",
  "strădela": "str-la",
  str: "strada",
  strada: "strada",
  bd: "bulevard",
  bul: "bulevard",
  bulevard: "bulevard",
  bulevardul: "bulevard",
};

export function nearbyAddressFromCadastru(payload) {
  const addresses = [
    payload?.resolved_address,
    payload?.request_address,
    payload?.apartment?.address,
    payload?.building?.address,
    payload?.matched_address,
    payload?.lands?.[0]?.address,
    payload?.buildings?.[0]?.address,
  ].filter((value) => typeof value === "string");

  for (const address of addresses) {
    const city = resolveCadastruCityFromAddress(address)
      || resolveCadastruSupportedCity(payload?.form_fields?.city || payload?.location?.city);
    const road = address.match(/(?:^|[,;]\s*|\s)(str-la|strădela|stradela|strada|str\.?|bd\.?|bul\.?|bulevard(?:ul)?|ул\.?|улица)\s+([^,;]+)/i);
    if (!city || !road) continue;
    const roadType = ROAD_TYPES[road[1].toLowerCase().replace(/\.$/, "")]
      || (/^(ул|улица)/i.test(road[1]) ? "strada" : null);
    if (!roadType) continue;
    let street = road[2].replace(/\s+(?:ap\.?|apartament(?:ul)?|apt|кв\.?)\s*\d{1,4}\s*$/i, "").trim();
    let houseNumber = street.match(/\s+(\d{1,4}(?:\/\d{1,4})?)\s*$/)?.[1];
    if (houseNumber) street = street.slice(0, -houseNumber.length).trim();
    else houseNumber = address.slice(road.index + road[0].length).match(/^\s*[,;]\s*(?:nr\.?\s*)?(\d{1,4}(?:\/\d{1,4})?)(?=\s*(?:[,;]|$))/i)?.[1];
    if (!street || street.length > 80 || !houseNumber) continue;
    return { city, road_type: roadType, street, house_number: houseNumber };
  }
  return null;
}

export function validNearbyResult(data) {
  return data && typeof data === "object" && ["schools", "supermarkets", "pharmacies", "food", "parks", "public_transport"]
    .every((category) => {
      const places = data.categories?.[category]?.places;
      return Array.isArray(places) && places.length <= 3 && places.every((place) =>
        place && typeof place === "object" && Number.isFinite(place.walking_distance_m)
        && place.walking_distance_m >= 0 && Number.isFinite(place.walking_duration_min)
        && place.walking_duration_min >= 1);
    });
}
