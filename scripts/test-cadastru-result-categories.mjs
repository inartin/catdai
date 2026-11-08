// pnpm exec node --experimental-vm-modules scripts/test-cadastru-result-categories.mjs
// Isolated telemetry, historical payload and cached-route checks; no network.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import path from "node:path";

const lookupId = "22222222-2222-4222-8222-222222222222";
const deviceId = "33333333-3333-4333-8333-333333333333";
const userId = "11111111-1111-4111-8111-111111111111";
const point = { latitude: 47.19, longitude: 28.34 };
const property = { cadastral_number: "2539207.0435", lands: [{ cadastral_number: "2539207.0435", map_location: point }],
  buildings: [{ cadastral_number: "2539207.0435.01" }, { cadastral_number: "2539207.0435.02" }],
  building: {}, apartment: {}, registry_unavailable: true };
const nearby = { location: point, categories: Object.fromEntries(
  ["schools", "supermarkets", "pharmacies", "food", "parks", "public_transport"].map((key) => [key, { places: [] }])) };
const transport = { scope: "nearby", route_groups: [] };
let collect = true, persist = true, visitor = { device_id: deviceId }, account = userId;
let records = [], events = [], readError = null;
const writes = [];
const searchLogs = [];
const environment = { NODE_ENV: "production" };
const admin = { from(table) {
  const filters = [];
  let values;
  const query = {
    select() { return query; },
    update(value) { values = value; return query; },
    eq(key, value) { filters.push((row) => (key.includes("->>")
      ? row[key.split("->>")[0]]?.[key.split("->>")[1]] : row[key]) === value); return query; },
    is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query; },
    in(key, list) { filters.push((row) => list.includes(key.includes("->>")
      ? row[key.split("->>")[0]]?.[key.split("->>")[1]] : row[key])); return query; },
    or(value) { assert.equal(value, `user_id.is.null,user_id.eq.${account}`);
      filters.push((row) => !row.user_id || row.user_id === account); return query; },
    order() { return query; },
    range(from, to) { return { data: events.filter((row) => filters.every((filter) => filter(row))).slice(from, to + 1), error: readError }; },
    then(resolve, reject) {
      assert.equal(table, "cadastru_search_events");
      writes.push(values);
      records.filter((row) => filters.every((filter) => filter(row))).forEach((row) => Object.assign(row, values));
      return Promise.resolve({ error: null }).then(resolve, reject);
    },
  };
  return query;
} };
const mocks = {
  "@/lib/supabase-admin": { supabaseAdmin: admin },
  "@/lib/statistics-context": { getStatisticsUserId: () => account, getStatisticsVisitor: () => visitor,
    shouldCollectStatistics: () => collect, withStatisticsContext: (handler) => handler },
  "@/lib/runtime-persistence": { shouldPersistRuntimeData: () => persist },
  "@/lib/cadastru-supported-cities": { resolveCadastruCityFromAddress: () => null, resolveCadastruSupportedCity: () => null },
  "@/lib/cadastru-location-storage": { cadastruLocationOriginKey: () => "test" },
  "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) }, after: () => {} },
  "@/lib/access-tier": { resolveAccessTier: async () => ({ tier: "paid", user_id: userId }) },
  "@/lib/cadastru-search-events": { logCadastruSearchEvent: async (_request, _type, options) => searchLogs.push(options) },
  "@/lib/cadastru-address-search": { fetchCadastruDetailData: () => assert.fail("No local lookup expected") },
  "@/lib/cadastru-preview": { buildCadastruPreviewPayload: (payload) => payload },
  "@/lib/cadastru-paid-history": { cadastruPaidHistoryMetadata: () => ({}) },
  "@/lib/cadastru-record-refresh": { scheduleCadastruNumberRefresh: () => {} },
  "@/lib/paid-feature-usage": { checkFeatureAccess: async () => ({ allowed: true }),
    consumeFeatureCredit: () => assert.fail("Outage fallback does not consume credits"), makePaidFeatureUsageKey: () => "test" },
  "@/lib/rate-limit": { rateLimit: () => ({ check: () => ({ allowed: true }) }) },
  "@/lib/cadastru-map-access": { canReadCadastruMapData: async () => true },
  "@/lib/cadastru-records": { getCadastruRecordByAddress: async () => null,
    getCadastruRecordByNumber: async () => ({ payload: property }), persistCadastruRecord: async () => null },
  "@/lib/cadastru-buildings": { getBuildingFallback: async () => null },
  "@/lib/cadastru-cache": { CADASTRU_TTL_SECONDS: 100, isFreshCadastru: () => true,
    cadastruPayloadExpiresAt: () => null, writeCadastruCache: () => null, cleanCadastruPayload: (payload) => payload,
    cadastruNeedsRefresh: () => false, withCadastruFreshness: (entry) => entry.payload },
  "@/lib/cadastru-nearby-storage": { getStoredNearby: async () => ({ payload: nearby }), storeNearby: async () => null,
    nearbyFromStorage: (entry) => entry.payload },
  "@/lib/cadastru-public-transport-storage": { getStoredPublicTransport: async () => ({ payload: transport }),
    storePublicTransport: async () => null, publicTransportFromStorage: (entry) => entry.payload },
  "@/lib/cadastru-refresh": { scheduleCadastruRefresh: () => assert.fail("Fresh cache must not refresh") },
  "@/lib/cadastru-external-api": { fetchExternalCadastralData: () => assert.fail("Cached primary must not call worker"),
    fetchExternalNearbyData: () => assert.fail("Cached nearby must not call worker"),
    fetchExternalPublicTransportData: () => assert.fail("Cached transport must not call worker") },
};
const context = vm.createContext({ console, process: { env: environment } });
const modules = new Map();
async function moduleFor(name) {
  if (modules.has(name)) return modules.get(name);
  const exports = mocks[name];
  const loadedModule = exports ? new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context }) : new vm.SourceTextModule(await fs.readFile(
    name.startsWith("@/") ? `src/${name.slice(2)}${name.endsWith(".js") ? "" : ".js"}` : name, "utf8"), { context, identifier: name });
  modules.set(name, loadedModule);
  return loadedModule;
}
async function load(name) {
  const loadedModule = await moduleFor(name);
  if (loadedModule.status === "unlinked") await loadedModule.link((specifier, parent) => moduleFor(specifier.startsWith(".")
    ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier)) : specifier));
  if (loadedModule.status === "linked") await loadedModule.evaluate();
  return loadedModule.namespace;
}
const { primaryCadastruResultCategories, cadastruResultSummary } = await load("@/lib/cadastru-result-categories");
assert.equal(primaryCadastruResultCategories(property, "no_data").result_cadastru, true);
assert.equal(primaryCadastruResultCategories(property, "no_data").result_map, true);
assert.equal(primaryCadastruResultCategories({ cadastral_number: property.cadastral_number }, "no_data").result_cadastru, false,
  "Echoing the query number is not a cadastral result");
assert.equal(cadastruResultSummary({ result_type: "error", result_nearby: true }).cadastru, false);
assert.equal(cadastruResultSummary({ result_type: "land_only" }).count, 1);

const { attachCadastruResultCategories, loadCadastruResultCategories } = await load("@/lib/admin-cadastru-result-categories");
const search = { id: 1, lookup_id: lookupId, result_type: "no_data", user_id: userId, visitor };
const event = (id, service, endpoint, data) => ({ id, service, endpoint, status: "success", user_id: null, visitor,
  response_headers: { "x-catdai-lookup-id": lookupId }, response_payload: { ok: true, data } });
events = [event(1, "cadastru_number", "/v1/cadastral", property), event(2, "cadastru_nearby", "/v1/nearby/address", nearby),
  { ...event(3, "cadastru_nearby", "/v1/public-transport", transport), status: "failure" }];
let summary = cadastruResultSummary((await loadCadastruResultCategories([search]))[0]);
assert.equal(summary.count, 3, "Screenshot lookup has cadastral, nearby and map results");
assert.equal(summary.cadastru, true);
events.push(...Array.from({ length: 201 }, (_, index) => event(4 + index, "cadastru_nearby", "/v1/public-transport", transport)));
assert.equal(cadastruResultSummary((await loadCadastruResultCategories([search]))[0]).count, 4,
  "Retries count a category once and hydration reads every page");
for (const changed of [{ user_id: "another-user" }, { visitor: { device_id: "another-browser" } },
  { response_headers: { "x-catdai-lookup-id": "another-lookup" } }]) {
  assert.equal(cadastruResultSummary(attachCadastruResultCategories([search], [{ ...events[0], ...changed }])[0]).count, 0);
}
assert.equal(cadastruResultSummary(attachCadastruResultCategories([search], [event(10, "cadastru_number", "/v1/cadastral", {
  cadastral_number: property.cadastral_number, building: { address: null }, apartment: {},
})])[0]).count, 0);
readError = { message: "offline" };
await assert.rejects(loadCadastruResultCategories([search]), /offline/);
readError = null;

const { recordCadastruResultCategories: record } = await load("@/lib/cadastru-result-category-tracking");
records = [search, { ...search, id: 2, visitor: { device_id: "another-browser" } },
  { ...search, id: 3, user_id: "another-user" }, { ...search, id: 4, duplicate_of: 1 }];
await Promise.all([record(lookupId, { result_nearby: true }), record(lookupId, { result_transport: true })]);
assert.equal(records[0].result_nearby, true);
assert.equal(records[0].result_transport, true);
for (const row of records.slice(1)) assert.equal(row.result_nearby, undefined, "Telemetry respects identity and duplicate boundaries");
await record(lookupId, { result_nearby: false, result_map: true, arbitrary_column: true });
assert.equal(records[0].result_nearby, true, "A later failure never erases a success");
assert.equal(records[0].arbitrary_column, undefined);
const writeCount = writes.length;
collect = false; await record(lookupId, { result_map: true }); collect = true;
persist = false; await record(lookupId, { result_map: true }); persist = true;
environment.NODE_ENV = "development"; await record(lookupId, { result_map: true }); environment.NODE_ENV = "production";
visitor = null; account = null; await record(lookupId, { result_map: true });
assert.equal(writes.length, writeCount, "Admin, development, disabled persistence and unidentified requests do not record activity");
visitor = { device_id: deviceId }; account = userId;

// Successful app cache responses record categories even without worker logs.
const nearbyRoute = await load("src/app/api/cadastru/nearby/route.js");
const transportRoute = await load("src/app/api/cadastru/public-transport/route.js");
records[0] = { ...search, result_nearby: null, result_transport: null };
const request = () => new Request("https://catdai.test/api/cadastru/nearby", { method: "POST",
  body: JSON.stringify({ cadastral_number: property.cadastral_number, lookup_id: lookupId }) });
assert.equal((await nearbyRoute.POST(request())).status, 200);
assert.equal((await transportRoute.POST(request())).status, 200);
assert.equal(records[0].result_nearby, true);
assert.equal(records[0].result_transport, true);
const numberRoute = await load("src/app/api/cadastral/route.js");
const numberRequest = () => new Request("https://catdai.test/api/cadastral", { method: "POST",
  body: JSON.stringify({ search_context: "cadastru", cadastral_number: property.cadastral_number, lookup_id: lookupId }) });
assert.equal((await numberRoute.POST(numberRequest())).status, 200);
assert.equal(searchLogs.at(-1).resultType, "address_only", "Number route classifies parcel/building collections as a result");
assert.equal(searchLogs.at(-1).lookupSource, "cache");
const buildings = property.buildings;
property.buildings = [];
assert.equal((await numberRoute.POST(numberRequest())).status, 200);
assert.equal(searchLogs.at(-1).resultType, "land_only", "Land-only classification remains distinct");
property.buildings = buildings;
console.log("Cadastru result categories passed: property collections, historical 3/4, pagination, identity, retries, exclusions and cached secondary responses.");
