import assert from "node:assert/strict";
import { loadAppModule } from "./lib/load-app-module.mjs";

const { summarizeCadastruAddressReuse, cadastruReuseCityKey } = await loadAppModule("src/lib/admin-cadastru-address-reuse.js");
const request = { city: "Chișinău", road_type: "strada", street: "Kiev", house_number: "10", apartment_number: "2" };
const event = (overrides = {}) => ({ search_type: "address", city: "Chișinău", search_request: request, user_id: "one", created_at: "2026-10-19T10:00:00Z", ...overrides });
const cityKey = cadastruReuseCityKey("Кишинев");
const summary = summarizeCadastruAddressReuse([
  event(), event({ created_at: "2026-10-18T10:00:00Z" }),
  event({ search_request: { ...request, city: "Chisinau", street: "Киев", apartment_number: "002" }, user_id: "two" }),
  event({ search_request: null, search_address: "Chișinău, str. Kiev 10 ap 2", user_id: null }),
  event({ search_request: { ...request, apartment_number: "3" } }),
  event({ search_request: { ...request, apartment_number: "" } }),
  event({ search_request: { ...request, road_type: "str-la" } }),
  event({ search_request: { ...request, house_number: "10/1" } }),
  event({ search_request: { ...request, city: "Bălți" } }),
  event({ search_request: null, search_address: null }),
  event({ search_type: "number" }),
]);
const city = summary.get(cityKey);
assert.equal(city.rows.length, 3, "apartments group by building while road types and house suffixes stay distinct");
assert.equal(city.rows[0].searches, 6, "building totals include every apartment and building-only searches");
assert.equal(city.rows[0].repeatUses, 5);
assert.equal(city.rows[0].registeredUsers, 2, "the same registered user is counted once across apartments");
assert.equal(city.rows[0].apartmentCount, 0, "search-only apartments do not inflate stored inventory");
assert(!city.rows[0].address.includes("ap."), "building addresses omit the apartment");
assert.deepEqual(Array.from(city.rows[0].properties, (row) => row.apartmentNumber), ["2", "3", null]);
assert.equal(city.rows[0].properties[0].searches, 4, "structured requests, city aliases, exact Russian street aliases and legacy addresses merge");
assert.equal(city.rows[0].properties[0].repeatUses, 3);
assert.equal(city.rows[0].properties[0].registeredUsers, 2, "anonymous searches do not count as distinct users");
assert.equal(city.rows[0].properties[1].searches, 1);
assert.equal(city.rows[0].properties[1].repeatUses, 0);
assert.equal(city.rows[0].properties[2].searches, 1, "searches without an apartment stay in a separate child row");
assert.equal(city.rows[0].properties.reduce((total, row) => total + row.searches, 0), city.rows[0].searches);
assert.equal(city.rows[0].lastSearched, "2026-10-19T10:00:00Z");
assert.equal(city.excluded, 1, "missing historical addresses are reported, not guessed");
assert.equal(summary.get(cadastruReuseCityKey("Balti")).rows.length, 1, "cities stay distinct");
assert.equal(summarizeCadastruAddressReuse([]).size, 0);
const legacy = summarizeCadastruAddressReuse([
  event({ search_request: null, search_address: "Chisinau, bd. Decebal 63 ap 51" }),
  event({ search_request: { ...request, road_type: "bulevard", street: "Decebal", house_number: "63", apartment_number: "51" } }),
]);
assert.equal(legacy.get(cityKey).rows[0].searches, 2, "legacy boulevard markers match structured requests");

let reads = 0;
let failedPage = -1;
let failedTable = "cadastru_search_events";
let storedRecords = [];
let sharedBuildings = [];
let events = Array.from({ length: 1001 }, (_, index) => event({ id: index + 1, search_request: { ...request, house_number: String(index + 1) } }));
const route = await loadAppModule("src/app/api/admin/cadastru-storage/address-reuse/route.js", {
  "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
  "@/lib/admin-auth": { requireAdminApiAuth: (req) => req.authorized ? null : new Response(null, { status: 401 }) },
  "@/lib/supabase-admin": { supabaseAdmin: { from(table) {
    assert(["cadastru_search_events", "cadastru_records", "cadastru_buildings"].includes(table)); reads++;
    return {
      select(columns) { assert(!columns.includes("raw_payload")); return this; },
      eq(key, value) { assert.equal(key, "search_type"); assert.equal(value, "address"); return this; },
      is(key, value) { assert.equal(key, "duplicate_of"); assert.equal(value, null); return this; },
      order(key) { assert.equal(key, table === "cadastru_buildings" ? "cadastral_number" : "id"); return this; },
      async range(from, to) {
        const rows = table === "cadastru_records" ? storedRecords : table === "cadastru_buildings" ? sharedBuildings : events;
        return { data: rows.slice(from, to + 1), error: table === failedTable && from === failedPage ? { message: "offline" } : null };
      },
    };
  } } },
});
const req = (query = "city=Chișinău", authorized = true) => ({ authorized, nextUrl: new URL(`http://local/?${query}`) });
assert.equal((await route.GET(req(undefined, false))).status, 401);
assert.equal(reads, 0, "auth runs before database/cache reads");
for (const query of ["", "city=Chișinău&offset=-1", "city=Chișinău&offset=1.5", "city=Chișinău&offset=9007199254740991"]) {
  assert.equal((await route.GET(req(query))).status, 400);
}
assert.equal(reads, 0);
const first = await (await route.GET(req())).json();
assert.equal(first.total, 1001, "building aggregation covers all database pages");
assert.equal(first.rows.length, 50);
assert.equal(first.hasMore, true);
assert(Number.isFinite(Date.parse(first.updatedAt)), "the snapshot timestamp is returned");
assert.equal(reads, 4);
const second = await (await route.GET(req("city=Chisinau&offset=50"))).json();
assert.equal(second.rows.length, 50);
assert(!second.rows.some((row) => first.rows.some((prior) => prior.key === row.key)), "pagination does not repeat buildings");
assert.equal(reads, 4, "city aliases and load-more share the five-minute cache");
assert.equal((await route.GET(req(undefined, false))).status, 401, "auth still runs on cached results");
const last = await (await route.GET(req("city=Chișinău&offset=1000"))).json();
assert.equal(last.rows.length, 1); assert.equal(last.hasMore, false);
assert.equal((await (await route.GET(req("city=Bălți"))).json()).total, 0);
failedPage = 1000;
const failed = await route.GET(req("city=Chișinău&fresh=1"));
assert.equal(failed.status, 503, "failure on a later database page never returns partial counts");
assert.equal((await failed.json()).rows, undefined);
failedPage = -1;
events = [event()];
const refreshed = await (await route.GET(req("city=Chișinău&fresh=1"))).json();
assert.equal(refreshed.total, 1); assert.equal(refreshed.hasMore, false);
events = Array.from({ length: 1001 }, (_, index) => event({ id: index + 1, search_request: { ...request, apartment_number: String(index + 1) } }));
const oneBuilding = await (await route.GET(req("city=Chișinău&fresh=1"))).json();
assert.equal(oneBuilding.total, 1, "pagination counts buildings, not apartments");
assert.equal(oneBuilding.rows[0].searches, 1001);
assert.equal(oneBuilding.rows[0].registeredUsers, 1);
assert.equal(oneBuilding.rows[0].properties.length, 1001, "apartments for one building are not split across building pages");
assert.equal(oneBuilding.rows[0].properties[9].apartmentNumber, "10", "apartments sort numerically");

const buildingNumber = "0100101.001.01";
const storedUnit = (suffix, apartmentNumber, extra = {}) => ({ cadastral_number: `${buildingNumber}.${suffix}`,
  city: "Chișinău", shared_building_number: buildingNumber, apartment_number: apartmentNumber, ...extra });
sharedBuildings = [
  { cadastral_number: buildingNumber, lookup_input: request },
  { cadastral_number: "0100101.003.01", lookup_input: { ...request, house_number: "12" } },
];
storedRecords = [storedUnit("001", "002"), storedUnit("002", "3"), storedUnit("003", "59"),
  storedUnit("004", null), storedUnit("005", "12A"), storedUnit("006", "6"), storedUnit("007", "6"),
  storedUnit("001", "002"), // Duplicate storage identity must not inflate inventory.
  { cadastral_number: "010010100201001", city: "Chișinău", street: "str. Kiev", house_number: "11", apartment_number: "8" },
  { cadastral_number: "0100101.004.01.001", city: "Chișinău" },
  { cadastral_number: buildingNumber, city: "Chișinău" },
];
events = [event(), event({ search_request: { ...request, apartment_number: "777" } }),
  event({ search_request: { ...request, apartment_number: "" } }),
  event({ search_request: { ...request, apartment_number: "6" } }),
  event({ cadastral_number: `${buildingNumber}.004`, search_request: { ...request, apartment_number: "90" } }),
];
const inventory = await (await route.GET(req("city=Chișinău&fresh=1"))).json();
assert.equal(inventory.total, 4, "unsearched buildings, legacy units and unaddressed units remain visible");
assert.equal(inventory.rows.reduce((sum, row) => sum + row.apartmentCount, 0), 9, "every unique stored unit is counted, including unknown apartment numbers and collected references");
const main = inventory.rows.find((row) => row.address === "Strada Kiev 10");
assert.equal(main.apartmentCount, 7);
assert.equal(main.searches, 5);
assert.equal(main.repeatUses, 4);
assert.equal(main.registeredUsers, 1);
assert.equal(main.properties.find((row) => row.apartmentNumber === "2").searches, 1);
const neverSearched = main.properties.find((row) => row.apartmentNumber === "59");
assert.equal(neverSearched.stored, true);
assert.equal(neverSearched.searches, 0); assert.equal(neverSearched.repeatUses, 0);
assert.equal(neverSearched.lastSearched, null);
assert.equal(main.properties.find((row) => row.apartmentNumber === "777").stored, false, "search-only units remain separate from inventory");
assert.equal(main.properties.find((row) => row.cadastralNumber === `${buildingNumber}.004`).searches, 1, "known cadastral number links searches even without a saved apartment number");
assert.equal(main.properties.filter((row) => row.stored && row.apartmentNumber === "6").reduce((sum, row) => sum + row.searches, 0), 0, "ambiguous stored apartment labels never receive guessed search counts");
assert.equal(main.properties.reduce((sum, row) => sum + row.searches, 0), main.searches);
assert.equal(inventory.rows.find((row) => row.address === "Strada Kiev 12").searches, 0);
const conflictingCity = summarizeCadastruAddressReuse([], { buildings: sharedBuildings, records: [
  storedUnit("001", "2", { city: "Bălți" }), storedUnit("002", "3", { city: null }),
] });
assert.equal(conflictingCity.get(cadastruReuseCityKey("Bălți")).rows[0].apartmentCount, 1, "conflicting building metadata does not reclassify the record's overview city");
assert.equal(conflictingCity.get(cadastruReuseCityKey("Unknown city")).rows[0].apartmentCount, 1);
// More than one page of collected records is still included without any searches.
events = [];
storedRecords = Array.from({ length: 1001 }, (_, index) => storedUnit(String(index + 1).padStart(4, "0"), String(index + 1)));
const collected = await (await route.GET(req("city=Chișinău&fresh=1"))).json();
assert.equal(collected.rows.reduce((sum, row) => sum + row.apartmentCount, 0), 1001);
// Land and non-apartment buildings are inventory too, regardless of search logs.
sharedBuildings = [];
storedRecords = [
  { cadastral_number: "6401411.479", city: "Orhei", street: "Strada Bulgară", house_number: "20", full_address: "r-nul Orhei, mun. Orhei, str. Bulgară 20", result_type: "land_only" },
  { cadastral_number: "6401411.479.01", city: "Orhei", street: "Strada Bulgară", house_number: "20" },
];
let orhei = await (await route.GET(req("city=Orhei&fresh=1"))).json();
assert.equal(orhei.total, 1);
assert.equal(orhei.rows[0].address, "Strada Bulgară 20");
assert.equal(orhei.rows[0].apartmentCount, 0, "land is never counted as an apartment");
assert.equal(orhei.rows[0].landCount, 1);
assert.equal(orhei.rows[0].properties.length, 2, "land and its stored building are visible under the address");
assert.deepEqual(orhei.rows[0].properties.map((property) => property.propertyType).sort(), ["building", "land"]);
assert.equal(orhei.rows[0].searches, 0, "storage is independent of search analytics collection");
events = [event({ city: "Orhei", cadastral_number: "6401411.479", search_request: { city: "Orhei", road_type: "strada", street: "Bulgară", house_number: "20" } })];
orhei = await (await route.GET(req("city=Orhei&fresh=1"))).json();
assert.equal(orhei.rows[0].searches, 1);
assert.equal(orhei.rows[0].properties.find((property) => property.propertyType === "land").searches, 1, "land searches attach to the known parcel");
assert.equal(orhei.rows[0].properties.find((property) => property.propertyType === "building").searches, 0);
storedRecords = Array.from({ length: 1001 }, (_, index) => storedUnit(String(index + 1).padStart(4, "0"), String(index + 1)));
failedTable = "cadastru_records"; failedPage = 1000;
assert.equal((await route.GET(req("city=Chișinău&fresh=1"))).status, 503, "failed inventory reads never show partial or search-only totals");
console.log("Cadastru address reuse: aliases, exact identity, counts, users, legacy data, all pages, auth, pagination, cache and failures passed.");
