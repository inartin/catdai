import crypto from "node:crypto";

const digits = (value) => String(value || "").replace(/\D/g, "");
const fresh = (expiry, now) => Number.isFinite(Date.parse(expiry)) && Date.parse(expiry) > now;
function originKey(input) {
  const normalized = Object.fromEntries(Object.keys(input).sort().map((key) => [key,
    typeof input[key] === "string" ? input[key].normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/\s+/g, " ").trim() : input[key],
  ]));
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function summarizeCadastruStorage({ records, buildings, addresses, nearby, transport, reports }, now = Date.now()) {
  const buildingIds = new Set(buildings.map((row) => digits(row.cadastral_number)));
  const allIds = new Set([...buildingIds, ...records.map((row) => digits(row.cadastral_number))]);
  const cities = new Map();
  const cityRow = (city) => {
    const name = city?.trim() || "Unknown city";
    if (!cities.has(name)) cities.set(name, { city: name, buildings: 0, apartments: 0, other: 0 });
    return cities.get(name);
  };
  const linkedCities = new Map(records.filter((row) => row.shared_building_number && row.city)
    .map((row) => [row.shared_building_number, row.city]));
  const apartments = { total: 0, linked: 0, details: 0, references: 0, fresh: 0 };
  let other = 0;
  for (const row of records) {
    const number = digits(row.cadastral_number);
    if (buildingIds.has(number)) continue; // The same building can also have a registry record.
    const city = cityRow(row.city);
    if (/^\d{15,16}$/.test(number)) {
      apartments.total++;
      city.apartments++;
      if (buildingIds.has(digits(row.shared_building_number))) apartments.linked++;
      const details = !row.unit_list_entry && (["full_data", "apartment_only"].includes(row.result_type)
        || row.apartment_area_m2 != null || row.apartment_floor != null);
      if (details) apartments.details++;
      else apartments.references++;
      if (fresh(row.next_refresh_after, now)) apartments.fresh++;
    } else { other++; city.other++; }
  }
  const aliases = new Map();
  for (const row of addresses) {
    if (!aliases.has(row.building_number)) aliases.set(row.building_number, new Set());
    aliases.get(row.building_number).add(row.origin_key);
  }
  const snapshots = Object.fromEntries(Object.entries({ nearby, transport, reports })
    .map(([name, rows]) => [name, new Map(rows.filter((row) => !row.incomplete && !row.stale).map((row) => [row.origin_key, row]))]));
  const coverage = Object.fromEntries(["cadastru", "nearby", "transport", "reports"].map((key) => [key, { saved: 0, fresh: 0, total: 0 }]));
  const collection = { harvested: 0, partial: 0, notHarvested: 0 };
  let allCategories = 0;
  for (const building of buildings) {
    const relatedCity = linkedCities.get(building.cadastral_number);
    const buildingCity = building.lookup_input?.city || relatedCity;
    cityRow(buildingCity).buildings++;
    const keys = new Set(aliases.get(building.cadastral_number) || []);
    if (building.lookup_input) keys.add(originKey(building.lookup_input));
    coverage.cadastru.total++;
    coverage.cadastru.saved++;
    if (fresh(building.expires_at, now)) coverage.cadastru.fresh++;
    let hasAll = true;
    for (const name of ["nearby", "transport", "reports"]) {
      if (name === "reports" && String(buildingCity || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() !== "chisinau") continue;
      coverage[name].total++;
      const matches = [...keys].map((key) => snapshots[name].get(key)).filter(Boolean);
      if (matches.length) coverage[name].saved++;
      else hasAll = false;
      if (matches.some((row) => fresh(row.expires_at, now))) coverage[name].fresh++;
    }
    if (hasAll) allCategories++;
    if (building.collection_snapshot?.usable) collection.harvested++;
    else if (building.collection_snapshot) collection.partial++;
    else collection.notHarvested++;
  }
  return { available: true, updatedAt: new Date(now).toISOString(), total: allIds.size,
    buildings: buildings.length, apartments, other, coverage, allCategories, collection,
    byCity: [...cities.values()].sort((a, b) => (b.buildings + b.apartments + b.other) - (a.buildings + a.apartments + a.other) || a.city.localeCompare(b.city, "ro")),
  };
}
