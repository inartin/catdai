const CITY_DEFINITIONS = [
  { name: "Chișinău", aliases: ["Chisinau", "Kishinev", "Кишинев", "Кишинэу"] },
  { name: "Durlești" },
  { name: "Braila" },
  { name: "Bacioi" },
  { name: "Bubuieci" },
  { name: "Buneți" },
  { name: "Budesti" },
  { name: "Bîc" },
  { name: "Ceroborta" },
  { name: "Cheltuitori" },
  { name: "Ciorescu" },
  { name: "Codru" },
  { name: "Colonița" },
  { name: "Condrița" },
  { name: "Cricova" },
  { name: "Cruzești" },
  { name: "Dobrogea" },
  { name: "Dumbrava" },
  { name: "Frumușica" },
  { name: "Făurești" },
  { name: "Ghidighici" },
  { name: "Goian" },
  { name: "Goianul Nou" },
  { name: "Grătiești" },
  { name: "Hulboaca" },
  { name: "Humulești" },
  { name: "Revaca" },
  { name: "Străisteni" },
  { name: "Stăuceni" },
  { name: "Sîngera" },
  { name: "Tohatin" },
  { name: "Trușeni" },
  { name: "Vadul lui Vodă" },
  { name: "Vatra" },
  { name: "Văduleni" },
  { name: "Anenii Noi" },
  { name: "Ialoveni" },
  { name: "Tiraspol" },
  { name: "Bălți", aliases: ["Balti", "Beltsy", "Бельцы"] },
  { name: "Orhei" },
];

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[șş]/gi, (match) => (match === match.toUpperCase() ? "S" : "s"))
    .replace(/[țţ]/gi, (match) => (match === match.toUpperCase() ? "T" : "t"));
}

function normalizeCityText(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCityKey(value) {
  return normalizeCityText(value)
    .replace(/\b(?:municipiul|municipiu|mun|orasul|oras|or|satul|sat|raionul|raion|r nul)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CITY_BY_ALIAS = new Map();

for (const definition of CITY_DEFINITIONS) {
  for (const alias of [definition.name, ...(definition.aliases || [])]) {
    CITY_BY_ALIAS.set(normalizeCityKey(alias), definition.name);
  }
}

export const SUPPORTED_CITIES = Object.freeze(CITY_DEFINITIONS.map((definition) => definition.name));

export function resolveSupportedCity(value) {
  return CITY_BY_ALIAS.get(normalizeCityKey(value)) || null;
}

export function resolveSupportedCityFromAddress(value) {
  const normalized = normalizeCityText(value);
  const roadMarkerIndex = normalized.search(/(?<![\p{L}\p{N}])(?:strada|str|bulevardul|bulevard|bd|soseaua|sos|aleea|al|улица|ул|бульвар|бул|проспект|пр|шоссе|аллея)(?![\p{L}\p{N}])/u);
  const localityPrefix = roadMarkerIndex === -1 ? normalized : normalized.slice(0, roadMarkerIndex).trim();
  const markers = [...localityPrefix.matchAll(/\b(municipiul|municipiu|mun|orasul|oras|or|satul|sat|comuna|com|raionul|raion|r nul|r n|sectorul|sector|sect)\s+/g)];

  // Registry addresses run from parent administration to the actual settlement.
  // An unknown child must never be mistaken for its supported parent.
  for (let index = markers.length - 1; index >= 0; index -= 1) {
    const marker = markers[index];
    if (/^(raionul|raion|r nul|r n|sectorul|sector|sect)$/.test(marker[1])) continue;
    const name = localityPrefix.slice(marker.index + marker[0].length, markers[index + 1]?.index);
    return resolveSupportedCity(name);
  }

  // Flat user addresses and city aliases have no administrative hierarchy.
  // A district alone is not a settlement, even if they share the same name.
  if (markers.some((marker) => /^(raionul|raion|r nul|r n)$/.test(marker[1]))) return null;
  return resolveSupportedCity(localityPrefix.slice(0, markers[0]?.index));
}

export function resolveSupportedCityFromGeocode(result) {
  const address = result.address || {};
  const locality = address.village || address.hamlet || address.town
    || (resolveSupportedCity(address.suburb) ? address.suburb : null) || address.city;
  if (locality) return resolveSupportedCity(locality);
  if (result.display_name) return resolveSupportedCityFromAddress(result.display_name);
  return resolveSupportedCity(address.municipality);
}

export function supportedCityAliases(city) {
  const definition = CITY_DEFINITIONS.find((candidate) => candidate.name === city);
  if (!definition) return [];

  return [...new Set([
    definition.name,
    stripDiacritics(definition.name),
    ...(definition.aliases || []),
  ])];
}
