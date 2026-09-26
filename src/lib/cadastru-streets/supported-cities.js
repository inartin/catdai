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

const CITY_ALIASES_BY_LENGTH = [...CITY_BY_ALIAS.entries()].sort(([left], [right]) => right.length - left.length);

export const SUPPORTED_CITIES = Object.freeze(CITY_DEFINITIONS.map((definition) => definition.name));

export function resolveSupportedCity(value) {
  return CITY_BY_ALIAS.get(normalizeCityKey(value)) || null;
}

export function resolveSupportedCityFromAddress(value) {
  const raw = String(value || "");
  const firstSegment = raw.split(/[,;]/, 1)[0];
  const exact = resolveSupportedCity(firstSegment);
  if (exact) return exact;

  const normalized = normalizeCityText(raw);
  const roadMarkerIndex = normalized.search(/\b(?:strada|str|bulevardul|bulevard|bd|soseaua|sos|aleea)\b/);
  const localityPrefix = roadMarkerIndex === -1 ? normalized : normalized.slice(0, roadMarkerIndex).trim();

  for (const [alias, city] of CITY_ALIASES_BY_LENGTH) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "u").test(localityPrefix)) return city;
  }

  return null;
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
