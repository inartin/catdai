import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Edit these constants to test another city/criteria.
const CITY = "Chisinau";
const DISTRICT = ""; // Empty means no region/district, like Durlești.
const ROOMS_COUNT = 2;
const AREA_M2 = 50;
const BUILDING_TYPE = "Secundar"; // "Construcţii noi", "Secundar", or empty.
const RENOVATION = "Reparație cosmetică";
const FLOOR = "";
const FIRST_FLOOR = false;
const LAST_FLOOR = false;
const TOTAL_FLOORS = "";
const BATHROOMS_COUNT = "";
const BALCONIES_COUNT = "";
const INCLUDE_DISTRICT_COMPARISON = true;
const INCLUDE_RELEVANT_LISTINGS = true;

const CITIES = {
  chisinau: "Chișinău",
  durlesti: "Durlești",
  balti: "Bălți",
};

const BUILDING_TYPES = ["Construcţii noi", "Secundar"];

const RENOVATION_TYPES = [
  "Euroreparație",
  "Variantă albă",
  "Reparație cosmetică",
  "Design individual",
  "Fără reparație",
  "Construcție nefinisată",
  "Are nevoie de reparație",
  "Dat în exploatare",
  "Variantă sură",
];

const RENOVATION_ALIASES = {
  "cosmetic reparatie": "Reparație cosmetică",
  "reparatie cosmetica": "Reparație cosmetică",
  cosmetic: "Reparație cosmetică",
  euroreparatie: "Euroreparație",
  euro: "Euroreparație",
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function normalizeDiacritics(value) {
  return String(value ?? "")
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

function matchFromList(raw, list, aliases = {}) {
  const key = normalizeDiacritics(raw);
  if (!key) return null;
  if (aliases[key]) return aliases[key];
  return list.find((item) => normalizeDiacritics(item) === key) || null;
}

function matchCity(raw) {
  const key = normalizeDiacritics(raw);
  if (!key) return null;
  return CITIES[key] || Object.values(CITIES).find((city) => normalizeDiacritics(city) === key) || null;
}

function loadEnvFile(fileName) {
  const filePath = path.join(projectRoot, fileName);
  if (!fs.existsSync(filePath)) return;

  for (const rawLine of fs.readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactListing(listing) {
  return {
    external_id: listing.external_id,
    price_amount: listing.price_amount,
    price_per_m2: listing.price_per_m2,
    area_m2: listing.area_m2,
    rooms_count: listing.rooms_count,
    city: listing.city,
    district: listing.district,
    building_type: listing.building_type,
    renovation: listing.renovation,
  };
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment/.env.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const city = matchCity(CITY);
const buildingType = matchFromList(BUILDING_TYPE, BUILDING_TYPES);
const renovation = matchFromList(RENOVATION, RENOVATION_TYPES, RENOVATION_ALIASES);

if (!city) {
  console.error(`Invalid CITY constant: ${CITY}`);
  process.exit(1);
}

if (optionalText(BUILDING_TYPE) && !buildingType) {
  console.error(`Invalid BUILDING_TYPE constant: ${BUILDING_TYPE}`);
  process.exit(1);
}

if (optionalText(RENOVATION) && !renovation) {
  console.error(`Invalid RENOVATION constant: ${RENOVATION}`);
  process.exit(1);
}

const params = {
  p_city: city,
  p_district: optionalText(DISTRICT),
  p_rooms_count: ROOMS_COUNT,
  p_area_m2: AREA_M2,
  p_floor: optionalNumber(FLOOR),
  p_first_floor: FIRST_FLOOR,
  p_last_floor: LAST_FLOOR,
  p_total_floors: optionalNumber(TOTAL_FLOORS),
  p_building_type: buildingType,
  p_renovation: renovation,
  p_bathrooms_count: optionalNumber(BATHROOMS_COUNT),
  p_balconies_count: optionalNumber(BALCONIES_COUNT),
  p_include_district_comparison: INCLUDE_DISTRICT_COMPARISON,
  p_include_relevant_listings: INCLUDE_RELEVANT_LISTINGS,
};

const startedAt = Date.now();
const { data, error } = await supabase.rpc("estimate_price", params);
const elapsedMs = Date.now() - startedAt;

console.log("Request params:");
console.log(JSON.stringify(params, null, 2));
console.log(`Elapsed: ${elapsedMs}ms`);

if (error) {
  console.error("RPC error:");
  console.error(JSON.stringify(error, null, 2));
  process.exit(1);
}

if (data?.error) {
  console.log("Estimate returned error:");
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

console.log("Estimate summary:");
console.log(JSON.stringify({
  input: data.input,
  estimate: data.estimate,
  range: data.range,
  market_stats: data.market_stats,
  filters_used: data.filters_used,
  district_coefficient: data.district_coefficient,
  district_comparison_count: Array.isArray(data.district_comparison) ? data.district_comparison.length : 0,
  relevant_listings: Array.isArray(data.relevant_listings)
    ? data.relevant_listings.map(compactListing)
    : [],
}, null, 2));
