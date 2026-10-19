import { resolveCadastruSupportedCity } from "@/lib/cadastru-supported-cities";
import { normalizeStreetName, resolveStreet } from "@/lib/cadastru-streets/street-resolver";
import { nearbyAddressFromCadastru } from "@/lib/cadastru-nearby";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const normalize = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const cityName = (value) => resolveCadastruSupportedCity(value) || clean(value) || "Unknown city";

export const cadastruReuseCityKey = (value) => normalize(cityName(value));

function roadType(value) {
  const road = normalize(value).replace(/\.$/, "");
  if (["str", "strada", "улица", "ул"].includes(road)) return "str";
  if (["str-la", "stradela", "переулок", "пер"].includes(road)) return "str-la";
  if (["bd", "bul", "bulevard", "bulevardul", "бульвар", "бул", "проспект", "пр"].includes(road)) return "bd";
  return null;
}

function legacyAddress(value) {
  const match = clean(value).match(/^(.+?),\s*(str-la|stradela|strada|str|bulevardul|bulevard|bd|bul|улица|ул|переулок|пер|бульвар|бул|проспект|пр)\.?\s+(.+?)\s+(\d+(?:\/\d+)?)(?:\s*,?\s*(?:apartament|apt|ap)\.?\s*(\d+))?$/iu);
  return match ? { city: match[1], road_type: match[2], street: match[3], house_number: match[4], apartment_number: match[5] } : null;
}

function addressIdentity(row, stored = false) {
  const request = row.search_request || legacyAddress(row.search_address);
  if (!request) return null;
  const city = cityName(request.city || row.city);
  const road = roadType(request.road_type);
  const street = clean(request.street);
  const house = normalize(request.house_number);
  const apartment = clean(request.apartment_number);
  if (!road || !street || !(stored ? /^[\p{L}\d/-]+$/u : /^\d+(?:\/\d+)?$/).test(house) || (!stored && apartment && !/^\d+$/.test(apartment))) return null;
  // Only dictionary-confirmed aliases merge; ambiguous names never get guessed.
  const resolved = resolveStreet({ city, roadType: road, street, exactOnly: true });
  const canonicalStreet = resolved.status === "exact" ? resolved.street : street;
  const unit = /^\d+$/.test(apartment) ? String(Number(apartment)) : normalize(apartment);
  const buildingKey = JSON.stringify([cadastruReuseCityKey(city), road, normalizeStreetName(canonicalStreet), house]);
  const label = { str: "Strada", "str-la": "Stradela", bd: "Bulevard" }[road];
  return { city, buildingKey, unit: unit || null, address: `${label} ${canonicalStreet} ${house}` };
}

function addSearch(group, event) {
  group.searches++;
  if (event.user_id) group.users.add(event.user_id);
  if (Number.isFinite(Date.parse(event.created_at)) && (!group.lastSearched || Date.parse(event.created_at) > Date.parse(group.lastSearched))) {
    group.lastSearched = event.created_at;
  }
}

const counts = ({ users, ...row }) => ({ ...row, repeatUses: Math.max(0, row.searches - 1), registeredUsers: users.size });

function storedAddress(row) {
  const street = clean(row.street).match(/^(str-la|stradela|strada|str|bulevardul|bulevard|bd|bul|улица|ул|переулок|пер|бульвар|бул|проспект|пр)\.?\s+(.+)$/iu);
  const request = street && row.city && row.house_number ? {
    city: row.city, road_type: street[1], street: street[2], house_number: row.house_number,
  } : nearbyAddressFromCadastru({ request_address: row.full_address, form_fields: { city: row.city } });
  return request ? addressIdentity({ search_request: request }, true) : null;
}

const digits = (value) => String(value || "").replace(/\D/g, "");

export function summarizeCadastruAddressReuse(events, { records = [], buildings = [] } = {}) {
  const cities = new Map();
  const citySummary = (city) => {
    const key = cadastruReuseCityKey(city);
    if (!cities.has(key)) cities.set(key, { city, rows: new Map(), excluded: 0 });
    return cities.get(key);
  };
  const buildingGroup = (identity) => {
    const rows = citySummary(identity.city).rows;
    if (!rows.has(identity.buildingKey)) rows.set(identity.buildingKey, { key: identity.buildingKey, address: identity.address,
      searches: 0, users: new Set(), lastSearched: null, properties: new Map() });
    return rows.get(identity.buildingKey);
  };
  const shared = new Map();
  const storedProperties = new Map();
  const sharedCities = new Map(records.filter((row) => row.shared_building_number && row.city)
    .map((row) => [digits(row.shared_building_number), row.city]));
  for (const building of buildings) {
    const number = digits(building.cadastral_number);
    const city = cityName(building.lookup_input?.city || sharedCities.get(number));
    const identity = addressIdentity({ search_request: building.lookup_input }, true)
      || { city, buildingKey: JSON.stringify([cadastruReuseCityKey(city), "building", number]), address: `Building ${building.cadastral_number}` };
    shared.set(number, identity);
    const group = buildingGroup(identity);
    const property = { key: `stored:${number}`, apartmentNumber: null, cadastralNumber: building.cadastral_number,
      propertyType: "building", stored: true, searches: 0, users: new Set(), lastSearched: null };
    group.properties.set(property.key, property);
    storedProperties.set(number, { group, property, city: identity.city });
  }
  const seen = new Set(shared.keys());
  for (const record of records) {
    const number = digits(record.cadastral_number);
    if (!number || seen.has(number)) continue;
    seen.add(number);
    const propertyType = /^\d{15,16}$/.test(number) ? "apartment" : /^\d{8,11}$/.test(number) ? "land" : number.length === 12 ? "building" : "property";
    const parent = propertyType === "apartment" ? digits(record.shared_building_number || record.building_cadastral_number) || number.slice(0, 12) : number;
    const city = cityName(record.city);
    // Keep the record's city attribution consistent with the inventory overview.
    const candidates = [shared.get(parent), storedAddress(record)];
    const identity = candidates.find((address) => address && cadastruReuseCityKey(address.city) === cadastruReuseCityKey(city))
      || { city, buildingKey: JSON.stringify([cadastruReuseCityKey(city), "property", parent]),
        address: `${propertyType === "land" ? "Land parcel" : propertyType === "property" ? "Property" : "Building"} ${parent}` };
    const group = buildingGroup(identity);
    const rawUnit = clean(record.apartment_number);
    const unit = /^\d+$/.test(rawUnit) ? String(Number(rawUnit)) : normalize(rawUnit) || null;
    const property = { key: `stored:${number}`, apartmentNumber: propertyType === "apartment" ? unit : null, propertyType,
      cadastralNumber: record.cadastral_number, stored: true, searches: 0, users: new Set(), lastSearched: null };
    group.properties.set(property.key, property);
    storedProperties.set(number, { group, property, city: identity.city });
  }
  for (const event of events) {
    if (event.search_type !== "address") continue;
    const identity = addressIdentity(event);
    const city = identity?.city || cityName(event.city);
    const summary = citySummary(city);
    if (!identity) { summary.excluded++; continue; }
    const saved = storedProperties.get(digits(event.cadastral_number));
    const linked = saved && cadastruReuseCityKey(saved.city) === cadastruReuseCityKey(city) ? saved : null;
    const group = linked?.group || buildingGroup(identity);
    addSearch(group, event);
    const matches = identity.unit ? [...group.properties.values()].filter((row) => row.stored && row.propertyType === "apartment" && row.apartmentNumber === identity.unit) : [];
    // Conflicting stored unit numbers keep their search stats separate.
    const key = linked?.property.key || (matches.length === 1 ? matches[0].key : `search:${identity.unit || ""}`);
    if (!group.properties.has(key)) {
      group.properties.set(key, { key, apartmentNumber: identity.unit, stored: false, propertyType: identity.unit ? "apartment" : "search",
        searches: 0, users: new Set(), lastSearched: null });
    }
    addSearch(group.properties.get(key), event);
  }
  return new Map([...cities].map(([key, city]) => [key, {
    city: city.city,
    excluded: city.excluded,
    rows: [...city.rows.values()].map(({ properties, ...row }) => ({ ...counts(row),
      apartmentCount: [...properties.values()].filter((unit) => unit.stored && unit.propertyType === "apartment").length,
      landCount: [...properties.values()].filter((unit) => unit.stored && unit.propertyType === "land").length,
      properties: [...properties.values()].map(counts).sort((a, b) =>
        (a.apartmentNumber === null) - (b.apartmentNumber === null)
        || (a.apartmentNumber || "").localeCompare(b.apartmentNumber || "", "ro", { numeric: true }) || a.key.localeCompare(b.key)),
    }))
      .sort((a, b) => b.searches - a.searches || (Date.parse(b.lastSearched) || 0) - (Date.parse(a.lastSearched) || 0) || a.address.localeCompare(b.address, "ro")),
  }]));
}
