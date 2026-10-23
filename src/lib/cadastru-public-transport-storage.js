import { createCadastruLocationStore, cadastruLocationOriginKey } from "@/lib/cadastru-location-storage";
import { validPublicTransportResult } from "@/lib/cadastru-public-transport";
import { CADASTRU_TRANSPORT_TTL_SECONDS } from "@/lib/cadastru-cache";

const storage = createCadastruLocationStore({
  name: "public-transport", table: "cadastru_public_transport", isValid: validPublicTransportResult,
  ttlSeconds: CADASTRU_TRANSPORT_TTL_SECONDS,
});

export const publicTransportOriginKey = cadastruLocationOriginKey;
export const getStoredPublicTransport = storage.get;
export const storePublicTransport = storage.store;
export const publicTransportFromStorage = storage.toResponse;
