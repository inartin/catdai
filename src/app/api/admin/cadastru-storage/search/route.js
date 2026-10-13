import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getCadastruRecordByNumber,
  getCadastruRecordByAddress,
  normalizeCadastruAddressForDb,
  recordMatchesStructuredAddress,
} from "@/lib/cadastru-records";
import { isFreshCadastru, cleanCadastruPayload } from "@/lib/cadastru-cache";
import { resolveStreet } from "@/lib/cadastru-streets/street-resolver";
import { resolveCadastruSupportedCity } from "@/lib/cadastru-supported-cities";
import { nearbyAddressFromCadastru, validNearbyResult } from "@/lib/cadastru-nearby";
import { getStoredNearby, nearbyFromStorage } from "@/lib/cadastru-nearby-storage";
import { publicTransportInputFromCadastru, validPublicTransportResult } from "@/lib/cadastru-public-transport";
import { getStoredPublicTransport, publicTransportFromStorage } from "@/lib/cadastru-public-transport-storage";
import { validMunicipalReportsResult } from "@/lib/cadastru-municipal-reports";
import { CADASTRAL_RE } from "@/lib/validation";

const RECORD_COLUMNS = [
  "id",
  "cadastral_number",
  "official_cadastral_number",
  "raw_cadastral_number",
  "building_cadastral_number",
  "full_address",
  "address_ro",
  "address_ru",
  "city",
  "region",
  "district",
  "street",
  "house_number",
  "apartment_number",
  "result_type",
  "lookup_source",
  "source",
  "partial",
  "apartment_area_m2",
  "apartment_floor",
  "apartment_estimated_value_lei",
  "building_total_floors",
  "building_construction_year",
  "apartment_data",
  "building_data",
  "location_data",
  "form_fields",
  "raw_payload",
  "payload_hash",
  "lookup_count",
  "saved_at",
  "updated_at",
  "data_updated_at",
  "last_used_at",
  "last_official_fetch_at",
  "next_refresh_after",
].join(", ");

function normalizeSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeRoadType(value) {
  if (value === "bulevard") return "bd";
  if (value === "str-la") return "str-la";
  return "str";
}

function displayRoadType(value) {
  if (value === "bulevard") return "Bulevard";
  if (value === "str-la") return "Str-la";
  return "Strada";
}

function buildStructuredAddress({ city, roadType, street, houseNumber, apartmentNumber }) {
  return {
    city,
    region: city === "Chișinău" ? "mun. Chișinău" : null,
    street: normalizeSpaces(`${displayRoadType(roadType)} ${street}`),
    houseNumber,
    apartmentNumber,
  };
}

function formatLookupAddress(address) {
  if (!address?.city || !address?.street || !address?.house_number) return "";
  const road = displayRoadType(address.road_type);
  const apt = address.apartment_number ? ` ap ${address.apartment_number}` : "";
  return `${address.city}, ${road} ${address.street} ${address.house_number}${apt}`;
}

export async function POST(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cadastralNumber = typeof body?.cadastral_number === "string" ? body.cadastral_number.trim() : "";
  const rawCity = typeof body?.city === "string" ? normalizeSpaces(body.city) : "Chișinău";
  const city = resolveCadastruSupportedCity(rawCity) || rawCity;
  const roadType = normalizeRoadType(body?.road_type);
  const street = typeof body?.street === "string" ? normalizeSpaces(body.street) : "";
  const houseNumber = typeof body?.house_number === "string" ? normalizeSpaces(body.house_number) : "";
  const apartmentNumber = typeof body?.apartment_number === "string" ? normalizeSpaces(body.apartment_number) : "";

  let entry = null;
  let searchMode = "";
  let formattedSearchAddress = "";
  let availableUnits = [];

  // =========================================================================
  // 1. Cadastral Number Search (Cache & Database Only - Strictly No External)
  // =========================================================================
  if (cadastralNumber) {
    searchMode = "number";
    if (!CADASTRAL_RE.test(cadastralNumber)) {
      return NextResponse.json(
        { error: "invalid_format", message: "Formatul numărului cadastral este invalid." },
        { status: 400 }
      );
    }

    entry = await getCadastruRecordByNumber(cadastralNumber, { allowExpired: true, requireDetailPayload: false });

    // Fallback: Check alias table directly if not in records by exact number
    if (!entry) {
      try {
        const { data: aliasData } = await supabaseAdmin
          .from("cadastru_address_aliases")
          .select("raw_payload, lookup_source, expires_at")
          .eq("cadastral_number", cadastralNumber)
          .limit(1);

        const alias = aliasData?.[0];
        if (alias?.raw_payload) {
          entry = {
            payload: alias.raw_payload,
            lookupSource: alias.lookup_source || "alias",
            expiresAt: alias.expires_at,
          };
        }
      } catch (err) {
        console.error("[admin-cadastru-search] alias lookup error:", err?.message);
      }
    }
  }

  // =========================================================================
  // 2. Address Search (Cache & Database Only - Strictly No External)
  // =========================================================================
  else if (street && houseNumber) {
    searchMode = "address";
    const resolution = resolveStreet(city, roadType, street);
    const resolvedStreetName = resolution?.street || street;

    const structuredAddress = buildStructuredAddress({
      city,
      roadType: body?.road_type,
      street: resolvedStreetName,
      houseNumber,
      apartmentNumber,
    });

    formattedSearchAddress = formatLookupAddress({
      city,
      road_type: body?.road_type,
      street: resolvedStreetName,
      house_number: houseNumber,
      apartment_number: apartmentNumber,
    });

    entry = await getCadastruRecordByAddress(formattedSearchAddress, {
      structuredAddress,
      allowExpired: true,
    });

    // Enhanced local DB fallback: if not matched through alias or strict single apartment,
    // inspect all stored cadastru_records for this street and house number.
    if (!entry) {
      try {
        const normalizedSearch = normalizeCadastruAddressForDb(formattedSearchAddress);
        let query = supabaseAdmin
          .from("cadastru_records")
          .select(RECORD_COLUMNS)
          .eq("city", city)
          .eq("house_number", houseNumber);

        if (apartmentNumber) {
          query = query.eq("apartment_number", apartmentNumber);
        }

        const { data: rows } = await query.limit(50);
        const matches = (rows || []).filter((row) =>
          recordMatchesStructuredAddress(row, normalizedSearch, structuredAddress)
        );

        if (matches.length > 0) {
          const match = matches[0];
          entry = {
            payload: match.raw_payload || {
              cadastral_number: match.cadastral_number,
              apartment: match.apartment_data || {},
              building: match.building_data || {},
              location: match.location_data || {},
              form_fields: match.form_fields || {},
              matched_address: match.full_address,
              partial: match.partial,
            },
            lookupSource: match.lookup_source || "database",
            expiresAt: match.next_refresh_after,
            savedAt: match.saved_at,
            lastOfficialFetchAt: match.last_official_fetch_at,
            lookupCount: match.lookup_count,
          };
        } else if (!apartmentNumber) {
          // If searching without apartment, find any units in that building to list them
          const { data: buildingRows } = await supabaseAdmin
            .from("cadastru_records")
            .select("cadastral_number, apartment_number, full_address")
            .eq("city", city)
            .eq("house_number", houseNumber)
            .limit(20);

          if (buildingRows?.length) {
            availableUnits = buildingRows.map((row) => ({
              apartment_number: row.apartment_number,
              cadastral_number: row.cadastral_number,
              full_address: row.full_address,
            }));
          }
        }
      } catch (err) {
        console.error("[admin-cadastru-search] address fallback lookup error:", err?.message);
      }
    }
  } else {
    return NextResponse.json(
      { error: "missing_fields", message: "Introduceți un număr cadastral sau strada și numărul casei." },
      { status: 400 }
    );
  }

  // =========================================================================
  // 3. Fetch Local Secondary Data (Nearby & Transport - Strictly No External)
  // =========================================================================
  const cadastralPayload = entry?.payload ? cleanCadastruPayload(entry.payload) : null;

  const nearbyInput = cadastralPayload
    ? nearbyAddressFromCadastru(cadastralPayload)
    : (street && houseNumber ? {
        city,
        road_type: body?.road_type === "bulevard" ? "bulevard" : body?.road_type === "str-la" ? "str-la" : "strada",
        street,
        house_number: houseNumber,
      } : null);

  let nearbyData = null;
  if (nearbyInput) {
    try {
      const stored = await getStoredNearby(nearbyInput);
      if (stored) {
        nearbyData = nearbyFromStorage(stored);
      } else if (validNearbyResult(cadastralPayload?.nearby)) {
        nearbyData = cadastralPayload.nearby;
      }
    } catch (err) {
      console.error("[admin-cadastru-search] stored nearby error:", err?.message);
    }
  }

  const transportInput = cadastralPayload
    ? (publicTransportInputFromCadastru(cadastralPayload) || nearbyInput)
    : nearbyInput;

  let transportData = null;
  if (transportInput) {
    try {
      const stored = await getStoredPublicTransport(transportInput);
      if (stored) {
        transportData = publicTransportFromStorage(stored);
      } else if (validPublicTransportResult(cadastralPayload?.public_transport)) {
        transportData = cadastralPayload.public_transport;
      }
    } catch (err) {
      console.error("[admin-cadastru-search] stored transport error:", err?.message);
    }
  }

  let municipalReportsData = null;
  if (validMunicipalReportsResult(cadastralPayload?.municipal_reports)) {
    municipalReportsData = cadastralPayload.municipal_reports;
  }

  // =========================================================================
  // 4. Build Response
  // =========================================================================
  if (cadastralPayload) {
    const unlockedCadastral = {
      ...cadastralPayload,
      access_tier: "admin",
      locked_sections: {},
    };

    return NextResponse.json({
      ok: true,
      cadastral: unlockedCadastral,
      nearby: nearbyData,
      public_transport: transportData,
      municipal_reports: municipalReportsData,
      search_mode: searchMode,
      storage_info: {
        found: true,
        source: entry.lookupSource || "database",
        is_fresh: isFreshCadastru(entry.expiresAt),
        expires_at: entry.expiresAt || null,
        saved_at: entry.savedAt || null,
        last_official_fetch_at: entry.lastOfficialFetchAt || null,
        lookup_count: entry.lookupCount || 0,
        external_api_called: false,
      },
      available_units: availableUnits,
    });
  }

  // Not found in cadastru_records, but maybe secondary data (nearby/transport) exists
  if (nearbyData || transportData) {
    return NextResponse.json({
      ok: false,
      error: "cadastral_not_found",
      message: "Datele cadastrale specifice nu sunt salvate local, dar există date locale de zonă/transport.",
      fallback_address: formattedSearchAddress,
      nearby: nearbyData,
      public_transport: transportData,
      municipal_reports: null,
      search_mode: searchMode,
      storage_info: {
        found: false,
        source: null,
        external_api_called: false,
      },
      available_units: availableUnits,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "not_found",
      message: "Nu s-au găsit date locale în cache sau în baza de date pentru această căutare.",
      external_api_called: false,
      search_mode: searchMode,
      available_units: availableUnits,
    },
    { status: 404 }
  );
}
