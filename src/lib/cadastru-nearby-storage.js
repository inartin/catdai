import { createCadastruLocationStore } from "@/lib/cadastru-location-storage";
import { validNearbyResult } from "@/lib/cadastru-nearby";

const storage = createCadastruLocationStore({ name: "nearby", table: "cadastru_nearby", isValid: validNearbyResult });

export const getStoredNearby = storage.get;
export const storeNearby = storage.store;
export const nearbyFromStorage = storage.toResponse;
