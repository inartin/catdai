import { supabaseAdmin } from "@/lib/supabase-admin";
import { shouldPersistRuntimeData } from "@/lib/runtime-persistence";
import { CADASTRU_BUILDING_TTL_SECONDS, cadastruExpiresAt, isFreshCadastru, readCadastruCache, writeCadastruCache, invalidateCadastruCache } from "@/lib/cadastru-cache";
import { nearbyAddressFromCadastru } from "@/lib/cadastru-nearby";
import { cadastruLocationOriginKey } from "@/lib/cadastru-location-storage";
import { validMapGeometry } from "@/lib/cadastru-map";

export function apartmentBuildingNumber(number) {
  return String(number || "").match(/^(\d{7}\.\d{3}\.\d{2})\.\d{3,4}$/)?.[1] || null;
}

export function isApartmentBlock(building) {
  return String(building?.classifier || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim() === "bloc cu apartamente";
}

function entryFromRow(row) {
  if (!row) return null;
  return { payload: row.raw_payload, number: row.cadastral_number, lookupInput: row.lookup_input,
    fetchedAt: row.fetched_at, expiresAt: row.expires_at, fieldFetchedAt: row.field_fetched_at };
}

export async function getSharedBuilding(number) {
  if (!/^\d{7}\.\d{3}\.\d{2}$/.test(number || "")) return null;
  const cached = await readCadastruCache("building", number, { allowExpired: true });
  if (cached) return cached;
  if (!shouldPersistRuntimeData()) return null;
  const { data, error } = await supabaseAdmin.from("cadastru_buildings").select("*")
    .eq("cadastral_number", number).limit(1);
  if (error) { console.error("[cadastru-buildings] read failed:", error.message); return null; }
  const entry = entryFromRow(data?.[0]);
  if (entry) await writeCadastruCache("building", number, entry);
  return entry;
}

export async function getSharedBuildingByAddress(address) {
  const input = nearbyAddressFromCadastru({ request_address: address });
  if (!input || !shouldPersistRuntimeData()) return null;
  const { data, error } = await supabaseAdmin.from("cadastru_building_addresses").select("building_number")
    .eq("origin_key", cadastruLocationOriginKey(input)).limit(2);
  // An address can identify several constructions. Never select one arbitrarily.
  if (error || data?.length !== 1) return null;
  return getSharedBuilding(data[0].building_number);
}

export async function storeSharedBuilding(number, building, options = {}) {
  if (!/^\d{7}\.\d{3}\.\d{2}$/.test(number || "") || !shouldPersistRuntimeData()) return null;
  if (!isApartmentBlock(building) && (building?.classifier || !await getSharedBuilding(number))) return null;
  const input = nearbyAddressFromCadastru({ building, request_address: options.address });
  const fetchedAt = options.fetchedAt || new Date().toISOString();
  const data = Object.fromEntries(Object.entries({ ...building,
    ...(options.mapLocation ? { map_location: options.mapLocation } : {}),
  }).filter(([, value]) => value !== null && value !== undefined && value !== ""));
  // The database merges fields atomically, preserving older fields and their actual dates.
  const { data: rows, error } = await supabaseAdmin.rpc("merge_cadastru_building", {
    p_number: number, p_data: data, p_fetched_at: fetchedAt,
    p_expires_at: options.expiresAt || cadastruExpiresAt(fetchedAt, CADASTRU_BUILDING_TTL_SECONDS), p_lookup_input: input,
  });
  if (error || !rows?.[0]) {
    console.error("[cadastru-buildings] save failed:", error?.message || "missing saved row");
    return null;
  }
  const entry = entryFromRow(rows[0]);
  for (const address of [building.address, options.address].filter(Boolean)) {
    const aliasInput = nearbyAddressFromCadastru({ request_address: address });
    if (!aliasInput) continue;
    const { error: aliasError } = await supabaseAdmin.from("cadastru_building_addresses").upsert({
      origin_key: cadastruLocationOriginKey(aliasInput), building_number: number,
    }, { onConflict: "origin_key,building_number" });
    if (aliasError) console.error("[cadastru-buildings] alias save failed:", aliasError.message);
  }
  await invalidateCadastruCache("building", number);
  return entry;
}

export function sharedBuildingMetadata(entry) {
  return { fetched_at: entry.fetchedAt, expires_at: entry.expiresAt,
    stale: !isFreshCadastru(entry.expiresAt), field_fetched_at: entry.fieldFetchedAt };
}

function sharedMapData(payload) {
  const { map_location: location, registry, lands, ...details } = payload;
  delete details.map_geometry_checked_at;
  const geometry = validMapGeometry(details.map_geometry) ? details.map_geometry : registry?.map_geometry;
  return { location, registry, details: { ...details,
    ...(validMapGeometry(geometry) ? { map_geometry: geometry } : {}),
  }, lands: Array.isArray(lands) ? lands.filter(land => validMapGeometry(land?.map_geometry)) : [] };
}

function sharedProperty(building) {
  const { location, registry, details } = sharedMapData(building.payload);
  return { ...registry, cadastral_number: building.number,
    ...(location ? { map_location: location } : {}),
    ...(validMapGeometry(details.map_geometry) ? { map_geometry: details.map_geometry } : {}),
  };
}

export async function composeBuildingEntry(entry) {
  if (entry?.payload?.buildings?.some((property) => property.shared_building_reference)) {
    const lands = new Map((entry.payload.lands || []).map(land => [land.cadastral_number, land]));
    const properties = await Promise.all(entry.payload.buildings.map(async (property) => {
      if (!property.shared_building_reference) return property;
      const shared = await getSharedBuilding(property.cadastral_number);
      for (const land of shared ? sharedMapData(shared.payload).lands : []) {
        const saved = lands.get(land.cadastral_number);
        if (!validMapGeometry(saved?.map_geometry)) lands.set(land.cadastral_number, { ...saved, ...land });
      }
      return shared ? sharedProperty(shared) : { cadastral_number: property.cadastral_number, partial: true };
    }));
    entry = { ...entry, payload: { ...entry.payload, buildings: properties,
      ...(lands.size ? { lands: [...lands.values()] } : {}),
    } };
  }
  if (!entry?.buildingNumber) return entry;
  const building = await getSharedBuilding(entry.buildingNumber);
  if (!building) return entry;
  const { location, details, lands } = sharedMapData(building.payload);
  if (entry.payload.cadastral_number === building.number) {
    const property = sharedProperty(building);
    return { ...entry, payload: { ...entry.payload, ...property, ...(lands.length ? { lands } : {}), buildings: [property], building: details,
      data_freshness: { building: sharedBuildingMetadata(building) } } };
  }
  // Apartment parcel geometry already has a top-level field. A lands collection
  // would incorrectly turn its data card into a land/building address result.
  const parcelMap = !validMapGeometry(entry.payload.map_geometry) && lands.length
    ? { map_geometry: lands[0].map_geometry } : {};
  return { ...entry, payload: { ...entry.payload, ...parcelMap, building: details,
    building_cadastral_number: building.number,
    ...(location ? { map_location: location } : {}),
    form_fields: { ...entry.payload.form_fields,
      ...(details.total_floors ? { total_floors: String(details.total_floors) } : {}),
      ...(details.construction_year ? { building_type: Number(details.construction_year) >= 2010 ? "Construcţii noi" : "Secundar" } : {}),
    },
    data_freshness: { apartment: { expires_at: entry.expiresAt, stale: !isFreshCadastru(entry.expiresAt) },
      building: sharedBuildingMetadata(building) },
  } };
}

export async function getBuildingFallback({ number, address }) {
  const building = number ? await getSharedBuilding(apartmentBuildingNumber(number))
    : await getSharedBuildingByAddress(address);
  if (!building) return null;
  const { location, details, lands } = sharedMapData(building.payload);
  return { building: details, ...(lands.length ? { map_geometry: lands[0].map_geometry } : {}), apartment: {}, partial: true, apartment_unavailable: true,
    building_cadastral_number: building.number, matched_address: details.address,
    ...(location ? { map_location: location } : {}),
    ...(address ? { request_address: address } : {}),
    data_freshness: { building: sharedBuildingMetadata(building) },
  };
}
