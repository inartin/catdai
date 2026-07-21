export const CADASTRU_SUPPORTED_CITIES = [
  "Anenii Noi",
  "Bacioi",
  "Bălți",
  "Braila",
  "Bubuieci",
  "Budesti",
  "Buneți",
  "Bîc",
  "Ceroborta",
  "Cheltuitori",
  "Chișinău",
  "Ciorescu",
  "Codru",
  "Colonița",
  "Condrița",
  "Cricova",
  "Cruzești",
  "Dobrogea",
  "Dumbrava",
  "Făurești",
  "Frumușica",
  "Ghidighici",
  "Goian",
  "Goianul Nou",
  "Grătiești",
  "Hulboaca",
  "Humulești",
  "Ialoveni",
  "Orhei",
  "Revaca",
  "Sîngera",
  "Stăuceni",
  "Străisteni",
  "Tiraspol",
  "Tohatin",
  "Trușeni",
  "Vadul lui Vodă",
  "Văduleni",
  "Vatra",
];

function normalizeCity(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[șş]/gi, "s")
    .replace(/[țţ]/gi, "t")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CADASTRU_CITY_ALIASES = new Map(
  CADASTRU_SUPPORTED_CITIES.flatMap((city) => {
    const aliases = [city];
    if (city === "Chișinău") aliases.push("Chisinau", "Kishinev", "Кишинев", "Кишинэу");
    if (city === "Bălți") aliases.push("Balti", "Beltsy", "Бельцы");
    return aliases.map((alias) => [normalizeCity(alias), city]);
  })
);

export function resolveCadastruSupportedCity(value) {
  const normalized = normalizeCity(value)
    .replace(/\b(?:municipiul|municipiu|mun|orasul|oras|or|satul|sat|raionul|raion)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return CADASTRU_CITY_ALIASES.get(normalized) || null;
}

export function resolveCadastruCityFromAddress(value) {
  const firstSegment = String(value || "").split(/[,;]/, 1)[0];
  return resolveCadastruSupportedCity(firstSegment);
}
