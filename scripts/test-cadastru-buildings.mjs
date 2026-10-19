// Isolated PostgreSQL + Redis + API regression checks; no live services.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { loadAppModule } from "./lib/load-app-module.mjs";

const db = new PGlite();
await db.exec("create role anon; create role authenticated; create role service_role;");
for (const file of ["db/cadastru_records.sql", "db/cadastru_nearby.sql", "db/cadastru_public_transport.sql",
  "supabase/migrations/20261013155148_cadastru_shared_buildings.sql"]) await db.exec(await fs.readFile(file, "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const quote = (value) => { assert.match(value, /^[a-z_][a-z_0-9]*$/); return `"${value}"`; };
const supabase = {
  async rpc(name, values) {
    const sql = `select * from ${quote(name)}(${Object.keys(values).map((key, i) => `${quote(key)} => $${i + 1}`).join(",")})`;
    return { data: clone((await db.query(sql, Object.values(values))).rows), error: null };
  },
  from(table) {
    let op = "select", values, conflict, max = 1000;
    const filters = [];
    const query = {
      select() { return query; }, eq(key, value) { filters.push([key, value]); return query; },
      is(key, value) { filters.push([key, value]); return query; }, limit(value) { max = value; return query; },
      insert(value) { op = "insert"; values = value; return query; },
      update(value) { op = "update"; values = value; return query; },
      upsert(value, options) { op = "upsert"; values = value; conflict = options.onConflict; return query; },
      async then(resolve, reject) {
        try {
          const keys = Object.keys(values || {}), params = Object.values(values || {});
          const where = filters.map(([key, value]) => { params.push(value); return `${quote(key)} is not distinct from $${params.length}`; });
          let sql;
          if (op === "select") sql = `select * from ${quote(table)}`;
          else if (op === "update") sql = `update ${quote(table)} set ${keys.map((key, i) => `${quote(key)}=$${i + 1}`).join(",")}`;
          else {
            sql = `insert into ${quote(table)} (${keys.map(quote).join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")})`;
            if (op === "upsert") sql += ` on conflict (${conflict.split(",").map(quote).join(",")}) do update set ${keys.map((key) => `${quote(key)}=excluded.${quote(key)}`).join(",")}`;
          }
          if (where.length) sql += ` where ${where.join(" and ")}`;
          sql += op === "select" ? ` limit ${max}` : " returning *";
          return resolve({ data: clone((await db.query(sql, params)).rows), error: null });
        } catch (error) { return reject(error); }
      },
    };
    return query;
  },
};
const cache = new Map();
const mocks = {
  "@/lib/statistics-context": { shouldCollectStatistics: () => true, withStatisticsContext: handler => handler },
  "@/lib/supabase-admin": { supabaseAdmin: supabase },
  "@/lib/runtime-persistence": { shouldPersistRuntimeData: () => true },
  "@/lib/cache": { getSharedCache: async (key) => cache.has(key) ? { value: clone(cache.get(key)) } : null,
    setSharedCache: async (key, value) => { cache.set(key, clone(value)); return true; } },
};
const records = await loadAppModule("@/lib/cadastru-records", mocks);
const buildings = await loadAppModule("@/lib/cadastru-buildings", mocks);
const caching = await loadAppModule("@/lib/cadastru-cache", mocks);
const number = "0100106.131.01.059", parent = "0100106.131.01";
const building = { address: "Chișinău, bd Decebal 63", classifier: "Bloc cu apartamente", total_floors: "5", construction_year: "1965", water: "Da" };
const apartment = { address: `${building.address}, ap 59`, area_m2: 41.9, floor: "4" };
await records.persistCadastruRecord({ cadastral_number: number, building, apartment }, { officialFetch: true });
let row = (await db.query("select * from cadastru_records where cadastral_number=$1", [number])).rows[0];
assert.equal(row.shared_building_number, parent);
assert.deepEqual(row.building_data, {});
assert.equal(row.raw_payload.building, undefined);
assert.equal((await records.getCadastruRecordByNumber(number)).payload.building.construction_year, "1965");
assert.equal((await caching.readCadastruCache("number", number)).payload.building, undefined, "Redis stores the unit without shared details");
await records.persistCadastruRecord({ cadastral_number: "0100106.131.01.060", building,
  apartment: { ...apartment, address: `${building.address}, ap 60`, area_m2: 70 } }, { officialFetch: true });
assert.equal((await db.query("select count(*)::int as count from cadastru_buildings")).rows[0].count, 1);
assert.equal((await records.getCadastruRecordByNumber(number)).payload.apartment.area_m2, 41.9);
const alias = (await db.query("select raw_payload from cadastru_address_aliases limit 1")).rows[0];
assert.deepEqual(alias.raw_payload, { cadastral_number: number });
await buildings.storeSharedBuilding(parent, { ...building, total_floors: "6" });
assert.equal((await records.getCadastruRecordByNumber(number)).payload.building.total_floors, "6", "cached apartments use the updated shared building");
const old = new Date(Date.now() - 60 * 86400000).toISOString();
const oldExpiry = new Date(Date.now() - 30 * 86400000).toISOString();
await buildings.storeSharedBuilding(parent, { ...building, total_floors: "1", gas: "Da" }, { fetchedAt: old, expiresAt: oldExpiry });
cache.clear();
let shared = await buildings.getSharedBuilding(parent);
assert.equal(shared.payload.total_floors, "6", "out-of-order responses cannot replace newer fields");
assert.equal(Date.parse(shared.fieldFetchedAt.gas), Date.parse(old));
assert.equal(shared.expiresAt, oldExpiry, "old fields retain their refresh deadline");
assert.equal((await buildings.getBuildingFallback({ address: `${building.address}, ap 99` })).apartment_unavailable, true);
assert.equal(await buildings.getBuildingFallback({ address: "Chișinău, bd Decebal 63/1, ap 99" }), null);
const secondParent = "0100106.131.02";
await buildings.storeSharedBuilding(secondParent, building);
assert.equal(await buildings.getBuildingFallback({ address: `${building.address}, ap 99` }), null, "ambiguous building addresses are never guessed");
const partial = await buildings.getBuildingFallback({ number: "0100106.131.01.099" });
assert.deepEqual(clone(partial.apartment), {});
assert.equal(partial.cadastral_number, undefined, "missing units are not manufactured");

await records.persistCadastruAddressResult({ buildings: [], building_bundles: [{ cadastral_number: parent, building,
  apartments: [{ cadastral_number: "0100106.131.01.061", apartment: { address: `${building.address}, ap 61`, area_m2: 55 }, partial: true },
    { cadastral_number: "0100106.999.01.061", apartment: { area_m2: 999 } }] }] }, { officialFetch: true });
assert.equal((await records.getCadastruRecordByNumber("0100106.131.01.061")).payload.apartment.area_m2, 55);
assert.equal(await records.getCadastruRecordByNumber("0100106.999.01.061"), null);
await records.persistCadastruAddressResult({ building_bundles: [{ cadastral_number: parent, building: {},
  apartments: [{ cadastral_number: "0100106.131.01.062", apartment: { address: `${building.address}, ap 62` }, unit_list_entry: true, partial: true }] }] }, { officialFetch: true });
assert(await records.getCadastruRecordByNumber("0100106.131.01.062"), "verified registry links remain stored");
assert.equal(await records.getCadastruRecordByNumber("0100106.131.01.062", { requireDetailPayload: true }), null, "an identifier list cannot satisfy an apartment detail lookup");
assert.equal(await records.getCadastruRecordByAddress(`${building.address}, ap 62`, { requireUnitDetails: true }), null);
await records.persistCadastruRecord({ cadastral_number: number, apartment: { address: apartment.address, area_m2: null }, partial: true }, { officialFetch: true });
assert.equal((await records.getCadastruRecordByNumber(number)).payload.apartment.area_m2, 41.9, "partial refresh preserves known apartment fields");
await records.persistCadastruRecord({ cadastral_number: "0100106.333.01.001", building: { classifier: "Casă individuală", total_floors: "2" }, apartment: { area_m2: 120 } }, { officialFetch: true });
assert.equal((await db.query("select shared_building_number from cadastru_records where cadastral_number='0100106.333.01.001'")).rows[0].shared_building_number, null);
assert.equal((await records.getCadastruRecordByNumber("0100106.333.01.001")).payload.building.total_floors, "2");
assert.equal(caching.cleanCadastruPayload({ building_bundles: [{ apartments: [apartment] }] }).building_bundles, undefined);

const property = { cadastral_number: parent, address: building.address, object_type: "Construcție", area_m2: "1000" };
const aggregate = await records.persistCadastruAddressResult({ buildings: [property], building_bundles: [{ cadastral_number: parent,
  building, apartments: [] }] }, { officialFetch: true, requestAddress: building.address });
assert.equal(aggregate.buildings[0].area_m2, "1000");
const aggregateAlias = (await db.query("select raw_payload from cadastru_address_aliases where cadastral_number is null limit 1")).rows[0];
assert.equal(aggregateAlias.raw_payload.buildings[0].shared_building_reference, true);
assert.equal(aggregateAlias.raw_payload.buildings[0].area_m2, undefined);
assert.equal((await records.getCadastruRecordByNumber(parent)).payload.buildings[0].area_m2, "1000");
await buildings.storeSharedBuilding(parent, { registry: { ...property, area_m2: "1100" } });
assert.equal((await records.getCadastruRecordByAddress(building.address)).payload.buildings[0].area_m2, "1100", "aggregate aliases follow the canonical building");

await db.query("delete from cadastru_building_addresses where building_number=$1", [secondParent]);
let allowed = true, credits = 0, upstream = 0;
const offline = async () => { upstream++; throw Object.assign(new Error("offline"), { status: 503, code: "service_unavailable", fallbackEligible: true }); };
const routeMocks = { ...mocks,
  "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
  "@/lib/rate-limit": { rateLimit: () => ({ check: () => ({ allowed: true, remaining: 14 }) }) },
  "@/lib/access-tier": { resolveAccessTier: async () => ({ tier: "free", user_id: allowed ? "test-user" : null }) },
  "@/lib/paid-feature-usage": { checkFeatureAccess: async () => ({ allowed, reason: "no_credit" }),
    consumeFeatureCredit: async () => { credits++; return { allowed }; },
    makePaidFeatureUsageKey: (_feature, params) => JSON.stringify(params),
    buildFeatureCreditRequiredPayload: (_feature, reason) => ({ reason }) },
  "@/lib/cadastru-search-events": { logCadastruSearchEvent: async () => {} },
  "@/lib/cadastru-external-api": { fetchExternalCadastralData: offline, fetchExternalCadastruAddressData: offline },
  "@/lib/cadastru-address-search": { getVerifiedAddressAlternative: () => null,
    findCadastralByAddress: offline, fetchCadastruDetailData: offline },
};
const numberRoute = await loadAppModule("src/app/api/cadastral/route.js", routeMocks);
const addressRoute = await loadAppModule("src/app/api/cadastru/address/route.js", routeMocks);
const request = (body) => new Request("http://localhost/api/cadastral", { method: "POST",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify({ search_context: "cadastru", ...body }) });
let response = await numberRoute.POST(request({ cadastral_number: "0100106.131.01.099" }));
assert.equal(response.status, 200);
assert.equal((await response.json()).apartment_unavailable, true);
assert.equal(credits, 0, "building-only number fallback does not consume credits");
response = await addressRoute.POST(request({ city: "Chișinău", road_type: "bulevard", street: "Decebal", house_number: "63", apartment_number: "99" }));
assert.equal(response.status, 200);
assert.equal((await response.json()).apartment_unavailable, true);
assert.equal(credits, 0, "building-only address fallback does not consume credits");
allowed = false;
const preview = await (await numberRoute.POST(request({ cadastral_number: "0100106.131.01.099" }))).json();
assert.equal(preview.locked_sections.cadastru_details, true);
assert.notEqual(preview.building.total_floors, building.total_floors);
assert.equal((await numberRoute.POST(request({ cadastral_number: "0100106.131.01.099", skip_cache: true }))).status, 503);
allowed = true;
await db.query("update cadastru_records set next_refresh_after=$1 where cadastral_number=$2", [oldExpiry, number]);
cache.clear();
const stale = await (await numberRoute.POST(request({ cadastral_number: number }))).json();
assert.equal(stale.apartment.area_m2, 41.9);
assert.equal(stale.data_freshness.apartment.stale, true);
assert.equal(credits, 1);
assert(upstream >= 5);
const grants = await db.query("select has_table_privilege('anon','cadastru_buildings','SELECT') as exposed, has_function_privilege('anon','merge_cadastru_building(text,jsonb,timestamptz,timestamptz,jsonb)','EXECUTE') as callable");
assert.equal(grants.rows[0].exposed, false); assert.equal(grants.rows[0].callable, false);
await db.close();
console.log("Building regressions passed: SQL migration, atomic field merges, shared records/cache, aliases, partial refresh, bundle identity, non-block compatibility and permissions.");
