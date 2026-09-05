import crypto from "node:crypto";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { matchDistrict } from "@/lib/validation";
import { resolveCadastruSupportedCity, resolveCadastruCityFromAddress } from "@/lib/cadastru-supported-cities";
import { cadastruExpiresAt, isFreshCadastru, cleanCadastruPayload, readCadastruCache, writeCadastruCache } from "@/lib/cadastru-cache";

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
    .replace(/(^|\s)(?:улица|ул)(?=\s|$)/g, "$1str")
    .replace(/(^|\s)(?:бульвар|бул|проспект|пр)(?=\s|$)/g, "$1bd")
    .replace(/(^|\s)(?:квартира|кв)(?=\s|$)/g, "$1ap")
    .replace(/кишин[еэ](?:в|у)/g, "chisinau")
    .replace(/бельцы/g, "balti")
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

const clonePayloadForStorage = cleanCadastruPayload;

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
    cleanText(payload?.address, 1000) ||
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
  const supportedCity = resolveCadastruCityFromAddress(address);
  if (supportedCity) return supportedCity;
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
    /(?:^|[\s,])((?:str(?:ada)?|bd|bulevard(?:ul)?|sos|șos|al|ул|улица|пр|проспект)\.?\s+[^,]+?)[,\s]+(\d+[a-zA-Z]?(?:\/\d+[a-zA-Z]?)?)(?:[\s,]*(?:ap\.?|apartament(?:ul)?|apt|кв\.?|квартира)\s*([0-9a-zA-Z/-]+))?(?=\s*(?:,|$))/i
  );

  if (!streetMatch) return {};

  return {
    street: cleanText(streetMatch[1], 200),
    houseNumber: cleanText(streetMatch[2], 40),
    apartmentNumber: cleanText(streetMatch[3], 40),
  };
}

function normalizeStreetPart(value) {
  return normalizeCadastruAddressForDb(value);
}

export function recordMatchesStructuredAddress(row, normalizedAddress, structuredAddress = {}) {
  const requestedCity = resolveCadastruSupportedCity(structuredAddress.city) || structuredAddress.city;
  const recordCity = resolveCadastruSupportedCity(row.city) || row.city || resolveCityFromAddress(row.full_address);
  if (!requestedCity || !recordCity || requestedCity !== recordCity) return false;
  const parsed = parseAddressParts(row.full_address);
  const house = cleanText(row.house_number || parsed.houseNumber, 40);
  const apartment = cleanText(row.apartment_number || parsed.apartmentNumber, 40);
  if (house !== cleanText(structuredAddress.houseNumber, 40)) return false;
  if (apartment !== cleanText(structuredAddress.apartmentNumber, 40)) return false;
  const street = normalizeStreetPart(structuredAddress.street);
  const streets = [row.street, parsed.street, parseAddressParts(row.address_ro).street, parseAddressParts(row.address_ru).street];
  return street ? streets.some((value) => normalizeStreetPart(value) === street)
    : [row.full_address, row.address_ro, row.address_ru].some((value) => normalizeCadastruAddressForDb(value) === normalizedAddress);
}

function recordExpiry(row) {
  return row.next_refresh_after || cadastruExpiresAt(row.last_official_fetch_at || row.data_updated_at || row.saved_at);
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
      apartment.object_type ||
      apartment.type ||
      apartment.destination ||
      apartment.room_usage ||
      apartment.ownership_type ||
      apartment.transactions_count ||
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
      apartment.object_type ||
      apartment.type ||
      apartment.destination ||
      apartment.room_usage ||
      apartment.ownership_type ||
      apartment.transactions_count ||
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

  if (!cadastralNumber) return null;

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
    next_refresh_after: options.officialFetch ? cadastruExpiresAt(now) : existing ? recordExpiry(existing) : options.expiresAt || cadastruExpiresAt(now),
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
  if (isObject(row?.raw_payload) && Object.keys(row.raw_payload).length) return cleanCadastruPayload(row.raw_payload);
  return {
    cadastral_number: row.cadastral_number,
    apartment: row.apartment_data || {},
    building: row.building_data || {},
    location: row.location_data || {},
    form_fields: row.form_fields || {},
    matched_address: row.full_address,
    partial: row.partial,
  };
}

function isAddressResolverOnlyRecord(row) {
  const payload = isObject(row?.raw_payload) ? row.raw_payload : {};
  return payload.method === "address" && !hasDetailedPayload(payload) && !payload.lands?.length && !payload.buildings?.length;
}

export async function persistCadastruRecord(payload, options = {}) {
  if (!isCadastruDbEnabled()) return null;

  try {
    const existing = await findRecordByNumber(payload?.cadastral_number || options.cadastralNumber);
    const row = buildRecordRow(payload, options, existing);
    if (!row) return null;

    const now = new Date().toISOString();
    const countLookup = options.countLookup !== false;
    const shouldKeepExistingDetail = existing && isFreshCadastru(recordExpiry(existing)) && row.raw_payload.method === "address" && hasDetailedPayload(existing.raw_payload) && !hasDetailedPayload(row.raw_payload);
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
            next_refresh_after: recordExpiry(existing),
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

    if (!record) return null;
    const entry = recordEntry(record);
    await writeCadastruCache("number", record.cadastral_number, entry);
    if (!options.skipAddressAlias && payload.method !== "address" && record.cadastral_number.split(".").length === 4) {
      for (const address of [options.requestAddress, record.full_address, record.address_ro, record.address_ru].filter(Boolean)) {
        if (!parseAddressParts(address).apartmentNumber) continue;
        await saveAddressAlias(address, entry);
      }
    }
    return entry.payload;
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      console.error("[cadastru-records] persist failed:", error?.message || String(error));
    }
    return null;
  }
}

function recordEntry(row) {
  return {
    payload: hydratePayloadFromRecord(row),
    lookupSource: normalizeLookupSource(row.lookup_source),
    resultType: normalizeResultType(row.result_type),
    expiresAt: recordExpiry(row),
  };
}

async function saveAddressAlias(address, entry) {
  const addressKey = normalizeCadastruAddressForDb(address);
  if (!addressKey || !isFreshCadastru(entry.expiresAt)) return;
  await writeCadastruCache("address", addressKey, entry);
  if (!isCadastruDbEnabled()) return;
  const { error } = await supabaseAdmin.from("cadastru_address_aliases").upsert({
    address_key: addressKey,
    cadastral_number: entry.payload.cadastral_number || null,
    raw_payload: cleanCadastruPayload(entry.payload),
    lookup_source: entry.lookupSource,
    expires_at: entry.expiresAt,
  }, { onConflict: "address_key" });
  logDbError("address alias save failed", error);
}

export async function getCadastruRecordByNumber(cadastralNumber, options = {}) {
  const cached = await readCadastruCache("number", cadastralNumber);
  if (cached && (!options.requireDetailPayload || !isAddressResolverOnlyRecord({ raw_payload: cached.payload }))) return cached;
  if (!isCadastruDbEnabled()) return null;
  try {
    const row = await findRecordByNumber(cadastralNumber);
    if (!row || !isFreshCadastru(recordExpiry(row))) return null;
    if (options.requireDetailPayload && isAddressResolverOnlyRecord(row)) return null;
    const entry = recordEntry(row);
    await writeCadastruCache("number", cadastralNumber, entry);
    return entry;
  } catch (error) {
    logDbError("number lookup failed", error);
    return null;
  }
}

async function resolveAddressEntry(entry) {
  if (!entry || !isFreshCadastru(entry.expiresAt)) return null;
  // Resolve single-property aliases through the same canonical record as number searches.
  if (entry.payload.cadastral_number) {
    return await getCadastruRecordByNumber(entry.payload.cadastral_number) || entry;
  }
  return entry;
}

export async function getCadastruRecordByAddress(rawAddress, options = {}) {
  const normalized = normalizeCadastruAddressForDb(rawAddress);
  if (!normalized) return null;
  const cached = await readCadastruCache("address", normalized);
  if (cached) return resolveAddressEntry(cached);
  if (!isCadastruDbEnabled()) return null;
  try {
    const { data: aliases, error: aliasError } = await supabaseAdmin.from("cadastru_address_aliases")
      .select("raw_payload, lookup_source, expires_at").eq("address_key", normalized).limit(1);
    logDbError("address alias lookup failed", aliasError);
    const alias = aliases?.[0];
    if (alias && isFreshCadastru(alias.expires_at)) {
      const entry = { payload: alias.raw_payload, lookupSource: alias.lookup_source, expiresAt: alias.expires_at };
      await writeCadastruCache("address", normalized, entry);
      return resolveAddressEntry(entry);
    }
    const structured = options.structuredAddress || {};
    if (!structured.city || !structured.houseNumber) return null;
    let query = supabaseAdmin.from("cadastru_records").select(RECORD_COLUMNS)
      .eq("city", structured.city).eq("house_number", structured.houseNumber);
    query = structured.apartmentNumber ? query.eq("apartment_number", structured.apartmentNumber) : query.is("apartment_number", null);
    const { data, error } = await query.limit(100);
    logDbError("structured address lookup failed", error);
    const matches = (data || []).filter((row) => isFreshCadastru(recordExpiry(row)) && recordMatchesStructuredAddress(row, normalized, structured));
    // An address without an apartment can describe several parcels/buildings. Only an exact saved aggregate is safe.
    if (!structured.apartmentNumber || matches.length !== 1) return null;
    const entry = recordEntry(matches[0]);
    await saveAddressAlias(rawAddress, entry);
    return entry;
  } catch (error) {
    logDbError("address lookup failed", error);
    return null;
  }
}

export async function persistCadastruAddressResult(payload, options = {}) {
  const entry = {
    payload: cleanCadastruPayload(payload),
    lookupSource: normalizeLookupSource(options.lookupSource),
    expiresAt: options.expiresAt || cadastruExpiresAt(),
  };
  if (payload.cadastral_number) {
    const saved = await persistCadastruRecord(payload, { ...options, skipAddressAlias: true, countLookup: false });
    if (saved) {
      const canonical = await getCadastruRecordByNumber(payload.cadastral_number);
      if (canonical) Object.assign(entry, canonical);
    }
    else await writeCadastruCache("number", payload.cadastral_number, entry);
  }
  // Keep the complete aggregate under its address; individual numbers return only their own property.
  for (const [kind, properties] of [["lands", payload.lands], ["buildings", payload.buildings]]) {
    for (const property of properties || []) {
      if (!property.cadastral_number) continue;
      const individual = {
        ...property,
        source: payload.source,
        matched_address: property.address || payload.matched_address,
        [kind]: [property],
      };
      await persistCadastruRecord(individual, { ...options, skipAddressAlias: true, countLookup: false });
      await writeCadastruCache("number", property.cadastral_number, { ...entry, payload: individual });
    }
  }
  for (const address of [options.requestAddress, payload.matched_address].filter(Boolean)) {
    // Derived apartment results may carry only the building address: never alias them to the whole building.
    if (payload.cadastral_number && address !== options.requestAddress && options.structuredAddress?.apartmentNumber
      && !parseAddressParts(address).apartmentNumber) continue;
    await saveAddressAlias(address, { ...entry, payload: cleanCadastruPayload(payload) });
  }
  return entry.payload;
}
