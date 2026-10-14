import { createCadastruLocationStore } from "@/lib/cadastru-location-storage";
import { validMunicipalReportsResult } from "@/lib/cadastru-municipal-reports";

const storage = createCadastruLocationStore({
  name: "municipal-reports", table: "cadastru_municipal_reports", ttlSeconds: 72 * 3600,
  isValid: (data) => validMunicipalReportsResult(data) && !data.cache?.stale,
});

export const getStoredMunicipalReports = storage.get;
export const municipalReportsFromStorage = storage.toResponse;
export function storeMunicipalReports(input, payload) {
  // Preserve the worker's source fetch time; viewing reports never renews their age.
  return storage.store(input, payload, { fetchedAt: payload.cache.fetched_at });
}
