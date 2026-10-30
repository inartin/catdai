import { NextResponse } from "next/server";
import { logCadastruSearchEvent } from "@/lib/cadastru-search-events";
import { resolveCadastruSupportedCity } from "@/lib/cadastru-supported-cities";

import { validateCadastralNumber } from "@/lib/validation";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();

// Include failures after cache retrieval/credit authorization in search statistics.
export function withCadastruOutcome(handler) {
  return async function POST(request) {
    const body = await request.clone().json().catch(() => null);
    let response;
    try {
      response = await handler(request);
    } catch (error) {
      console.error("[cadastru] request failed:", error);
      response = NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    if (response.status >= 500 && body?.search_context === "cadastru") {
      const address = !body.cadastral_number;
      const city = resolveCadastruSupportedCity(body.city || "Chișinău") || clean(body.city);
      const road = body.road_type === "bulevard" ? "bd" : body.road_type === "str-la" ? "str-la" : body.road_type === "sos" ? "sos" : "str";
      const apartment = /^\d{1,4}$/.test(clean(body.apartment_number)) ? String(Number(body.apartment_number)) : clean(body.apartment_number);
      await logCadastruSearchEvent(request, address ? "address" : "number", {
        lookupId: body.lookup_id,
        city: address ? city : null,
        searchAddress: address ? clean(`${city}, ${road} ${clean(body.street)} ${clean(body.house_number)}${apartment ? ` ap ${apartment}` : ""}`) : null,
        cadastralNumber: address ? null : validateCadastralNumber(body.cadastral_number).value || clean(body.cadastral_number),
        resultType: "error",
      });
    }
    return response;
  };
}
