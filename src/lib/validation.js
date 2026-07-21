/**
 * Shared validation for property estimate inputs.
 * Used by both client (evaluare page) and server (API routes).
 */

function normalizeDiacritics(str) {
  return str
    .replace(/[șşṣ]/g, "s")
    .replace(/[țţṭ]/g, "t")
    .replace(/[âîã]/g, "a")
    .replace(/[ă]/g, "a")
    .replace(/[ȘŞṢ]/g, "S")
    .replace(/[ȚŢṬ]/g, "T")
    .replace(/[ÂÎÃ]/g, "A")
    .replace(/[Ă]/g, "A")
    .toLowerCase()
    .trim();
}

const CITIES = {
  chisinau: "Chișinău",
  durlesti: "Durlești",
};

const DISTRICTS_BY_CITY = {
  "Chișinău": [
    "Centru", "Botanica", "Buiucani", "Ciocana", "Râșcani",
    "Telecentru", "Sculeni", "Poșta Veche", "Codru",
    "Aeroport",
  ],
  "Durlești": [],
};

const BUILDING_TYPES = ["Construcţii noi", "Secundar"];

const RENOVATION_TYPES = [
  "Euroreparație", "Variantă albă", "Reparație cosmetică",
  "Design individual", "Fără reparație", "Construcție nefinisată",
  "Are nevoie de reparație", "Dat în exploatare", "Variantă sură",
];

const CADASTRAL_RE = /^(?:\d{7}\.\d{3}|\d{5,7}\.\d{1,4}\.\d{2}\.\d{3,4}|\d{7,12}\.\d{2}\.\d{3,4})$/;

function matchCity(raw) {
  if (!raw || typeof raw !== "string") return null;
  const key = normalizeDiacritics(raw);
  const entry = Object.entries(CITIES).find(([norm, canonical]) =>
    key === norm || normalizeDiacritics(canonical) === key
  );
  return entry ? entry[1] : null;
}

const DISTRICT_ALIASES = {
  riscani: "Râșcani",
  rascani: "Râșcani",
  "posta veche": "Poșta Veche",
  pamanteni: "Pământeni",
};

function matchDistrict(raw, city) {
  if (!raw || typeof raw !== "string") return null;
  const key = normalizeDiacritics(raw);

  if (city) {
    const districts = DISTRICTS_BY_CITY[city];
    if (!districts) return null;
    const direct = districts.find((d) => normalizeDiacritics(d) === key);
    if (direct) return direct;
    const alias = DISTRICT_ALIASES[key];
    return alias && districts.includes(alias) ? alias : null;
  }

  const alias = DISTRICT_ALIASES[key];
  if (alias) return alias;
  for (const districts of Object.values(DISTRICTS_BY_CITY)) {
    const found = districts.find((d) => normalizeDiacritics(d) === key);
    if (found) return found;
  }
  return null;
}

function matchBuildingType(raw) {
  if (!raw || typeof raw !== "string") return null;
  const key = normalizeDiacritics(raw);
  return BUILDING_TYPES.find((b) => normalizeDiacritics(b) === key) || null;
}

function matchRenovation(raw) {
  if (!raw || typeof raw !== "string") return null;
  const key = normalizeDiacritics(raw);
  return RENOVATION_TYPES.find((r) => normalizeDiacritics(r) === key) || null;
}

function isFiniteInRange(value, min, max) {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max;
}

/**
 * Validate and normalize property estimate inputs.
 * Returns { valid: true, data: { ...normalized } } or { valid: false, field, reason }.
 */
export function validateEstimateInput(raw) {
  const city = matchCity(raw.city);
  if (!city) return { valid: false, field: "city", reason: "invalid_city" };

  const cityHasDistricts = (DISTRICTS_BY_CITY[city] || []).length > 0;
  let district = null;
  if (cityHasDistricts) {
    district = matchDistrict(raw.district, city);
    if (!district) return { valid: false, field: "district", reason: "invalid_district" };
  }

  const roomsCount = Number(raw.rooms_count);
  if (!Number.isInteger(roomsCount) || roomsCount < 1 || roomsCount > 5) {
    return { valid: false, field: "rooms_count", reason: "invalid_rooms" };
  }

  const data = { city, district: district || null, rooms_count: roomsCount };

  if (raw.area_m2 != null && raw.area_m2 !== "") {
    const area = parseFloat(raw.area_m2);
    if (!Number.isFinite(area) || area <= 0 || area > 1000) {
      return { valid: false, field: "area_m2", reason: "invalid_area" };
    }
    data.area_m2 = area;
  }

  if (raw.floor != null && raw.floor !== "") {
    const floor = parseInt(raw.floor, 10);
    if (!isFiniteInRange(floor, -1, 100)) {
      return { valid: false, field: "floor", reason: "invalid_floor" };
    }
    data.floor = floor;
  }

  data.first_floor = raw.first_floor === true || raw.first_floor === "true" || raw.first_floor === "1";
  data.last_floor = raw.last_floor === true || raw.last_floor === "true" || raw.last_floor === "1";
  if ((data.first_floor || data.last_floor) && data.floor != null) {
    delete data.floor;
  }

  if (raw.total_floors != null && raw.total_floors !== "") {
    const tf = parseInt(raw.total_floors, 10);
    if (!isFiniteInRange(tf, 1, 100)) {
      return { valid: false, field: "total_floors", reason: "invalid_total_floors" };
    }
    data.total_floors = tf;
  }

  if (raw.building_type != null && raw.building_type !== "") {
    const bt = matchBuildingType(raw.building_type);
    if (!bt) return { valid: false, field: "building_type", reason: "invalid_building_type" };
    data.building_type = bt;
  }

  if (raw.renovation != null && raw.renovation !== "") {
    const ren = matchRenovation(raw.renovation);
    if (!ren) return { valid: false, field: "renovation", reason: "invalid_renovation" };
    data.renovation = ren;
  }

  if (raw.bathrooms_count != null && raw.bathrooms_count !== "") {
    const bc = parseInt(raw.bathrooms_count, 10);
    if (!isFiniteInRange(bc, 0, 3)) {
      return { valid: false, field: "bathrooms_count", reason: "invalid_bathrooms" };
    }
    data.bathrooms_count = bc;
  }

  if (raw.balconies_count != null && raw.balconies_count !== "") {
    const bl = parseInt(raw.balconies_count, 10);
    if (!isFiniteInRange(bl, 0, 3)) {
      return { valid: false, field: "balconies_count", reason: "invalid_balconies" };
    }
    data.balconies_count = bl;
  }

  return { valid: true, data };
}

/**
 * Validate cadastral number format.
 * Returns { valid: true, value } or { valid: false, reason }.
 */
export function validateCadastralNumber(raw) {
  if (!raw || typeof raw !== "string") return { valid: false, reason: "missing" };
  const trimmed = raw.trim();
  if (!CADASTRAL_RE.test(trimmed)) return { valid: false, reason: "invalid_format" };
  return { valid: true, value: trimmed };
}

export {
  normalizeDiacritics,
  matchCity,
  matchDistrict,
  matchBuildingType,
  matchRenovation,
  CITIES,
  DISTRICTS_BY_CITY,
  BUILDING_TYPES,
  RENOVATION_TYPES,
  CADASTRAL_RE,
};
