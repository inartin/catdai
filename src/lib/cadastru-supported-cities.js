import { resolveSupportedCityFromAddress } from "./cadastru-streets/supported-cities.js";

import { LOCALITIES, resolveLocality } from "./cadastru-streets/locality-catalogue.js";
export const CADASTRU_SUPPORTED_CITIES = LOCALITIES.map(row => row.city);

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
  return resolveLocality(value) || CADASTRU_CITY_ALIASES.get(normalized) || null;
}

export function resolveCadastruCityFromAddress(value) {
  return resolveSupportedCityFromAddress(value);
}
