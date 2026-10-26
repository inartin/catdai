import { shouldCollectStatistics } from "@/lib/statistics-context";
import crypto from "node:crypto";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { matchDistrict } from "@/lib/validation";
import { resolveCadastruSupportedCity, resolveCadastruCityFromAddress } from "@/lib/cadastru-supported-cities";
import { cadastruExpiresAt, isFreshCadastru, cleanCadastruPayload, readCadastruCache, writeCadastruCache, withCadastruFreshness } from "@/lib/cadastru-cache";
import { apartmentBuildingNumber, isApartmentBlock, storeSharedBuilding, getSharedBuilding, composeBuildingEntry } from "@/lib/cadastru-buildings";
import { validMapGeometry } from "@/lib/cadastru-map";

const RECORD_COLUMNS = [
  "id",
  "cadastral_number",
  "official_cadastral_number",
  "raw_cadastral_number",
  "building_cadastral_number",
  "shared_building_number",
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

const RESULT_TYPES = new Set(["no_data", "address_only", "land_only", "apartment_only", "full_data"]);
const LOOKUP_SOURCES = new Set(["api", "local"]);

// These legacy resolver sources guessed an apartment's cadastral identity.
function hasDerivedIdentity(payload) {
  return ["geodata_wms_derived", "geodata_wfs_building_derived", "geodata_wfs_parcel_derived"].includes(payload?.source);
}

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
  return resolveCadastruCityFromAddress(address);
}

function resolveRegionFromAddress(address) {
  const municipality = String(address || "").match(/(?:^|[,;]\s*)(?:municipiul|municipiu|mun)\.?\s+([^,;]+?)(?=\s+(?:comuna|com|orasul|oras|or|satul|sat|sectorul|sect|strada|str|bd)\b|[,;]|$)/i);
  const city = resolveCadastruSupportedCity(municipality?.[1]) || resolveCityFromAddress(address);
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
  if (hasDetailedPayload(payload)) return classifyDetailedCadastruPayload(payload);
  if (Array.isArray(payload?.lands) && payload.lands.some((land) => land?.cadastral_number)
    && !payload?.buildings?.length) return "land_only";
  return "address_only";
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
      storagePayload.district ||
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
    last_official_fetch_at: options.officialFetch ? now : existing?.last_official_fetch_at || options.fetchedAt || null,
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
  if (isObject(row?.raw_payload) && Object.keys(row.raw_payload).length) {
    return withSavedDistrict(cleanCadastruPayload(row.raw_payload), row.district);
  }
  return withSavedDistrict({
    cadastral_number: row.cadastral_number,
    apartment: row.apartment_data || {},
    building: row.building_data || {},
    location: row.location_data || {},
    form_fields: row.form_fields || {},
    matched_address: row.full_address,
    partial: row.partial,
  }, row.district);
}

function withSavedDistrict(payload, district) {
  if (!cleanText(district) || cleanText(payload?.district) || cleanText(payload?.form_fields?.district)) return payload;
  return { ...payload, district };
}

function isAddressResolverOnlyRecord(row) {
  const payload = isObject(row?.raw_payload) ? row.raw_payload : {};
  if (payload.unit_list_entry) return true;
  return payload.method === "address" && !hasDetailedPayload(payload) && !payload.lands?.length && !payload.buildings?.length;
}

function apartmentPayload(payload) {
  const clean = cleanCadastruPayload(payload);
  // Keep embedded legacy secondary snapshots available for their existing lazy promotion.
  for (const key of ["building", "building_address", "map_location"]) delete clean[key];
  if (clean.form_fields) {
    clean.form_fields = { ...clean.form_fields };
    delete clean.form_fields.total_floors;
    delete clean.form_fields.building_type;
  }
  return clean;
}

async function persistBuildingBundles(payload, options) {
  for (const bundle of payload?.building_bundles || []) {
    const registry = payload.buildings?.find((property) => property.cadastral_number === bundle.cadastral_number);
    const building = await storeSharedBuilding(bundle.cadastral_number, {
      ...bundle.building, ...(registry ? { registry } : {}),
    }, {
      address: bundle.building?.address, mapLocation: bundle.map_location,
      fetchedAt: bundle.fetched_at, expiresAt: bundle.expires_at,
    });
    if (!building) continue;
    for (const unit of bundle.apartments || []) {
      if (apartmentBuildingNumber(unit.cadastral_number) !== building.number) continue;
      await persistCadastruRecord({ ...unit, source: payload.source || "geodata_wms" }, {
        lookupSource: options.lookupSource, officialFetch: true, countLookup: false,
        skipBuildingBundles: true, buildingNumber: building.number,
      });
    }
  }
}

export async function persistCadastruRecord(payload, options = {}) {
  if (!isCadastruDbEnabled() || hasDerivedIdentity(payload)) return null;

  try {
    if (!options.skipBuildingBundles) await persistBuildingBundles(payload, options);
    const existing = await findRecordByNumber(payload?.cadastral_number || options.cadastralNumber);
    const row = buildRecordRow(payload, options, existing);
    if (!row) return null;

    const parentNumber = apartmentBuildingNumber(row.cadastral_number);
    const blockProperty = !parentNumber && payload.buildings?.find((property) => property.cadastral_number === row.cadastral_number);
    let sharedBuilding = null;
    if (parentNumber && !String(payload.source || "").includes("derived")) {
      if (isApartmentBlock(row.building_data) && (options.officialFetch || !existing?.shared_building_number)) {
        sharedBuilding = await storeSharedBuilding(parentNumber, row.building_data, {
          address: row.full_address, mapLocation: payload.map_location,
          fetchedAt: options.officialFetch ? undefined : existing?.last_official_fetch_at || existing?.data_updated_at,
        });
      } else {
        sharedBuilding = await getSharedBuilding(parentNumber);
        if (sharedBuilding && options.officialFetch && validMapGeometry(row.building_data.map_geometry)) {
          sharedBuilding = await storeSharedBuilding(parentNumber, { map_geometry: row.building_data.map_geometry });
        }
      }
    }
    if (blockProperty && await getSharedBuilding(row.cadastral_number)) {
      sharedBuilding = options.officialFetch
        ? await storeSharedBuilding(row.cadastral_number, { registry: blockProperty,
          ...(validMapGeometry(blockProperty.map_geometry) ? { map_geometry: blockProperty.map_geometry } : {}),
        }, {
          mapLocation: blockProperty.map_location,
        }) : await getSharedBuilding(row.cadastral_number);
      if (sharedBuilding) {
        row.shared_building_number = row.cadastral_number;
        row.raw_payload = { cadastral_number: row.cadastral_number, source: row.source };
        row.payload_hash = hashPayload(row.raw_payload);
      }
    }
    if (sharedBuilding && parentNumber) {
      row.shared_building_number = parentNumber;
      row.building_cadastral_number = parentNumber;
      // A partial refresh cannot erase fields already fetched for this apartment.
      const incoming = Object.fromEntries(Object.entries(row.apartment_data).filter(([, value]) => value != null && value !== ""));
      const retained = Object.keys(existing?.apartment_data || {}).some((key) => !(key in incoming));
      row.apartment_data = { ...existing?.apartment_data, ...incoming };
      row.raw_payload = { ...existing?.raw_payload, ...row.raw_payload, apartment: row.apartment_data };
      if (hasDetailedPayload({ apartment: row.apartment_data })) delete row.raw_payload.unit_list_entry;
      row.apartment_area_m2 = normalizeNumber(row.apartment_data.area_m2);
      row.apartment_floor = normalizeInteger(row.apartment_data.floor);
      row.apartment_estimated_value_lei = normalizeNumber(row.apartment_data.estimated_value_lei);
      row.form_fields = { ...existing?.form_fields, ...row.form_fields };
      row.raw_payload.form_fields = row.form_fields;
      if (retained) {
        row.next_refresh_after = recordExpiry(existing);
        row.last_official_fetch_at = existing.last_official_fetch_at;
        row.result_type = existing.result_type;
      }
      row.building_data = {};
      row.building_total_floors = null;
      row.building_construction_year = null;
      row.raw_payload = apartmentPayload(row.raw_payload);
      row.form_fields = apartmentPayload({ form_fields: row.form_fields }).form_fields;
      row.payload_hash = hashPayload(row.raw_payload);
    }

    const now = new Date().toISOString();
    const countLookup = shouldCollectStatistics() && options.countLookup !== false;
    const shouldKeepExistingDetail = !sharedBuilding && existing && !hasDerivedIdentity(existing) && !hasDerivedIdentity(existing.raw_payload) && isFreshCadastru(recordExpiry(existing)) && row.raw_payload.method === "address" && hasDetailedPayload(existing.raw_payload) && !hasDetailedPayload(row.raw_payload);
    const retainedPayload = shouldKeepExistingDetail
      ? {
          ...existing.raw_payload,
          ...(Object.hasOwn(row.raw_payload, "map_location") ? { map_location: row.raw_payload.map_location } : {}),
          ...(validMapGeometry(row.raw_payload.map_geometry) ? { map_geometry: row.raw_payload.map_geometry } : {}),
          ...(validMapGeometry(row.raw_payload.building?.map_geometry)
            ? { building: { ...existing.raw_payload.building, map_geometry: row.raw_payload.building.map_geometry } } : {}),
          ...(cleanText(row.raw_payload.district) ? { district: row.raw_payload.district } : {}),
          ...(row.raw_payload.district_lookup_checked === true ? { district_lookup_checked: true } : {}),
          ...(row.raw_payload.nearby ? { nearby: row.raw_payload.nearby } : {}),
        }
      : null;
    const retainedHash = retainedPayload ? hashPayload(retainedPayload) : null;
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
            district: cleanText(row.raw_payload.district) ? row.district : existing.district || row.district,
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
            raw_payload: retainedPayload,
            payload_hash: retainedHash,
            data_updated_at: retainedHash === existing.payload_hash ? existing.data_updated_at : now,
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
      return (await composeBuildingEntry(entry)).payload;
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      console.error("[cadastru-records] persist failed:", error?.message || String(error));
    }
    return null;
  }
}

function recordEntry(row) {
  return {
    payload: row.shared_building_number ? apartmentPayload(hydratePayloadFromRecord(row)) : hydratePayloadFromRecord(row),
    ...(row.shared_building_number ? { buildingNumber: row.shared_building_number } : {}),
    lookupSource: normalizeLookupSource(row.lookup_source),
    resultType: normalizeResultType(row.result_type),
    fetchedAt: row.last_official_fetch_at || row.data_updated_at || row.saved_at,
    expiresAt: recordExpiry(row),
  };
}

async function saveAddressAlias(address, entry) {
  const addressKey = normalizeCadastruAddressForDb(address);
  if (!addressKey || !isFreshCadastru(entry.expiresAt)) return;
  const savedEntry = entry.buildingNumber ? { ...entry, payload: { cadastral_number: entry.payload.cadastral_number } } : entry;
  await writeCadastruCache("address", addressKey, savedEntry);
  if (!isCadastruDbEnabled()) return;
  const { error } = await supabaseAdmin.from("cadastru_address_aliases").upsert({
    address_key: addressKey,
    cadastral_number: entry.payload.cadastral_number || null,
    raw_payload: cleanCadastruPayload(savedEntry.payload),
    lookup_source: entry.lookupSource,
    fetched_at: entry.fetchedAt,
    expires_at: entry.expiresAt,
  }, { onConflict: "address_key" });
  logDbError("address alias save failed", error);
}

function isParcelBuilding(parcelNumber, buildingNumber) {
  const parts = String(buildingNumber || "").split(".");
  return parts.length === 3 && /^\d{2}$/.test(parts[2])
    && `${parts[0]}.${parts[1]}` === parcelNumber;
}

async function composeParcelEntry(entry, options) {
  const number = entry.payload.cadastral_number;
  if (!/^\d{7}\.\d{1,4}$/.test(number || "") || !isCadastruDbEnabled()) return entry;
  try {
    // Recover buildings saved separately by older address lookups and the collector.
    // The range uses the existing number index; the pattern excludes apartments.
    const { data, error } = await supabaseAdmin.from("cadastru_records").select(RECORD_COLUMNS)
      .gte("cadastral_number", `${number}.`).lt("cadastral_number", `${number}/`)
      .like("cadastral_number", `${number}.__`).limit(100);
    if (error) { logDbError("parcel buildings lookup failed", error); return entry; }
    const buildings = new Map((entry.payload.buildings || [])
      .filter(property => isParcelBuilding(number, property.cadastral_number))
      .map(property => [property.cadastral_number, property]));
    const parcelFetchedAt = entry.fetchedAt;
    for (const row of data || []) {
      if (!isParcelBuilding(number, row.cadastral_number) || hasDerivedIdentity(row) || hasDerivedIdentity(row.raw_payload)
        || (!options.allowExpired && !isFreshCadastru(recordExpiry(row)))) continue;
      const child = await composeBuildingEntry(recordEntry(row));
      const property = child.payload.buildings?.find(property => property.cadastral_number === row.cadastral_number);
      if (!property) continue;
      if (buildings.has(row.cadastral_number) && Date.parse(child.fetchedAt) < Date.parse(parcelFetchedAt)) continue;
      buildings.set(row.cadastral_number, { ...buildings.get(row.cadastral_number), ...property });
      if (Date.parse(child.expiresAt) < Date.parse(entry.expiresAt)) {
        entry = { ...entry, fetchedAt: child.fetchedAt, expiresAt: child.expiresAt };
      }
    }
    return { ...entry, payload: { ...entry.payload, ...(buildings.size ? { buildings: [...buildings.values()] } : {}) } };
  } catch (error) {
    logDbError("parcel buildings lookup failed", error);
    return entry;
  }
}

export async function getCadastruRecordByNumber(cadastralNumber, options = {}) {
  const cached = await readCadastruCache("number", cadastralNumber, options);
  if (cached && !hasDerivedIdentity(cached.payload) && (!options.requireDetailPayload || !isAddressResolverOnlyRecord({ raw_payload: cached.payload }))) {
    return composeParcelEntry(await composeBuildingEntry(cached), options);
  }
  if (!isCadastruDbEnabled()) return null;
  try {
    const row = await findRecordByNumber(cadastralNumber);
    if (!row || hasDerivedIdentity(row) || hasDerivedIdentity(row.raw_payload) || (!options.allowExpired && !isFreshCadastru(recordExpiry(row)))) return null;
    if (options.requireDetailPayload && isAddressResolverOnlyRecord(row)) return null;
    const entry = recordEntry(row);
    await writeCadastruCache("number", cadastralNumber, entry);
    return composeParcelEntry(await composeBuildingEntry(entry), options);
  } catch (error) {
    logDbError("number lookup failed", error);
    return null;
  }
}

export async function persistCadastruNearby(entry, nearby, address = null) {
  const payload = { ...entry.payload, nearby };
  const updatedEntry = { ...entry, payload };
  if (payload.cadastral_number) {
    const saved = await persistCadastruRecord(payload, {
      countLookup: false,
      lookupSource: entry.lookupSource,
      expiresAt: entry.expiresAt,
      requestAddress: address,
    });
    if (saved) updatedEntry.payload = { ...saved, nearby };
    await writeCadastruCache("number", payload.cadastral_number, updatedEntry);
  }
  for (const alias of new Set([address, payload.request_address, payload.resolved_address].filter(Boolean))) {
    await saveAddressAlias(alias, updatedEntry);
  }
  return updatedEntry.payload;
}

async function resolveAddressEntry(entry, options = {}) {
  if (!entry || hasDerivedIdentity(entry.payload) || (!options.allowExpired && !isFreshCadastru(entry.expiresAt))) return null;
  // Resolve single-property aliases through the same canonical record as number searches.
  if (entry.payload.cadastral_number) {
    const canonical = await getCadastruRecordByNumber(entry.payload.cadastral_number, options);
    if (!canonical) return entry;
    if (options.requireUnitDetails && canonical.payload.unit_list_entry) return null;
    if (cleanText(canonical.payload?.district) || cleanText(canonical.payload?.form_fields?.district)) return canonical;

    const aliasDistrict = cleanText(entry.payload?.district || entry.payload?.form_fields?.district);
    let district = aliasDistrict;
    if (!district && !canonical.payload?.district_lookup_checked && isCadastruDbEnabled()) {
      try {
        const row = await findRecordByNumber(entry.payload.cadastral_number);
        if (row && isFreshCadastru(recordExpiry(row))) district = cleanText(row.district);
      } catch (error) {
        logDbError("district recovery failed", error);
      }
    }
    if (district) {
      const updated = { ...canonical, payload: withSavedDistrict(canonical.payload, district) };
      await writeCadastruCache("number", entry.payload.cadastral_number,
        updated.buildingNumber ? { ...updated, payload: apartmentPayload(updated.payload) } : updated);
      return updated;
    }
    return canonical;
  }
  return composeBuildingEntry(entry);
}

export async function getCadastruRecordByAddress(rawAddress, options = {}) {
  const normalized = normalizeCadastruAddressForDb(rawAddress);
  if (!normalized) return null;
  const cached = await readCadastruCache("address", normalized, options);
  if (cached) return resolveAddressEntry(cached, options);
  if (!isCadastruDbEnabled()) return null;
  try {
    const { data: aliases, error: aliasError } = await supabaseAdmin.from("cadastru_address_aliases")
      .select("raw_payload, lookup_source, fetched_at, expires_at").eq("address_key", normalized).limit(1);
    logDbError("address alias lookup failed", aliasError);
    const alias = aliases?.[0];
    if (alias && (options.allowExpired || isFreshCadastru(alias.expires_at))) {
      const entry = { payload: alias.raw_payload, lookupSource: alias.lookup_source,
        fetchedAt: alias.fetched_at, expiresAt: alias.expires_at };
      await writeCadastruCache("address", normalized, entry);
      return resolveAddressEntry(entry, options);
    }
    const structured = options.structuredAddress || {};
    if (!structured.city || !structured.houseNumber) return null;
    let query = supabaseAdmin.from("cadastru_records").select(RECORD_COLUMNS)
      .eq("city", structured.city).eq("house_number", structured.houseNumber);
    query = structured.apartmentNumber ? query.eq("apartment_number", structured.apartmentNumber) : query.is("apartment_number", null);
    const { data, error } = await query.limit(100);
    logDbError("structured address lookup failed", error);
    const matches = (data || []).filter((row) => !hasDerivedIdentity(row) && !hasDerivedIdentity(row.raw_payload) && (!options.requireUnitDetails || !row.raw_payload?.unit_list_entry)
      && (options.allowExpired || isFreshCadastru(recordExpiry(row))) && recordMatchesStructuredAddress(row, normalized, structured));
    // An address without an apartment can describe several parcels/buildings. Only an exact saved aggregate is safe.
    if (!structured.apartmentNumber || matches.length !== 1) return null;
    const entry = recordEntry(matches[0]);
    await saveAddressAlias(rawAddress, entry);
    return composeBuildingEntry(entry);
  } catch (error) {
    logDbError("address lookup failed", error);
    return null;
  }
}

export async function persistCadastruAddressResult(payload, options = {}) {
  if (hasDerivedIdentity(payload)) throw Object.assign(new Error("Unverified apartment identity from address resolver"), { code: "not_found", status: 404 });
  await persistBuildingBundles(payload, options);
  const entry = {
    payload: cleanCadastruPayload(payload),
    lookupSource: normalizeLookupSource(options.lookupSource),
    fetchedAt: options.fetchedAt || new Date().toISOString(),
    expiresAt: options.expiresAt || cadastruExpiresAt(),
  };
  if (payload.cadastral_number) {
    const saved = await persistCadastruRecord(payload, { ...options, skipBuildingBundles: true, skipAddressAlias: true, countLookup: false });
    if (saved) {
      const canonical = await getCadastruRecordByNumber(payload.cadastral_number);
      if (canonical) Object.assign(entry, canonical);
    }
    else await writeCadastruCache("number", payload.cadastral_number, entry);
  }
  // A parcel includes its verified constructions; a building keeps its own result.
  for (const [kind, properties] of [["lands", payload.lands], ["buildings", payload.buildings]]) {
    for (const property of properties || []) {
      if (!property.cadastral_number) continue;
      const individual = {
        ...property,
        source: payload.source,
        matched_address: property.address || payload.matched_address,
        [kind]: [property],
        ...(kind === "lands" ? { buildings: (payload.buildings || [])
          .filter(building => isParcelBuilding(property.cadastral_number, building.cadastral_number)) } : {}),
      };
      const saved = await persistCadastruRecord(individual, { ...options, skipAddressAlias: true, countLookup: false });
      if (!saved) await writeCadastruCache("number", property.cadastral_number, { ...entry, payload: individual });
    }
  }
  if (payload.buildings?.length) {
    const references = await Promise.all(payload.buildings.map(async (property) =>
      await getSharedBuilding(property.cadastral_number)
        ? { cadastral_number: property.cadastral_number, shared_building_reference: true } : property));
    entry.payload = { ...entry.payload, buildings: references };
  }
  for (const address of new Set([options.requestAddress, options.resolvedAddress, payload.matched_address].filter(Boolean))) {
    // Derived apartment results may carry only the building address: never alias them to the whole building.
    if (payload.cadastral_number && address !== options.requestAddress && options.structuredAddress?.apartmentNumber
      && !parseAddressParts(address).apartmentNumber) continue;
      await saveAddressAlias(address, entry);
  }
  return withCadastruFreshness(await composeBuildingEntry(entry));
}
