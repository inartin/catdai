import crypto from "node:crypto";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { matchDistrict } from "@/lib/validation";

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
  "apartment_last_estimated_at",
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

const RESULT_TYPES = new Set(["no_data", "address_only", "apartment_only", "full_data"]);
const LOOKUP_SOURCES = new Set(["api", "local"]);

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, maxLength = 500) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const trimmed = String(value).replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function normalizeLookupSource(value) {
  const source = cleanText(value, 20);
  return LOOKUP_SOURCES.has(source) ? source : null;
}

function normalizeResultType(value) {
  const resultType = cleanText(value, 40);
  return RESULT_TYPES.has(resultType) ? resultType : "address_only";
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeInteger(value) {
  const parsed = normalizeNumber(value);
  if (parsed == null) return null;
  return Number.isInteger(parsed) ? parsed : Math.trunc(parsed);
}

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[șş]/gi, (match) => (match === match.toUpperCase() ? "S" : "s"))
    .replace(/[țţ]/gi, (match) => (match === match.toUpperCase() ? "T" : "t"));
}

export function normalizeCadastruAddressForDb(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[.,;:()]/g, " ")
    .replace(/\bmunicipiul\b/g, "mun")
    .replace(/\bsectorul\b/g, "sect")
    .replace(/\bbulevardul\b|\bbulevard\b|\bbd\b|\bbul\b|\bb-dul\b/g, "bd")
    .replace(/\bstrada\b|\bstr\b/g, "str")
    .replace(/\bapartamentul\b|\bapartament\b|\bapt\b|\bap\b/g, "ap")
    .replace(/\s+/g, " ")
    .trim();
}

function cadastralDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function stableStringify(value) {
  if (!isObject(value) && !Array.isArray(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function hashPayload(payload) {
  return crypto.createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function isMissingSchemaError(error) {
  const code = String(error?.code || "");
  return code === "42P01" || code === "42703" || code === "PGRST204";
}

function logDbError(label, error) {
  if (!error || isMissingSchemaError(error)) return;
  console.error(`[cadastru-records] ${label}:`, error.message || String(error));
}

function isCadastruDbEnabled() {
  return shouldPersistRuntimeData();
}

function clonePayloadForStorage(payload) {
  if (!isObject(payload)) return {};
  const clone = { ...payload };
  delete clone.access_tier;
  delete clone.locked_sections;
  return clone;
}

function detectAddressLanguage(value) {
  if (/[А-Яа-яЁё]/.test(String(value || ""))) return "ru";
  if (cleanText(value)) return "ro";
  return "unknown";
}

function getApartmentData(payload) {
  return isObject(payload?.apartment) ? payload.apartment : {};
}

function getBuildingData(payload) {
  return isObject(payload?.building) ? payload.building : {};
}

function getLocationData(payload) {
  return isObject(payload?.location) ? payload.location : {};
}

function getFormFields(payload) {
  return isObject(payload?.form_fields) ? payload.form_fields : {};
}

function resolveFullAddress(payload, requestAddress) {
  const apartment = getApartmentData(payload);
  const building = getBuildingData(payload);
  const location = getLocationData(payload);
  return (
    cleanText(apartment.address, 1000) ||
    cleanText(building.address, 1000) ||
    cleanText(payload?.matched_address, 1000) ||
    cleanText(requestAddress, 1000) ||
    cleanText(location.display_name, 1000) ||
    cleanText(payload?.building_address, 1000) ||
    null
  );
}

function resolveCityFromAddress(address) {
  const value = stripDiacritics(address);
  if (/mun\.?\s*chisinau|chi[sș]in[aă]u|kishinev|кишин[еэ]у/i.test(value)) return "Chișinău";
  if (/mun\.?\s*balti|b[aă]l[tț]i|beltsy|бельцы/i.test(value)) return "Bălți";
  return null;
}

function resolveRegionFromAddress(address) {
  const city = resolveCityFromAddress(address);
  if (city === "Chișinău") return "mun. Chișinău";
  if (city === "Bălți") return "mun. Bălți";
  return null;
}

function resolveDistrictFromAddress(address) {
  const match = String(address || "").match(/sect\.?\s*([^,\s][^,]*?)(?:\s+(?:str|bd|sos|al)\b|,|$)/i);
  if (!match) return null;
  return matchDistrict(match[1].trim());
}

function resolveDistrictFromLocation(location) {
  const suburb = cleanText(location?.suburb, 100);
  if (!suburb) return null;
  return matchDistrict(
    suburb
      .replace(/\s*Sector\s*$/i, "")
      .replace(/^sectorul\s*/i, "")
      .replace(/^sect\.\s*/i, "")
      .trim()
  );
}

function parseAddressParts(address) {
  const value = cleanText(address, 1000);
  if (!value) return {};

  const streetMatch = value.match(
    /(?:^|[\s,])((?:str(?:ada)?|bd|bulevard(?:ul)?|sos|șos|al|ул|улица|пр|проспект)\.?\s+[^,\d]+?)[,\s]+(\d+[a-zA-Z]?(?:\/\d+[a-zA-Z]?)?)(?:\s*(?:ap\.?|apartament(?:ul)?|apt|кв\.?|квартира)\s*([0-9a-zA-Z/-]+))?/i
  );

  if (!streetMatch) return {};

  return {
    street: cleanText(streetMatch[1], 200),
    houseNumber: cleanText(streetMatch[2], 40),
    apartmentNumber: cleanText(streetMatch[3], 40),
  };
}

function normalizeStreetPart(value) {
  return normalizeCadastruAddressForDb(value)
    .replace(/\bmun\b|\bsect\b|\bstr\b|\bbd\b|\bsos\b|\bal\b|\bap\b/g, " ")
    .replace(/\d+[a-z]?(?:\/\d+[a-z]?)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberMatchesAddress(normalizedAddress, value) {
  const normalized = cleanText(value, 40);
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i").test(normalizedAddress);
}

function recordMatchesStructuredAddress(row, normalizedAddress, structuredAddress = {}) {
  const houseNumber = cleanText(structuredAddress.houseNumber, 40);
  const apartmentNumber = cleanText(structuredAddress.apartmentNumber, 40);
  const requestedStreet = normalizeStreetPart(structuredAddress.street);
  const recordStreet = normalizeStreetPart(row.street);
  const addressText = normalizeCadastruAddressForDb(
    [row.full_address, row.address_ro, row.address_ru].filter(Boolean).join(" ")
  );

  if (houseNumber) {
    const recordHouse = cleanText(row.house_number, 40);
    if (recordHouse && recordHouse !== houseNumber) return false;
    if (!recordHouse && !numberMatchesAddress(addressText, houseNumber)) return false;
  }

  if (apartmentNumber) {
    const recordApartment = cleanText(row.apartment_number, 40);
    if (recordApartment && recordApartment !== apartmentNumber) return false;
    if (!recordApartment && !numberMatchesAddress(addressText, apartmentNumber)) return false;
  }

  if (!requestedStreet) return addressText === normalizedAddress || Boolean(houseNumber || apartmentNumber);
  if (recordStreet && (recordStreet.includes(requestedStreet) || requestedStreet.includes(recordStreet))) return true;
  return requestedStreet
    .split(" ")
    .filter((token) => token.length > 1)
    .every((token) => addressText.includes(token));
}

function sameStructuredAddressIsUnique(rows, structuredAddress = {}) {
  return rows.length === 1 && cleanText(structuredAddress.houseNumber, 40) && cleanText(structuredAddress.apartmentNumber, 40);
}

function classifyCadastruPayload(payload) {
  return hasDetailedPayload(payload) ? classifyDetailedCadastruPayload(payload) : "address_only";
}

function hasDetailedPayload(payload) {
  const apartment = getApartmentData(payload);
  const building = getBuildingData(payload);
  const hasApartment = Boolean(
    apartment.area_m2 ||
      apartment.floor ||
      apartment.toilet ||
      apartment.bathroom ||
      apartment.is_last_floor ||
      apartment.estimated_value_lei ||
      apartment.type ||
      apartment.destination ||
      apartment.last_estimated_at ||
      apartment.ownership_type ||
      apartment.real_rights ||
      apartment.notes ||
      apartment.restrictions
  );
  const hasBuilding = Boolean(
    building.classifier ||
      building.total_floors ||
      building.condition ||
      building.construction_year ||
      building.wall_material ||
      building.water ||
      building.sewage ||
      building.gas ||
      building.electricity
  );
  return hasApartment || hasBuilding;
}

function classifyDetailedCadastruPayload(payload) {
  const apartment = getApartmentData(payload);
  const building = getBuildingData(payload);
  const hasApartment = Boolean(
    apartment.area_m2 ||
      apartment.floor ||
      apartment.toilet ||
      apartment.bathroom ||
      apartment.is_last_floor ||
      apartment.estimated_value_lei ||
      apartment.type ||
      apartment.destination ||
      apartment.last_estimated_at ||
      apartment.ownership_type ||
      apartment.real_rights ||
      apartment.notes ||
      apartment.restrictions
  );
  const hasBuilding = Boolean(
    building.classifier ||
      building.total_floors ||
      building.condition ||
      building.construction_year ||
      building.wall_material ||
      building.water ||
      building.sewage ||
      building.gas ||
      building.electricity
  );

  if (hasApartment && hasBuilding) return "full_data";
  if (hasApartment) return "apartment_only";
  return "address_only";
}

function buildRecordRow(payload, options = {}, existing = null) {
  const storagePayload = clonePayloadForStorage(payload);
  const apartment = getApartmentData(storagePayload);
  const building = getBuildingData(storagePayload);
  const location = getLocationData(storagePayload);
  const formFields = getFormFields(storagePayload);
  const fullAddress = resolveFullAddress(storagePayload, options.requestAddress);
  const cadastralNumber = cleanText(storagePayload.cadastral_number || options.cadastralNumber, 80);

  if (!cadastralNumber || !fullAddress) return null;

  const city = cleanText(
    options.structuredAddress?.city ||
      formFields.city ||
      location.city ||
      resolveCityFromAddress(fullAddress),
    120
  );
  const region = cleanText(options.structuredAddress?.region || location.region || resolveRegionFromAddress(fullAddress), 120);
  const district = cleanText(
    options.structuredAddress?.district ||
      formFields.district ||
      resolveDistrictFromAddress(fullAddress) ||
      resolveDistrictFromLocation(location),
    120
  );
  const payloadHash = hashPayload(storagePayload);
  const now = new Date().toISOString();
  const language = detectAddressLanguage(fullAddress);
  const requestAddress = cleanText(options.requestAddress, 1000);
  const requestLanguage = detectAddressLanguage(requestAddress);
  const parsedAddress = parseAddressParts(fullAddress);
  const parsedRequestAddress = parseAddressParts(requestAddress);
  const resolvedStreet = cleanText(options.structuredAddress?.street, 200) || parsedAddress.street || parsedRequestAddress.street;
  const resolvedHouseNumber = cleanText(options.structuredAddress?.houseNumber, 40) || parsedAddress.houseNumber || parsedRequestAddress.houseNumber;
  const resolvedApartmentNumber =
    cleanText(options.structuredAddress?.apartmentNumber, 40) || parsedAddress.apartmentNumber || parsedRequestAddress.apartmentNumber;
  const addressRo = language === "ro" ? fullAddress : requestLanguage === "ro" ? requestAddress : existing?.address_ro || null;
  const addressRu = language === "ru" ? fullAddress : requestLanguage === "ru" ? requestAddress : existing?.address_ru || null;

  return {
    cadastral_number: cadastralNumber,
    official_cadastral_number: cleanText(storagePayload.official_cadastral_number, 80),
    raw_cadastral_number: cleanText(storagePayload.raw_cadastral_number, 80),
    building_cadastral_number: cleanText(storagePayload.building_cadastral_number, 80),
    full_address: fullAddress,
    address_ro: addressRo,
    address_ru: addressRu,
    city: city || existing?.city || null,
    region: region || existing?.region || null,
    district: district || existing?.district || null,
    street: resolvedStreet || existing?.street || null,
    house_number: resolvedHouseNumber || existing?.house_number || null,
    apartment_number: resolvedApartmentNumber || existing?.apartment_number || null,
    result_type: normalizeResultType(options.resultType || classifyCadastruPayload(storagePayload)),
    lookup_source: normalizeLookupSource(options.lookupSource),
    source: cleanText(storagePayload.source, 80),
    partial: normalizeBoolean(storagePayload.partial),
    apartment_area_m2: normalizeNumber(apartment.area_m2 ?? storagePayload.apartment_area_m2),
    apartment_floor: normalizeInteger(apartment.floor ?? storagePayload.apartment_floor),
    apartment_estimated_value_lei: normalizeNumber(apartment.estimated_value_lei ?? storagePayload.estimated_value_lei),
    apartment_last_estimated_at: cleanText(apartment.last_estimated_at, 80),
    building_total_floors: normalizeInteger(building.total_floors),
    building_construction_year: normalizeInteger(building.construction_year),
    apartment_data: apartment,
    building_data: building,
    location_data: location,
    form_fields: formFields,
    raw_payload: storagePayload,
    payload_hash: payloadHash,
    data_updated_at: existing?.payload_hash && existing.payload_hash === payloadHash ? existing.data_updated_at : now,
    last_official_fetch_at: options.officialFetch ? now : existing?.last_official_fetch_at || null,
  };
}

async function findRecordByColumn(column, value) {
  if (!value) return null;
  const { data, error } = await supabaseAdmin
    .from("cadastru_records")
    .select(RECORD_COLUMNS)
    .eq(column, value)
    .limit(1);

  if (error) {
    logDbError(`record lookup by ${column} failed`, error);
    return null;
  }

  return data?.[0] || null;
}

async function findRecordByNumber(cadastralNumber) {
  const number = cleanText(cadastralNumber, 80);
  if (!number) return null;
  const exact = await findRecordByColumn("cadastral_number", number);
  if (exact) return exact;
  const digits = cadastralDigits(number);
  return digits ? findRecordByColumn("cadastral_number_digits", digits) : null;
}

function hydratePayloadFromRecord(row) {
  const payload = isObject(row?.raw_payload) ? { ...row.raw_payload } : {};
  const apartment = isObject(payload.apartment) ? payload.apartment : {};
  const building = isObject(payload.building) ? payload.building : {};

  return {
    ...payload,
    cadastral_number: payload.cadastral_number || row.cadastral_number,
    official_cadastral_number: payload.official_cadastral_number || row.official_cadastral_number || undefined,
    raw_cadastral_number: payload.raw_cadastral_number || row.raw_cadastral_number || undefined,
    building_cadastral_number: payload.building_cadastral_number || row.building_cadastral_number || undefined,
    building: Object.keys(building).length ? building : row.building_data || {},
    apartment: Object.keys(apartment).length ? apartment : row.apartment_data || {},
    location: isObject(payload.location) ? payload.location : row.location_data || {},
    form_fields: isObject(payload.form_fields) ? payload.form_fields : row.form_fields || {},
    matched_address: payload.matched_address || row.full_address,
    partial: payload.partial ?? row.partial,
  };
}

function isAddressResolverOnlyRecord(row) {
  const payload = isObject(row?.raw_payload) ? row.raw_payload : {};
  return payload.method === "address" && !hasDetailedPayload(payload);
}

export async function persistCadastruRecord(payload, options = {}) {
  if (!isCadastruDbEnabled()) return null;

  try {
    const existing = await findRecordByNumber(payload?.cadastral_number || options.cadastralNumber);
    const row = buildRecordRow(payload, options, existing);
    if (!row) return null;

    const now = new Date().toISOString();
    const countLookup = options.countLookup !== false;
    const shouldKeepExistingDetail = existing && hasDetailedPayload(existing.raw_payload) && !hasDetailedPayload(row.raw_payload);
    let record = existing;

    if (existing) {
      const updateRow = shouldKeepExistingDetail
        ? {
            ...row,
            full_address: existing.full_address || row.full_address,
            address_ro: existing.address_ro || row.address_ro,
            address_ru: existing.address_ru || row.address_ru,
            city: existing.city || row.city,
            region: existing.region || row.region,
            district: existing.district || row.district,
            result_type: existing.result_type,
            source: existing.source,
            partial: existing.partial,
            apartment_area_m2: existing.apartment_area_m2,
            apartment_floor: existing.apartment_floor,
            apartment_estimated_value_lei: existing.apartment_estimated_value_lei,
            apartment_last_estimated_at: existing.apartment_last_estimated_at,
            building_total_floors: existing.building_total_floors,
            building_construction_year: existing.building_construction_year,
            apartment_data: existing.apartment_data || {},
            building_data: existing.building_data || {},
            location_data: existing.location_data || {},
            form_fields: existing.form_fields || {},
            raw_payload: existing.raw_payload || {},
            payload_hash: existing.payload_hash,
            data_updated_at: existing.data_updated_at,
            last_official_fetch_at: existing.last_official_fetch_at,
          }
        : row;
      const { data, error } = await supabaseAdmin
        .from("cadastru_records")
        .update({
          ...updateRow,
          lookup_count: Math.max(0, Number(existing.lookup_count) || 0) + (countLookup ? 1 : 0),
          last_used_at: countLookup ? now : existing.last_used_at || now,
        })
        .eq("id", existing.id)
        .select(RECORD_COLUMNS)
        .limit(1);
      logDbError("record update failed", error);
      record = data?.[0] || existing;
    } else {
      const { data, error } = await supabaseAdmin
        .from("cadastru_records")
        .insert({
          ...row,
          lookup_count: countLookup ? 1 : 0,
          last_used_at: now,
        })
        .select(RECORD_COLUMNS)
        .limit(1);
      logDbError("record insert failed", error);
      record = data?.[0] || null;
    }

    return record ? hydratePayloadFromRecord(record) : null;
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      console.error("[cadastru-records] persist failed:", error?.message || String(error));
    }
    return null;
  }
}

export async function getCadastruRecordByNumber(cadastralNumber, options = {}) {
  if (!isCadastruDbEnabled()) return null;

  try {
    const row = await findRecordByNumber(cadastralNumber);
    if (!row) return null;
    if (options.requireDetailPayload && isAddressResolverOnlyRecord(row)) return null;

    return {
      payload: hydratePayloadFromRecord(row),
      lookupSource: normalizeLookupSource(row.lookup_source),
      resultType: normalizeResultType(row.result_type),
    };
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      console.error("[cadastru-records] number lookup failed:", error?.message || String(error));
    }
    return null;
  }
}

export async function getCadastruRecordByAddress(rawAddress, options = {}) {
  if (!isCadastruDbEnabled()) return null;

  try {
    const normalized = normalizeCadastruAddressForDb(rawAddress);
    if (!normalized) return null;

    const structuredAddress = options.structuredAddress || {};
    const queryHouse = cleanText(structuredAddress.houseNumber, 40);
    const queryApartment = cleanText(structuredAddress.apartmentNumber, 40);
    const queryCity = cleanText(structuredAddress.city, 120);

    let query = supabaseAdmin.from("cadastru_records").select(RECORD_COLUMNS).limit(50);
    if (queryCity) query = query.eq("city", queryCity);
    if (queryHouse) query = query.eq("house_number", queryHouse);
    if (queryApartment) query = query.eq("apartment_number", queryApartment);

    const { data: exactRows, error: exactError } = await query;
    if (exactError) {
      logDbError("structured address lookup failed", exactError);
      return null;
    }

    let row = (exactRows || []).find((candidate) =>
      recordMatchesStructuredAddress(candidate, normalized, structuredAddress)
    );
    if (!row && sameStructuredAddressIsUnique(exactRows || [], structuredAddress)) {
      row = exactRows[0];
    }

    if (!row && queryHouse) {
      const { data: broadRows, error: broadError } = await supabaseAdmin
        .from("cadastru_records")
        .select(RECORD_COLUMNS)
        .ilike("full_address", `%${queryHouse}%`)
        .limit(100);

      if (broadError) {
        logDbError("broad address lookup failed", broadError);
        return null;
      }

      row = (broadRows || []).find((candidate) =>
        recordMatchesStructuredAddress(candidate, normalized, structuredAddress)
      );
    }

    if (!row) return null;

    return {
      payload: hydratePayloadFromRecord(row),
      lookupSource: normalizeLookupSource(row.lookup_source),
      resultType: normalizeResultType(row.result_type),
    };
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      console.error("[cadastru-records] address lookup failed:", error?.message || String(error));
    }
    return null;
  }
}
