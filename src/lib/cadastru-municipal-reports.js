import { resolveCadastruSupportedCity } from "@/lib/cadastru-supported-cities";
import { publicTransportInputFromCadastru } from "@/lib/cadastru-public-transport";

export function municipalReportsAvailableForCadastru(payload) {
  const input = publicTransportInputFromCadastru(payload);
  return resolveCadastruSupportedCity(input?.city || input?.locality) === "Chișinău";
}

export function municipalReportsInputFromCadastru(payload) {
  if (!municipalReportsAvailableForCadastru(payload)) return null;
  const input = publicTransportInputFromCadastru(payload);
  if (input?.house_number) return input;
  // Municipal reports need a precise origin; locality-only transport fallbacks do not apply.
  if (Number.isFinite(input?.latitude) && Number.isFinite(input?.longitude)) {
    return { latitude: input.latitude, longitude: input.longitude };
  }
  return null;
}

export function validMunicipalReportsResult(data) {
  const count = (value) => Number.isInteger(value) && value >= 0;
  return Boolean(data && typeof data === "object"
    && typeof data.address_match_available === "boolean"
    && (data.address_match_available ? count(data.summary?.at_address) : data.summary?.at_address === null)
    && ["nearby", "solved", "total"].every((key) => count(data.summary?.[key]))
    && Number.isFinite(data.search_radius_m) && data.search_radius_m > 0
    && Number.isInteger(data.period?.years) && data.period.years > 0
    && Number.isFinite(Date.parse(data.cache?.fetched_at))
    && ["at_address", "nearby"].every((key) => Array.isArray(data[key]?.reports)
      && data[key].reports.length <= 10
      && data[key].reports.every((report) => report && typeof report.id === "string"
        && typeof report.title === "string" && typeof report.status === "string"
        && typeof report.reported_at === "string" && Number.isFinite(Date.parse(report.reported_at))
        && typeof report.is_public === "boolean"
        && Number.isFinite(report.distance_m) && report.distance_m >= 0)));
}

export function municipalReportDate(value, lang) {
  // Provider timestamps are local. Keep their calendar date regardless of browser timezone.
  const date = new Date(`${String(value || "").slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "ro-MD", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  }).format(date);
}

export function municipalSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "eu.chisinau.md" ? url.href : null;
  } catch {
    return null;
  }
}
