// Isolated storage/route regression tests. No network or live database writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-storage.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import path from "node:path";

const cache = new Map();
const tables = { cadastru_records: [], cadastru_address_aliases: [], external_api_usage_events: [] };
let persistEnabled = true;
const clone = (value) => JSON.parse(JSON.stringify(value));
const supabaseAdmin = {
  rpc: async () => ({ error: null }),
  from(table) {
    const filters = [];
    let operation = "select", values, limit = Infinity;
    const query = {
      select() { return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query; },
      limit(value) { limit = value; return query; },
      insert(value) { operation = "insert"; values = value; return query; },
      update(value) { operation = "update"; values = value; return query; },
      upsert(value) { operation = "upsert"; values = value; return query; },
      then(resolve, reject) {
        try {
          let rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
          if (operation === "insert") {
            const row = { id: tables[table].length + 1, saved_at: new Date().toISOString(), ...clone(values), ...(values.cadastral_number ? { cadastral_number_digits: values.cadastral_number.replace(/\D/g, "") } : {}) };
            tables[table].push(row); rows = [row];
          }
          if (operation === "update") rows.forEach((row) => Object.assign(row, clone(values)));
          if (operation === "upsert") {
            let row = tables[table].find((item) => item.address_key === values.address_key);
            if (row) Object.assign(row, clone(values));
            else { row = clone(values); tables[table].push(row); }
            rows = [row];
          }
          return Promise.resolve({ data: clone(rows.slice(0, limit)), error: null }).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    return query;
  },
};
const baseMocks = {
  "node:crypto": { default: crypto },
  "@/lib/runtime-persistence": { shouldPersistRuntimeData: () => persistEnabled },
  "@/lib/supabase-admin": { supabaseAdmin },
  "@/lib/validation": { matchDistrict: () => null, CADASTRAL_RE: /^\d{7}\.\d+(?:\.\d+){0,2}$/ },
  "@/lib/cache": {
    getSharedCache: async (key) => cache.has(key) ? { value: clone(cache.get(key)) } : null,
    setSharedCache: async (key, value, ttl) => {
      assert(ttl > 0 && ttl <= 30 * 86400); cache.set(key, clone(value)); return true;
    },
  },
};
async function load(entry, extraMocks = {}, globals = {}) {
  const context = vm.createContext({ console, Date, URL, URLSearchParams, Request, Response, Headers, AbortSignal, Buffer, setTimeout, clearTimeout, process, ...globals });
  const modules = new Map(), mocks = { ...baseMocks, ...extraMocks };
  async function moduleFor(id) {
    if (modules.has(id)) return modules.get(id);
    let loadedModule;
    if (mocks[id]) {
      const exports = mocks[id];
      loadedModule = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    } else {
      const file = id.startsWith("@/") ? `src/${id.slice(2)}.js` : id;
      const source = await fs.readFile(file, "utf8");
      loadedModule = file.endsWith(".json")
        ? new vm.SyntheticModule(["default"], function () { this.setExport("default", JSON.parse(source)); }, { context })
        : new vm.SourceTextModule(source, { context, identifier: file });
    }
    modules.set(id, loadedModule);
    return loadedModule;
  }
  const loadedModule = await moduleFor(entry);
  // Let the VM link the whole graph once, including shared dependencies.
  await loadedModule.link((specifier, parent) => moduleFor(specifier.startsWith(".")
    ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier)) : specifier));
  await loadedModule.evaluate();
  return loadedModule.namespace;
}
const storage = await load("@/lib/cadastru-records");
const caching = await load("@/lib/cadastru-cache");
const address = "Chișinău, str Ștefan cel Mare 9 ap 12";
const structuredAddress = { city: "Chișinău", street: "Strada Ștefan cel Mare", houseNumber: "9", apartmentNumber: "12" };
const number = "0100201.999.01.012";
const payload = { cadastral_number: number, apartment: { address, area_m2: 64, unknown_field: { nested: [0, false, null] } }, building: { address: "Chișinău, str Ștefan cel Mare 9", construction_year: 1981 }, novel: { records: [{ value: "unexpected" }] }, access_tier: "paid", access_limit: { reason: "private" }, locked_sections: {} };
payload.map_location = { latitude: 47.14, longitude: 28.86 };
const expected = clone(payload);
delete expected.access_tier; delete expected.access_limit; delete expected.locked_sections;
await storage.persistCadastruRecord(payload, { officialFetch: true, structuredAddress });
assert.deepEqual(clone((await storage.getCadastruRecordByNumber(number)).payload), expected);
assert.deepEqual(clone((await storage.getCadastruRecordByAddress("chisinau STR. Stefan cel Mare 9 AP. 12", { structuredAddress })).payload), expected);
const firstExpiry = tables.cadastru_records[0].next_refresh_after;
await storage.persistCadastruRecord(payload, { officialFetch: false });
assert.equal(tables.cadastru_records[0].next_refresh_after, firstExpiry, "reads must not renew freshness");
cache.clear();
assert.deepEqual(clone((await storage.getCadastruRecordByAddress(address, { structuredAddress })).payload), expected, "DB restores full JSON");
assert.equal(await storage.getCadastruRecordByAddress("Chișinău str Other 9 ap 12", { structuredAddress: { ...structuredAddress, street: "Strada Other" } }), null, "same house/apartment on a different street must miss");
assert.equal(await storage.getCadastruRecordByAddress("Bălți str Ștefan cel Mare 9 ap 12", { structuredAddress: { ...structuredAddress, city: "Bălți" } }), null);
assert.equal(storage.recordMatchesStructuredAddress(tables.cadastru_records[0], "", { ...structuredAddress, houseNumber: "9/5" }), false);
assert.equal(storage.recordMatchesStructuredAddress(tables.cadastru_records[0], "", { ...structuredAddress, apartmentNumber: "13" }), false);
assert.equal(await storage.getCadastruRecordByAddress("Chișinău str Ștefan cel Mare 9", { structuredAddress: { ...structuredAddress, apartmentNumber: "" } }), null);

// Legacy snapshots may have a district only in the typed DB column while both Redis payloads are older.
const columnOnlyAddress = "Chișinău, bd. Decebal 63, ap. 4";
const columnOnlyNumber = "0100106.131.01.004";
await storage.persistCadastruAddressResult({
  cadastral_number: columnOnlyNumber,
  method: "address",
  apartment: { address: columnOnlyAddress, area_m2: 44.1 },
}, {
  requestAddress: columnOnlyAddress,
  structuredAddress: { city: "Chișinău", street: "Bulevard Decebal", houseNumber: "63", apartmentNumber: "4" },
  officialFetch: true,
});
const columnOnlyRow = tables.cadastru_records.find((row) => row.cadastral_number === columnOnlyNumber);
columnOnlyRow.district = "Botanica";
assert.equal((await caching.readCadastruCache("number", columnOnlyNumber)).payload.district, undefined);
assert.equal((await storage.getCadastruRecordByAddress(columnOnlyAddress)).payload.district, "Botanica", "address cache recovers the saved DB district");
assert.equal((await caching.readCadastruCache("number", columnOnlyNumber)).payload.district, "Botanica", "the repaired canonical result is cached");
cache.clear();
assert.equal((await storage.getCadastruRecordByAddress(columnOnlyAddress)).payload.district, "Botanica", "DB hydration includes column-only districts");

const russian = "Кишинев, ул Штефан чел Маре 9 кв 12";
await storage.persistCadastruAddressResult({ ...expected, method: "address", request_address: russian }, { requestAddress: russian, structuredAddress: { ...structuredAddress, street: "Strada Штефан чел Маре" }, officialFetch: true });
const updated = { ...expected, apartment: { ...expected.apartment, area_m2: 70 } };
await storage.persistCadastruRecord(updated, { officialFetch: true });
assert.equal((await storage.getCadastruRecordByAddress(russian)).payload.apartment.area_m2, 70, "old RO/RU aliases resolve the current canonical record");
cache.clear();
assert.equal((await storage.getCadastruRecordByAddress(russian)).payload.apartment.area_m2, 70);

const aggregateAddress = "Chișinău, bd Moscova 9/5";
const aggregate = { status: "success", matched_address: aggregateAddress, extra: { unknown: [false, 0] }, lands: [{ cadastral_number: "0100201.555", address: aggregateAddress, custom: { x: 1 } }], buildings: [{ cadastral_number: "0100201.555.01", address: aggregateAddress, unusual: [1, 2] }, { cadastral_number: "0100201.555.02", address: aggregateAddress, restrictions: "test" }] };
aggregate.lands[0].map_location = { latitude: 47.085198405, longitude: 28.89167763 };
aggregate.buildings[0].map_location = { latitude: 47.08525032, longitude: 28.89172716 };
await storage.persistCadastruAddressResult(aggregate, { requestAddress: aggregateAddress, structuredAddress: { city: "Chișinău", street: "Bulevard Moscova", houseNumber: "9/5", apartmentNumber: "" }, officialFetch: true });
cache.clear();
assert.deepEqual(clone((await storage.getCadastruRecordByAddress(aggregateAddress)).payload), aggregate);
assert.deepEqual(clone((await storage.getCadastruRecordByNumber(aggregate.lands[0].cadastral_number)).payload.map_location), aggregate.lands[0].map_location, "land coordinates belong to their own number record");
assert.deepEqual(clone((await storage.getCadastruRecordByNumber(aggregate.buildings[0].cadastral_number)).payload.map_location), aggregate.buildings[0].map_location, "building coordinates belong to their own number record");
const single = (await storage.getCadastruRecordByNumber("0100201.555.02")).payload;
assert.equal(single.buildings.length, 1); assert.equal(single.buildings[0].restrictions, "test");
assert.equal(single.lands, undefined, "individual numbers cannot return neighboring properties");
await storage.persistCadastruRecord(single, { officialFetch: false });
cache.clear();
assert.deepEqual(clone((await storage.getCadastruRecordByAddress(aggregateAddress)).payload), aggregate, "a number read must not replace its building-wide address snapshot");
const numericStreet = "Chișinău, str. 31 August 1989 14, ap. 7";
await storage.persistCadastruRecord({ cadastral_number: "0100201.888.01.007", apartment: { address: numericStreet, area_m2: 40 } }, { officialFetch: true });
const numericRow = tables.cadastru_records.find((row) => row.cadastral_number === "0100201.888.01.007");
assert.equal(numericRow.street, "str. 31 August 1989");
assert.equal(numericRow.house_number, "14");
assert.equal(numericRow.apartment_number, "7");

// Address-only refreshes keep richer details while saving the latest map location.
const coordinateNumber = "0100201.777.01.007";
const coordinateLocation = { latitude: 47.14, longitude: 28.86 };
await storage.persistCadastruRecord({ cadastral_number: coordinateNumber, apartment: { area_m2: 40 } }, { officialFetch: true });
const coordinateRow = tables.cadastru_records.find((row) => row.cadastral_number === coordinateNumber);
const coordinateExpiry = coordinateRow.next_refresh_after;
const originalHash = coordinateRow.payload_hash;
await storage.persistCadastruRecord({ cadastral_number: coordinateNumber, method: "address", district: "bOTANICA", map_location: coordinateLocation }, { officialFetch: true });
cache.clear();
let coordinatePayload = (await storage.getCadastruRecordByNumber(coordinateNumber)).payload;
assert.deepEqual(clone(coordinatePayload.map_location), coordinateLocation, "DB retains new coordinates alongside existing details");
assert.equal(coordinatePayload.district, "bOTANICA", "DB retains the worker district alongside existing details");
assert.equal(coordinateRow.district, "bOTANICA", "DB indexes the fresh worker district");
assert.equal(coordinatePayload.apartment.area_m2, 40);
assert.equal(coordinateRow.next_refresh_after, coordinateExpiry, "location update does not renew old detail freshness");
assert.notEqual(coordinateRow.payload_hash, originalHash);
await storage.persistCadastruRecord({ cadastral_number: coordinateNumber, method: "address" }, { officialFetch: true });
assert.deepEqual(clone((await storage.getCadastruRecordByNumber(coordinateNumber)).payload.map_location), coordinateLocation, "omitted coordinates preserve saved location");
await storage.persistCadastruRecord({ cadastral_number: coordinateNumber, method: "address", map_location: null }, { officialFetch: true });
cache.clear();
coordinatePayload = (await storage.getCadastruRecordByNumber(coordinateNumber)).payload;
assert.equal(coordinatePayload.map_location, null, "explicitly unavailable location survives DB reload");
assert.equal(coordinatePayload.apartment.area_m2, 40);

await storage.persistCadastruRecord({ cadastral_number: "0100201.111", mystery: { no_address: true } }, { officialFetch: true });
assert.equal((await storage.getCadastruRecordByNumber("0100201.111")).payload.mystery.no_address, true);
for (const row of tables.cadastru_records) row.next_refresh_after = "2020-01-01T00:00:00Z";
for (const row of tables.cadastru_address_aliases) row.expires_at = "2020-01-01T00:00:00Z";
cache.clear();
assert.equal(await storage.getCadastruRecordByNumber(number), null);
assert.equal(await storage.getCadastruRecordByAddress(address, { structuredAddress }), null);
assert.equal(await storage.getCadastruRecordByAddress(aggregateAddress), null);
assert.equal(caching.isFreshCadastru("invalid"), false);

persistEnabled = false;
await storage.persistCadastruAddressResult(aggregate, { requestAddress: aggregateAddress });
assert.deepEqual(clone((await storage.getCadastruRecordByAddress(aggregateAddress)).payload), aggregate, "Redis-only operation");
const aliasOnlyAddress = "Chișinău, bd. Decebal 63, ap. 5";
const aliasOnlyNumber = "0100106.131.01.005";
const aliasExpiry = caching.cadastruExpiresAt();
await caching.writeCadastruCache("number", aliasOnlyNumber, { payload: { cadastral_number: aliasOnlyNumber }, expiresAt: aliasExpiry });
await caching.writeCadastruCache("address", storage.normalizeCadastruAddressForDb(aliasOnlyAddress), {
  payload: { cadastral_number: aliasOnlyNumber, district: "bOTANICA" }, expiresAt: aliasExpiry,
});
assert.equal((await storage.getCadastruRecordByAddress(aliasOnlyAddress)).payload.district, "bOTANICA", "address alias district survives a Redis-only canonical hit");
persistEnabled = true;
console.log("Storage regressions passed: full JSON, number/address parity, aggregates, RO/RU aliases, exact matching, expiry, Redis fallback.");

cache.clear(); tables.cadastru_records.length = 0; tables.cadastru_address_aliases.length = 0;
let addressFetches = 0, numberFetches = 0, enrichFetches = 0;
let hasCredit = false;
let workerDistrict = "bOTANICA", workerError = null;
const routeMocks = {
  "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
  "@/lib/rate-limit": { rateLimit: () => ({ check: () => ({ allowed: true, remaining: 14 }) }) },
  "@/lib/access-tier": { resolveAccessTier: async () => ({ tier: "free", user_id: hasCredit ? "test-user" : null }) },
  "@/lib/paid-feature-usage": {
    checkFeatureAccess: async () => ({ allowed: hasCredit, reason: "no_credit" }),
    consumeFeatureCredit: async () => ({ allowed: hasCredit, reason: "no_credit" }),
    makePaidFeatureUsageKey: (_feature, params) => JSON.stringify(params),
    buildFeatureCreditRequiredPayload: (_feature, reason) => ({ reason }),
  },
  "@/lib/cadastru-search-events": { logCadastruSearchEvent: async () => {} },
  "@/lib/cadastru-external-api": {
    fetchExternalCadastruAddressData: async () => {
      addressFetches++;
      if (workerError) throw workerError;
      return { ...expected, ...(workerDistrict ? { district: workerDistrict } : {}), matched_address: address };
    },
    fetchExternalCadastralData: async () => { numberFetches++; return expected; },
  },
  "@/lib/cadastru-address-search": { getVerifiedAddressAlternative: () => null,
    findCadastralByAddress: async () => { throw Error("Unexpected local fallback"); },
    fetchCadastruDetailData: async () => { enrichFetches++; return null; },
  },
};
const addressRoute = await load("src/app/api/cadastru/address/route.js", routeMocks);
const numberRoute = await load("src/app/api/cadastral/route.js", routeMocks);
const request = (body) => new Request("http://localhost/api/cadastral", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ search_context: "cadastru", ...body }) });
const addressBody = { city: "Chisinau", road_type: "strada", street: "Ștefan cel Mare", house_number: "9", apartment_number: "012" };
await storage.persistCadastruAddressResult({ ...expected, method: "address", request_address: address }, {
  requestAddress: address, resolvedAddress: address, structuredAddress, lookupSource: "api", officialFetch: true,
});
const preview = await (await addressRoute.POST(request(addressBody))).json();
assert.equal(preview.full_access, false);
assert.equal(preview.district, "bOTANICA", "address previews retain the worker district for valuation prefill");
assert.equal(addressFetches, 1, "legacy cached apartment results without a district refresh once");
assert.equal((await storage.getCadastruRecordByNumber(number)).payload.district_lookup_checked, true);
assert.deepEqual(preview.map_location, expected.map_location, "address previews retain map coordinates");
assert.notEqual(preview.apartment.area_m2, 64);
assert.equal(tables.cadastru_records[0].raw_payload.apartment.area_m2, 64, "anonymous lookups store unmasked JSON");
assert.equal(tables.cadastru_records[0].raw_payload.access_limit, undefined);
const numberPreview = await (await numberRoute.POST(request({ cadastral_number: number }))).json();
assert.equal(numberPreview.full_access, false);
assert.deepEqual(numberPreview.map_location, expected.map_location, "number previews retain stored map coordinates");
assert.equal(numberFetches, 0, "address-saved details satisfy number lookup");
assert.equal(enrichFetches, 0, "fresh snapshots must not call enrichment again");
hasCredit = true;
const full = await (await numberRoute.POST(request({ cadastral_number: number }))).json();
assert.equal(full.apartment.area_m2, 64);
assert.equal(full.district_lookup_checked, undefined, "internal district refresh state is not exposed");
assert.deepEqual(full.map_location, expected.map_location, "full results retain stored map coordinates");
assert.equal(full.novel.records[0].value, "unexpected");
await addressRoute.POST(request({ ...addressBody, street: "Stefan cel Mare" }));
assert.equal(addressFetches, 1, "diacritic variants share a snapshot");
await addressRoute.POST(request({ ...addressBody, skip_cache: true }));
assert.equal(addressFetches, 2, "address skipcache bypasses Redis and DB");
await numberRoute.POST(request({ cadastral_number: number, skipcache: true }));
assert.equal(numberFetches, 1, "number skipcache bypasses Redis and DB");
assert.equal(enrichFetches, 1);
hasCredit = false;
await numberRoute.POST(request({ cadastral_number: number, skip_cache: true }));
assert.equal(numberFetches, 2);
assert.equal(tables.cadastru_records[0].raw_payload.apartment.area_m2, 64);
console.log("Route regressions passed: anonymous persistence, masked previews, cross-query hits, no live enrichment on hits, skipcache.");
cache.clear(); tables.cadastru_records.length = 0; tables.cadastru_address_aliases.length = 0;
await storage.persistCadastruAddressResult({ ...expected, method: "address", request_address: address }, {
  requestAddress: address, resolvedAddress: address, structuredAddress, lookupSource: "api", officialFetch: true,
});
workerDistrict = null;
const missingDistrictPreview = await (await addressRoute.POST(request(addressBody))).json();
assert.equal(missingDistrictPreview.district, null);
const fetchesAfterMissingDistrict = addressFetches;
await addressRoute.POST(request(addressBody));
assert.equal(addressFetches, fetchesAfterMissingDistrict, "a checked result without a district does not refresh repeatedly");
cache.clear(); tables.cadastru_records.length = 0; tables.cadastru_address_aliases.length = 0;
await storage.persistCadastruAddressResult({ ...expected, method: "address", request_address: address }, {
  requestAddress: address, resolvedAddress: address, structuredAddress, lookupSource: "api", officialFetch: true,
});
workerError = Object.assign(new Error("offline"), { code: "service_unavailable", fallbackEligible: true });
const staleFallback = await addressRoute.POST(request(addressBody));
assert.equal(staleFallback.status, 200, "a failed district refresh still serves the stored result");
workerDistrict = "bOTANICA"; workerError = null;
const { buildCadastruPreviewPayload } = await load("@/lib/cadastru-preview", routeMocks);
assert.equal(buildCadastruPreviewPayload({ map_location: null }).map_location, null);
assert.equal(buildCadastruPreviewPayload({}).map_location, null);
const aggregatePreview = buildCadastruPreviewPayload(aggregate);
assert.deepEqual(clone(aggregatePreview.lands[0].map_location), aggregate.lands[0].map_location, "land preview coordinates survive masking");
assert.deepEqual(clone(aggregatePreview.buildings[0].map_location), aggregate.buildings[0].map_location, "building preview coordinates survive masking");
assert.notEqual(aggregatePreview.lands[0].cadastral_number, aggregate.lands[0].cadastral_number, "property registry details remain masked");

// Street resolution happens before cache access and is shared by worker/fallback paths.
cache.clear(); tables.cadastru_records.length = 0; tables.cadastru_address_aliases.length = 0;
let streetFetches = 0, fallbackCalls = 0, externalFailure = null;
const grenobleAddress = "Chișinău, str Grenoble 259/14 ap 18";
const grenoblePayload = { cadastral_number: "0100201.999.01.018", apartment: { address: grenobleAddress, area_m2: 50 } };
const streetRoute = await load("src/app/api/cadastru/address/route.js", {
  ...routeMocks,
  "@/lib/cadastru-external-api": { fetchExternalCadastruAddressData: async (fields) => {
    streetFetches++;
    assert.equal(fields.street, "Grenoble");
    assert.equal(fields.house_number, "259/14");
    assert.equal(fields.apartment_number, "18");
    if (externalFailure) throw externalFailure;
    return grenoblePayload;
  } },
  "@/lib/cadastru-address-search": { getVerifiedAddressAlternative: () => null, findCadastralByAddress: async (address) => {
    fallbackCalls++; assert.equal(address, grenobleAddress); return grenoblePayload;
  } },
});
const streetBody = { city: "Chișinău", road_type: "strada", street: "гренобля", house_number: "259/14", apartment_number: "18" };
hasCredit = false;
let streetResponse = await (await streetRoute.POST(request(streetBody))).json();
assert.equal(streetResponse.street_resolution.resolved, "Grenoble");
assert.equal(streetResponse.full_access, false);
assert(tables.cadastru_address_aliases.some((row) => row.address_key.includes("гренобля")));
assert(tables.cadastru_address_aliases.some((row) => row.address_key.includes("grenoble")));
hasCredit = true;
streetResponse = await (await streetRoute.POST(request({ ...streetBody, street: "гренобле" }))).json();
assert.equal(streetResponse.street_resolution.original, "гренобле", "cache metadata belongs to this request");
assert.equal(streetResponse.apartment.area_m2, 50);
assert.equal(streetFetches, 1, "different aliases share the canonical cache");
let ambiguous = await streetRoute.POST(request({ ...streetBody, street: "Belgra" }));
assert.equal(ambiguous.status, 422);
assert.deepEqual((await ambiguous.json()).suggestions, ["Belgrad", "Bulgară"]);
assert.equal(streetFetches, 1);
externalFailure = Object.assign(new Error("choose"), { code: "ambiguous_street", status: 422, suggestions: ["Grenoble"] });
ambiguous = await streetRoute.POST(request({ ...streetBody, skip_cache: true }));
assert.equal(ambiguous.status, 422);
assert.deepEqual((await ambiguous.json()).suggestions, ["Grenoble"]);
assert.equal(fallbackCalls, 0);
externalFailure = Object.assign(new Error("offline"), { fallbackEligible: true });
streetResponse = await (await streetRoute.POST(request({ ...streetBody, skip_cache: true }))).json();
assert.equal(fallbackCalls, 1);
assert.equal(streetResponse.resolved_address, grenobleAddress);
assert.equal(streetResponse.street_resolution.original, "гренобля");
console.log("Street route regressions passed: shared cache, aliases, previews, ambiguity, worker errors, canonical fallback.");

const adapter = await load("@/lib/cadastru-external-api", {
  "@/lib/external-api-usage": { getExternalApiDiagnosticHeaders: () => ({}), trackExternalApiUsage: () => {} },
}, {
  process: { env: { CADASTRU_EXTERNAL_API_BASE_URL: "https://worker.test/", CADASTRU_EXTERNAL_API_SECRET: "test-only" } },
  fetch: async () => Response.json({ ok: false, error: "ambiguous_street", suggestions: ["Belgrad", null, 42, "Bulgară"] }, { status: 422 }),
});
await assert.rejects(adapter.fetchExternalCadastruAddressData(streetBody), (error) => {
  assert.equal(error.code, "ambiguous_street");
  assert.equal(error.status, 422);
  assert.equal(error.fallbackEligible, false);
  assert.deepEqual([...error.suggestions], ["Belgrad", "Bulgară"]);
  return true;
});
const aliasesBeforeFailure = clone(tables.cadastru_address_aliases);
externalFailure = Object.assign(new Error("missing"), { status: 404, code: "not_found" });
assert.equal((await streetRoute.POST(request({ ...streetBody, skip_cache: true }))).status, 404);
assert.deepEqual(tables.cadastru_address_aliases, aliasesBeforeFailure);
console.log("Worker adapter regressions passed: typed suggestions, no fallback on ambiguity, no alias writes after failure.");

// Suggestions are generated only after the actual address has no result.
const { suggestRoadTypes, suggestStreets } = await load("@/lib/cadastru-street-suggestions");
for (const street of ["Radiceva", "Radischev", "Radișcev", "Радищева", "Radishcheva"]) {
  const suggestions = clone(suggestStreets({ city: "Balti", roadType: "str", street }));
  assert.equal(suggestions[0], "Alexandr Radișcev", street);
  assert(suggestions.length <= 3);
}
for (const street of ["G. Cosbuc", "G Cosbuc", "G. Coșbuk", "Д. Кошбука"]) {
  assert.equal(suggestStreets({ city: "Balti", roadType: "str", street })[0], "George Coșbuc", street);
}
assert(!suggestStreets({ city: "Balti", roadType: "str", street: "X. Cosbuc" }).includes("George Coșbuc"));
assert.deepEqual(clone(suggestStreets({ city: "Balti", roadType: "bd", street: "G. Cosbuc" })), []);
assert.deepEqual(clone(suggestStreets({ city: "Unknown", roadType: "str", street: "G. Cosbuc" })), []);
assert.deepEqual(clone(suggestStreets({ city: "Balti", roadType: "bd", street: "Radischev" })), []);
assert.deepEqual(clone(suggestStreets({ city: "Unknown", roadType: "str", street: "Radischev" })), []);
assert.deepEqual(clone(suggestStreets({ city: "Balti", roadType: "str", street: "xyzqwk" })), []);
assert.deepEqual(clone(suggestStreets({ city: "Balti", roadType: "str", street: "Ra" })), []);
assert(!suggestStreets({ city: "Balti", roadType: "str", street: "Alexandr Radișcev" }).includes("Alexandr Radișcev"));
assert(!suggestStreets({ city: "Chișinău", roadType: "str", street: "31 August 1988" }).includes("31 August 1989"));
assert.deepEqual(clone(suggestRoadTypes({ city: "Chișinău", roadType: "bd", street: "Miron costin" })),
  [{ road_type: "strada", street: "Miron Costin" }]);
assert.deepEqual(clone(suggestRoadTypes({ city: "Chișinău", roadType: "str", street: "Decebal" })),
  [{ road_type: "bulevard", street: "Decebal" }]);
assert.deepEqual(clone(suggestRoadTypes({ city: "Chișinău", roadType: "str", street: "Miron Costin" })), []);
assert.deepEqual(clone(suggestRoadTypes({ city: "Chișinău", roadType: "bd", street: "Decebal" })), []);
assert.deepEqual(clone(suggestRoadTypes({ city: "Unknown", roadType: "bd", street: "Miron Costin" })), []);

let suggestionFailure = Object.assign(new Error("missing"), { status: 404, code: "not_found" });
let backupFailure = Object.assign(new Error("Could not match land or buildings for Balti."), { code: "not_found" });
let backupLookups = 0;
const submitted = [];
const suggestionsRoute = await load("src/app/api/cadastru/address/route.js", {
  ...routeMocks,
  "@/lib/cadastru-external-api": { fetchExternalCadastruAddressData: async (fields) => {
    submitted.push(fields);
    if (suggestionFailure) throw suggestionFailure;
    return { lands: [{ cadastral_number: "0300101.001", address: `Bălți, str ${fields.street} ${fields.house_number}` }] };
  } },
  "@/lib/cadastru-address-search": { getVerifiedAddressAlternative: () => null, findCadastralByAddress: async () => { backupLookups++; throw backupFailure; } },
});
const baltiRequest = { city: "Bălți", road_type: "strada", street: "Radiceva", house_number: "28", apartment_number: "7", skip_cache: true, search_context: "cadastru" };
const abbreviatedBody = { ...baltiRequest, street: "G. Cosbuc", house_number: "13", apartment_number: "18" };
let abbreviated = await suggestionsRoute.POST(request(abbreviatedBody));
assert.equal(abbreviated.status, 404);
assert.equal(submitted.at(-1).street, "George Coșbuc", "initials expand before the external lookup");
assert.equal(submitted.at(-1).house_number, "13");
assert.equal(submitted.at(-1).apartment_number, "18");
suggestionFailure = null;
abbreviated = await suggestionsRoute.POST(request(abbreviatedBody));
assert.equal(abbreviated.status, 200);
const abbreviatedPayload = await abbreviated.json();
assert.equal(abbreviatedPayload.request_address, "Bălți, str G. Cosbuc 13 ap 18");
assert.equal(abbreviatedPayload.resolved_address, "Bălți, str George Coșbuc 13 ap 18");
assert.equal(abbreviatedPayload.street_resolution.status, "abbreviation");
suggestionFailure = Object.assign(new Error("missing"), { status: 404, code: "not_found" });
submitted.length = 0;
const aliasesBeforeSuggestions = clone(tables.cadastru_address_aliases);
let suggested = await suggestionsRoute.POST(request(baltiRequest));
assert.equal(suggested.status, 404);
assert.equal((await suggested.json()).suggestions[0], "Alexandr Radișcev");
assert.equal(submitted[0].street, "Radiceva", "original spelling is attempted before suggesting alternatives");
assert.equal(submitted.length, 1, "suggestions do not trigger speculative lookups");
assert.deepEqual(tables.cadastru_address_aliases, aliasesBeforeSuggestions);
suggestionFailure = null;
suggested = await suggestionsRoute.POST(request({ ...baltiRequest, street: "Alexandr Radișcev" }));
assert.equal(suggested.status, 200);
assert.equal((await suggested.json()).suggestions, undefined);
assert.equal(submitted.at(-1).house_number, "28");
assert.equal(submitted.at(-1).apartment_number, "7");
suggestionFailure = Object.assign(new Error("offline"), { status: 502 });
suggested = await suggestionsRoute.POST(request(baltiRequest));
assert.equal(suggested.status, 502);
assert.equal((await suggested.json()).suggestions, undefined);
suggestionFailure.fallbackEligible = true;
suggested = await suggestionsRoute.POST(request(baltiRequest));
assert.equal((await suggested.json()).suggestions[0], "Alexandr Radișcev");
backupFailure = Object.assign(new Error("timeout"), { name: "TimeoutError" });
suggested = await suggestionsRoute.POST(request(baltiRequest));
assert.equal(suggested.status, 503);
const timeoutPayload = await suggested.json();
assert.equal(timeoutPayload.error, "service_unavailable");
assert.equal(timeoutPayload.suggestions, undefined);
const wrongRoadType = { city: "Chișinău", road_type: "bulevard", street: "Miron costin",
  house_number: "114", apartment_number: "24", skip_cache: true, search_context: "cadastru" };
suggestionFailure = Object.assign(new Error("missing"), { status: 404, code: "not_found" });
let roadTypeResponse = await suggestionsRoute.POST(request(wrongRoadType));
assert.equal(roadTypeResponse.status, 404);
assert.deepEqual(clone((await roadTypeResponse.json()).road_type_suggestions),
  [{ road_type: "strada", street: "Miron Costin" }]);
assert.equal(submitted.at(-1).road_type, "bulevard", "the original road type is searched first");
suggestionFailure = Object.assign(new Error("timeout"), { code: "external_cadastru_timeout", fallbackEligible: true });
const previousBackupLookups = backupLookups;
roadTypeResponse = await suggestionsRoute.POST(request(wrongRoadType));
assert.equal(roadTypeResponse.status, 503);
assert.deepEqual(clone((await roadTypeResponse.json()).road_type_suggestions),
  [{ road_type: "strada", street: "Miron Costin" }]);
assert.equal(submitted.at(-1).road_type, "bulevard", "the timeout does not trigger an automatic retry");
assert.equal(backupLookups, previousBackupLookups, "known road-type mismatch skips the repeated slow local lookup after worker timeout");
console.log("Did-you-mean regressions passed: RO/RU spellings, scope, original lookup first, no-data-only suggestions, retry identity and timeout exclusion.");

// Ambiguous initials must offer full names before any cache or provider lookup.
const { createStreetResolver, normalizeStreetName, inspectStreetAddress } = await load("@/lib/cadastru-streets/street-resolver");
const initialsResolver = createStreetResolver([
  { city: "Bălți", road_type: "str", street: "George Coșbuc" },
  { city: "Bălți", road_type: "str", street: "Gheorghe Coșbuc" },
]);
const ambiguousInitialsRoute = await load("src/app/api/cadastru/address/route.js", {
  ...routeMocks,
  "@/lib/cadastru-streets/street-resolver": { resolveStreet: initialsResolver, normalizeStreetName, inspectStreetAddress },
  "@/lib/cadastru-records": { getCadastruRecordByAddress: () => { throw new Error("Ambiguity must not read cache"); }, persistCadastruAddressResult: () => { throw new Error("Ambiguity must not write cache"); } },
  "@/lib/cadastru-external-api": { fetchExternalCadastruAddressData: () => { throw new Error("Ambiguity must not query worker"); } },
});
const ambiguousInitials = await ambiguousInitialsRoute.POST(request(abbreviatedBody));
assert.equal(ambiguousInitials.status, 422);
assert.deepEqual((await ambiguousInitials.json()).suggestions, ["George Coșbuc", "Gheorghe Coșbuc"]);

// Pasted street/house conflicts are input errors, before cache and provider calls.
let inputConflictPending = true;
const inputSubmissions = [];
const inputRoute = await load("src/app/api/cadastru/address/route.js", {
  ...routeMocks,
  "@/lib/cadastru-records": {
    getCadastruRecordByAddress: async () => { assert.equal(inputConflictPending, false, "conflict must not read cache"); return null; },
    persistCadastruAddressResult: async (payload) => { assert.equal(inputConflictPending, false, "conflict must not save aliases"); return payload; },
  },
  "@/lib/cadastru-external-api": { fetchExternalCadastruAddressData: async (fields) => {
    assert.equal(inputConflictPending, false, "conflict must not call provider");
    inputSubmissions.push(fields);
    return { cadastral_number: "0100111.083.01.016", apartment: { address: `Chișinău, bd Dacia ${fields.house_number} ap 16`, area_m2: 60 } };
  } },
});
const pastedBody = { city: "Chișinău", road_type: "bulevard", street: "DACIA BD. 47/2", house_number: "47", apartment_number: "16", search_context: "cadastru" };
let inputResponse = await inputRoute.POST(request(pastedBody));
assert.equal(inputResponse.status, 422);
const inputConflict = await inputResponse.json();
assert.equal(inputConflict.error, "address_fields_conflict");
assert.deepEqual(inputConflict.corrections, [{ street: "Dacia", house_number: "47/2" }, { street: "Dacia", house_number: "47" }]);
assert.equal(inputSubmissions.length, 0);
inputConflictPending = false;
for (const correction of inputConflict.corrections) {
  inputResponse = await inputRoute.POST(request({ ...pastedBody, ...correction, skip_cache: true }));
  assert.equal(inputResponse.status, 200);
  assert.equal(inputSubmissions.at(-1).street, "Dacia");
  assert.equal(inputSubmissions.at(-1).house_number, correction.house_number);
  assert.equal(inputSubmissions.at(-1).apartment_number, "16");
}
inputResponse = await inputRoute.POST(request({ ...pastedBody, house_number: "47/2", skip_cache: true }));
const cleanedInput = await inputResponse.json();
assert.equal(inputResponse.status, 200);
assert.equal(cleanedInput.street_resolution.status, "cleaned");
assert.equal(cleanedInput.request_address, "Chișinău, bd DACIA BD. 47/2 47/2 ap 16");
assert.equal(cleanedInput.resolved_address, "Chișinău, bd Dacia 47/2 ap 16");
console.log("Pasted address regressions passed: no calls/cache on conflict, explicit choices, unchanged apartments, redundant cleanup.");

// Exercise actual worker telemetry, signed correlation and route recovery with isolated DB/fetch mocks.
cache.clear(); tables.cadastru_records.length = 0; tables.cadastru_address_aliases.length = 0;
tables.external_api_usage_events.length = 0;
const recoveryMocks = { ...routeMocks };
delete recoveryMocks["@/lib/cadastru-external-api"];
let backupHasResult = false;
recoveryMocks["@/lib/cadastru-address-search"] = {
  getVerifiedAddressAlternative: () => null,
  findCadastralByAddress: async () => {
    if (!backupHasResult) throw Object.assign(new Error("Could not match land or buildings for Balti."), { code: "not_found" });
    return { lands: [{ cadastral_number: "0300101.001", address: "Bălți, str Alexandr Radișcev 28" }] };
  },
};
const recoveryEnv = { NODE_ENV: "production", CADASTRU_EXTERNAL_API_BASE_URL: "https://worker.test/", CADASTRU_EXTERNAL_API_SECRET: "test-only" };
let workerMissing = true, workerUnavailable = false, workerRequests = 0;
const workerFetch = async (_url, options) => {
  workerRequests++;
  const fields = JSON.parse(options.body);
  assert.equal(fields.suggestion_recovery_token, undefined, "correlation is never sent to the worker");
  if (workerUnavailable) return Response.json({ ok: false, error: "offline" }, { status: 502 });
  if (workerMissing) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  return Response.json({ ok: true, data: { cadastral_number: "0300101.001.01.007", apartment: { address: "Bălți, str Alexandr Radișcev 28 ap 7", area_m2: 50 } } });
};
const recoveryRoute = await load("src/app/api/cadastru/address/route.js", recoveryMocks, { process: { env: recoveryEnv }, fetch: workerFetch });
const createFailure = async () => {
  workerMissing = true;
  const response = await recoveryRoute.POST(request(baltiRequest));
  assert.equal(response.status, 404);
  const failure = await response.json();
  assert(failure.suggestion_recovery_token, "failed event exists before returning its retry token");
  const event = tables.external_api_usage_events.at(-1);
  assert.equal(event.status, "failure");
  assert.equal(event.request_payload.street, "Radiceva");
  assert.equal(event.request_payload.apartment_number, "7", "failed worker logs retain the submitted apartment number");
  return { failure, event };
};
const retryBody = (failure) => ({ ...baltiRequest, street: failure.suggestions[0], suggestion_recovery_token: failure.suggestion_recovery_token });
let failed = await createFailure();
const buildingFailure = await recoveryRoute.POST(request({ ...baltiRequest, apartment_number: "" }));
assert.equal(buildingFailure.status, 404);
assert.equal(Object.hasOwn(tables.external_api_usage_events.at(-1).request_payload, "apartment_number"), false, "building-only failures omit an apartment that was not entered");
let retry = await recoveryRoute.POST(request(retryBody(failed.failure)));
assert.equal(retry.status, 404);
assert.equal(failed.event.suggestion_recovery, undefined, "a clicked suggestion that fails is not recovery");
workerMissing = false;
hasCredit = false;
retry = await recoveryRoute.POST(request(retryBody(failed.failure)));
assert.equal(retry.status, 200);
assert.equal((await retry.json()).full_access, false, "masked previews still count as found results");
assert.equal(failed.event.status, "failure", "recovered rows remain in the Failed filter");
assert.equal(failed.event.suggestion_recovery.suggested_street, "Alexandr Radișcev");
assert.equal(failed.event.suggestion_recovery.lookup_source, "api");
const firstRecovery = clone(failed.event.suggestion_recovery);
await recoveryRoute.POST(request(retryBody(failed.failure)));
assert.deepEqual(failed.event.suggestion_recovery, firstRecovery, "first successful retry is retained");

failed = await createFailure();
workerMissing = false;
const callsBeforeCacheRetry = workerRequests;
retry = await recoveryRoute.POST(request({ ...retryBody(failed.failure), skip_cache: false }));
assert.equal(retry.status, 200);
assert.equal(workerRequests, callsBeforeCacheRetry, "corrected address may come from the cache");
assert.equal(failed.event.suggestion_recovery.lookup_source, "cache");

failed = await createFailure();
workerUnavailable = true;
backupHasResult = true;
retry = await recoveryRoute.POST(request(retryBody(failed.failure)));
assert.equal(retry.status, 200);
assert.equal(failed.event.suggestion_recovery.lookup_source, "local", "local backup success recovers the original failed call");
workerUnavailable = false;
backupHasResult = false;

failed = await createFailure();
workerMissing = false;
await recoveryRoute.POST(request({ ...retryBody(failed.failure), suggestion_recovery_token: undefined }));
assert.equal(failed.event.suggestion_recovery, undefined, "manual corrected searches do not mark the failed call");
await recoveryRoute.POST(request({ ...retryBody(failed.failure), house_number: "29" }));
assert.equal(failed.event.suggestion_recovery, undefined, "a different property cannot recover the failed call");
await recoveryRoute.POST(request({ ...retryBody(failed.failure), suggestion_recovery_token: `${failed.failure.suggestion_recovery_token}x` }));
assert.equal(failed.event.suggestion_recovery, undefined, "tampered tokens cannot annotate telemetry");
const recoveryHelpers = await load("@/lib/cadastru-suggestion-recovery", {}, { process: { env: recoveryEnv } });
const tokenAddress = { city: "Bălți", roadType: "str", street: "Alexandr Radișcev", houseNumber: "28", apartmentNumber: "7" };
assert(recoveryHelpers.readSuggestionRecoveryToken(failed.failure.suggestion_recovery_token, tokenAddress));
for (const changes of [{ city: "Chișinău" }, { roadType: "bd" }, { apartmentNumber: "8" }, { street: "Grenoble" }]) {
  assert.equal(recoveryHelpers.readSuggestionRecoveryToken(failed.failure.suggestion_recovery_token, { ...tokenAddress, ...changes }), null);
}
const futureHelpers = await load("@/lib/cadastru-suggestion-recovery", {}, {
  process: { env: recoveryEnv }, Date: class extends Date { static now() { return Date.now() + 61 * 60 * 1000; } },
});
assert.equal(futureHelpers.readSuggestionRecoveryToken(failed.failure.suggestion_recovery_token, tokenAddress), null, "tokens expire after one hour");

const developmentRoute = await load("src/app/api/cadastru/address/route.js", recoveryMocks, {
  process: { env: { ...recoveryEnv, NODE_ENV: "development" } }, fetch: workerFetch,
});
const eventsBeforeDev = tables.external_api_usage_events.length;
await developmentRoute.POST(request(retryBody(failed.failure)));
assert.equal(tables.external_api_usage_events.length, eventsBeforeDev);
assert.equal(failed.event.suggestion_recovery, undefined, "development retries do not update production statistics");
workerMissing = true;
const devFailure = await (await developmentRoute.POST(request(baltiRequest))).json();
assert.equal(devFailure.suggestion_recovery_token, undefined);
console.log("Suggestion recovery regressions passed: failed versus successful clicks, previews, cache/local results, original status, first success, manual edits, token tampering/expiry, property identity and development suppression.");

// A confirmation response does not persist a property result or consume a credit.
const houseFields = { city: "Chișinău", road_type: "strada", street: "Ion Creangă", house_number: "82", apartment_number: "167", skip_cache: true };
const houseAlternative = { city: "Chișinău", road_type: "strada", street: "Ion Creangă", house_number: "82/1", apartment_number: "167" };
let houseWrites = 0, houseCredits = 0, houseBackup = 0, houseWorkerCalls = 0, houseUnavailable = false, houseConfirmed = false, houseCachedMatch = null;
const houseRoute = await load("src/app/api/cadastru/address/route.js", {
  ...routeMocks,
  "@/lib/cadastru-records": { getCadastruRecordByAddress: async () => null,
    persistCadastruAddressResult: async (payload, options) => {
      houseWrites++; assert.equal(options.requestAddress, "Chișinău, str Ion Creangă 82/1 ap 167"); return payload;
    } },
  "@/lib/paid-feature-usage": { ...routeMocks["@/lib/paid-feature-usage"],
    checkFeatureAccess: async () => { houseCredits++; return { allowed: true }; },
    consumeFeatureCredit: async () => { houseCredits++; return { allowed: true }; } },
  "@/lib/cadastru-external-api": { fetchExternalCadastruAddressData: async (fields) => {
    houseWorkerCalls++;
    if (houseConfirmed) {
      assert.equal(fields.house_number, "82/1");
      return { cadastral_number: "0100511.115.01.167", matched_address: "Chișinău, str Ion Creangă 82/1" };
    }
    if (houseUnavailable) throw Object.assign(new Error("offline"), { code: "service_unavailable", fallbackEligible: true });
    assert.equal(fields.house_number, "82");
    throw Object.assign(new Error("confirm"), { code: "address_confirmation_required", status: 422,
      addressSuggestions: [houseAlternative, { ...houseAlternative, city: "Bălți" }, { ...houseAlternative, house_number: "83/1" },
        { ...houseAlternative, apartment_number: "168" }] });
  } },
  "@/lib/cadastru-address-search": { getVerifiedAddressAlternative: (address) => {
    if (houseCachedMatch) assert.equal(address, "Chișinău, str Ion Creangă 82/1 ap 167");
    return houseCachedMatch;
  }, findCadastralByAddress: async () => {
    houseBackup++;
    throw Object.assign(new Error("confirm"), { code: "address_confirmation_required", address_suggestions: [houseAlternative] });
  } },
});
let houseResponse = await houseRoute.POST(request(houseFields));
assert.equal(houseResponse.status, 422);
assert.deepEqual(clone((await houseResponse.json()).address_suggestions), [houseAlternative]);
assert.equal(houseWrites, 0); assert.equal(houseCredits, 0); assert.equal(houseBackup, 0);
houseUnavailable = true;
houseResponse = await houseRoute.POST(request(houseFields));
assert.equal(houseResponse.status, 422, "verified local suggestion takes precedence over a failed worker");
assert.equal(houseWrites, 0); assert.equal(houseCredits, 0); assert.equal(houseBackup, 1);
houseConfirmed = true;
houseResponse = await houseRoute.POST(request({ ...houseFields, house_number: "82/1" }));
assert.equal(houseResponse.status, 200);
assert.equal(houseWrites, 1); assert.equal(houseCredits, 1);

houseConfirmed = false;
houseCachedMatch = { cadastral_number: "0100511.115.01.167", matched_address: "Chișinău, str Ion Creangă 82/1" };
const houseCallsBeforeCache = houseWorkerCalls;
houseResponse = await houseRoute.POST(request({ ...houseFields, house_number: "82/1" }));
assert.equal(houseResponse.status, 200, "cached local confirmation skips the unavailable worker");
assert.equal(houseWorkerCalls, houseCallsBeforeCache);
assert.equal(houseBackup, 1); assert.equal(houseWrites, 2); assert.equal(houseCredits, 2);
houseCachedMatch = null;

let houseTimeout;
const houseAdapter = await load("@/lib/cadastru-external-api", {
  "@/lib/external-api-usage": { getExternalApiDiagnosticHeaders: () => ({}), trackExternalApiUsage: () => {} },
}, {
  process: { env: { CADASTRU_EXTERNAL_API_BASE_URL: "https://worker.test/", CADASTRU_EXTERNAL_API_SECRET: "test-only" } },
  AbortSignal: { timeout: (ms) => { houseTimeout = ms; return AbortSignal.timeout(ms); } },
  fetch: async () => Response.json({ ok: false, error: "address_confirmation_required",
    address_suggestions: [houseAlternative, null, { city: "Chișinău" }] }, { status: 422 }),
});
await assert.rejects(houseAdapter.fetchExternalCadastruAddressData(houseFields, { trackUsage: false }), (error) => {
  assert.equal(error.code, "address_confirmation_required"); assert.equal(error.status, 422);
  assert.equal(error.fallbackEligible, false); assert.deepEqual(clone(error.addressSuggestions), [houseAlternative]); return true;
});
assert.equal(houseTimeout, 45_000, "address lookups allow the registry fallback to finish");

let houseLocalCalls = 0, houseLocalDown = false, houseLocalNow = Date.now();
const houseLocal = await load("@/lib/cadastru-address-search", {}, { Date: class extends Date { static now() { return houseLocalNow; } }, fetch: async (url, options = {}) => {
  houseLocalCalls++;
  if (houseLocalDown) throw new Error("offline");
  const host = new URL(url).hostname;
  if (host === "nominatim.openstreetmap.org") return Response.json([]);
  assert.equal(host, "www.cadastru.md");
  if (options.method !== "POST") return new Response('<input name="p_instance" value="12345">');
  const body = new URLSearchParams(options.body);
  if (body.get("p_request") === "APPLICATION_PROCESS=jQuery_Auto") return new Response("0100511115: mun. Chișinău, str. Ion Creangă 82/1");
  assert.equal(body.get("p_request"), "APPLICATION_PROCESS=GET_INFO_RBI");
  return new Response('<div class="infoConstr">Adresa: mun. Chișinău, str. Ion Creangă 82/1<br><a onclick="getDetailedInfo(\'0100511.115.01.167\',3)"><i>167</i></a></div>');
} });
await assert.rejects(houseLocal.findCadastralByAddress("Chișinău, str Ion Creangă 82 ap 167"), (error) => {
  assert.equal(error.code, "address_confirmation_required");
  assert.deepEqual(clone(error.address_suggestions), [houseAlternative]); return true;
});
houseLocalDown = true;
const houseLocalCallsBeforeConfirm = houseLocalCalls;
const confirmedLocal = await houseLocal.findCadastralByAddress("Chișinău, str Ion Creangă 82/1 ap 167");
assert.equal(confirmedLocal.cadastral_number, "0100511.115.01.167");
assert.equal(confirmedLocal.parsed_input.houseNumber, "82/1");
confirmedLocal.cadastru_search_candidate.address = "changed";
assert.notEqual(houseLocal.getVerifiedAddressAlternative("Chișinău, str Ion Creangă 82/1 ap 0167").cadastru_search_candidate.address, "changed");
for (const input of ["Chișinău, str Ion Creangă 82 ap 167", "Chișinău, str Ion Creangă 82/2 ap 167", "Chișinău, str Ion Creangă 82/1 ap 168", "Bălți, str Ion Creangă 82/1 ap 167", "Chișinău, bd Ion Creangă 82/1 ap 167", "Chișinău, str Mihail Lomonosov 82/1 ap 167"]) {
  assert.equal(houseLocal.getVerifiedAddressAlternative(input), null, "different addresses miss the confirmation cache");
}
assert.equal(houseLocalCalls, houseLocalCallsBeforeConfirm, "local confirmation makes no upstream requests");
houseLocalNow += 5 * 60_000 - 1;
assert(houseLocal.getVerifiedAddressAlternative("Chișinău, str Ion Creangă 82/1 ap 167"));
houseLocalNow++;
assert.equal(houseLocal.getVerifiedAddressAlternative("Chișinău, str Ion Creangă 82/1 ap 167"), null, "cache reads do not extend expiry");
await assert.rejects(houseLocal.findCadastralByAddress("Chișinău, str Ion Creangă 82/1 ap 167"), (error) => error.code === "service_unavailable");
assert(houseLocalCalls > houseLocalCallsBeforeConfirm, "expired confirmation performs a fresh lookup");
console.log("House confirmation regressions passed: exact official alternative, worker/local forwarding, bounded address timeout, five-minute match reuse without upstream calls, normal confirmed saves and credits.");

// Recorded registry addresses exercise locality validation, signing and storage.
const localityCases = [
  { city: "Vadul lui Vodă", street: "Mircea cel Bătrân", house_number: "6", number: "3158206.066",
    official: "mun. Chișinău, or. Vadul lui Vodă, str. Mircea cel Bătrân 6" },
  { city: "Tohatin", street: "Mihail Sadoveanu", house_number: "45", number: "0146114.036",
    official: "mun. Chișinău, com. Tohatin, sat. Tohatin, str. Mihail Sadoveanu 45" },
];
for (const record of localityCases) {
  let detailAddress = record.official;
  let parentGeocode = false;
  const lookup = await load("@/lib/cadastru-address-search", {}, {
    fetch: async (url, options = {}) => {
      const host = new URL(url).hostname;
      if (host === "nominatim.openstreetmap.org") return Response.json(parentGeocode ? [{ lat: "47", lon: "28",
        address: { village: record.city, city: "Chișinău", road: `Strada ${record.street}`, house_number: record.house_number } }] : []);
      assert.equal(host, "www.cadastru.md", "No live upstream calls");
      if (options.method !== "POST") return new Response('<input name="p_instance" value="12345">');
      const body = new URLSearchParams(options.body);
      switch (body.get("p_request")) {
        case "APPLICATION_PROCESS=jQuery_Auto": return new Response(`${record.number.replaceAll(".", "")} : ${record.official}`);
        case "APPLICATION_PROCESS=GET_INFO_RBI": return new Response(`<a onclick="getDetailedInfo('${record.number}',1)">Land</a><a onclick="getDetailedInfo('${record.number}.01',2)">Building</a>`);
        case "APPLICATION_PROCESS=GET_DETAIL_DATA": return new Response(`<table><tr><td>Adresa</td><td>${detailAddress}</td></tr></table>`);
        default: throw new Error(`Unexpected upstream: ${body}`);
      }
    },
  });
  const input = `${record.city}, str ${record.street} ${record.house_number}`;
  const result = await lookup.findCadastralByAddress(input);
  assert.equal(result.lands[0].cadastral_number, record.number);
  assert.equal(result.buildings[0].cadastral_number, `${record.number}.01`);
  parentGeocode = true;
  await assert.rejects(lookup.findCadastralByAddress(input.replace(record.city, "Chișinău")), /Could not match/);
  parentGeocode = false;
  await assert.rejects(lookup.findCadastralByAddress(`${input}/1`), /Could not match/);
  detailAddress = `mun. Chișinău, or. Orhei, str. ${record.street} ${record.house_number}`;
  await assert.rejects(lookup.findCadastralByAddress(input), /Could not match/);

  const fields = { city: record.city, road_type: "str", street: record.street, house_number: record.house_number };
  const signedAdapter = await load("@/lib/cadastru-external-api", {
    "@/lib/external-api-usage": { getExternalApiDiagnosticHeaders: () => ({}), trackExternalApiUsage: () => {} },
  }, {
    process: { env: { CADASTRU_EXTERNAL_API_BASE_URL: "https://worker.test/", CADASTRU_EXTERNAL_API_SECRET: "locality-only-test" } },
    fetch: async (url, options) => {
      assert.equal(url, "https://worker.test/v1/cadastru/address");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), fields);
      const signature = crypto.createHmac("sha256", "locality-only-test")
        .update(options.headers["X-Catdai-Timestamp"]).update("\n").update(options.body).digest("hex");
      assert.equal(options.headers["X-Catdai-Signature"], `sha256=${signature}`);
      return Response.json({ ok: true, data: clone(result) });
    },
  });
  assert.deepEqual(clone(await signedAdapter.fetchExternalCadastruAddressData(fields, { trackUsage: false })), clone(result));
  await storage.persistCadastruRecord({ cadastral_number: record.number, address: record.official }, { officialFetch: true });
  const row = tables.cadastru_records.find((row) => row.cadastral_number === record.number);
  assert.equal(row.city, record.city);
  assert.equal(row.region, "mun. Chișinău", "settlement and parent municipality stay separate");
}
await storage.persistCadastruRecord({ cadastral_number: "0146114.999", address: "mun. Chișinău, sat. Unknown, str. Florilor 6" }, { officialFetch: true });
assert.equal(tables.cadastru_records.find((row) => row.cadastral_number === "0146114.999").city, null, "unknown settlements cannot become the parent city");
console.log("Locality regressions passed: signed worker fields, local land/building fallback, parent/suffix/detail rejection and separate stored city/region.");

// Worker outages must stay distinct from confirmed empty local lookups.
for (const mode of ["http503", "gateway", "network", "timeout", "invalid"]) {
  const outageRoute = await load("src/app/api/cadastru/address/route.js", {
    ...recoveryMocks,
    "@/lib/cadastru-address-search": { getVerifiedAddressAlternative: () => null, findCadastralByAddress: async () => {
      throw Object.assign(new Error("Could not match apartment 59."), { code: "not_found" });
    } },
  }, {
    process: { env: recoveryEnv }, fetch: async () => {
      if (mode === "network") throw new TypeError("fetch failed");
      if (mode === "timeout") throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      if (mode === "invalid") return new Response("<html>Maintenance</html>");
      if (mode === "gateway") return new Response("Bad Gateway", { status: 502 });
      return Response.json({ ok: false, error: "service_unavailable" }, { status: 503 });
    },
  });
  const response = await outageRoute.POST(request({ city: "Chișinău", road_type: "bulevard", street: "Decebal", house_number: "63", apartment_number: "59", search_context: "cadastru", skip_cache: true }));
  const payload = await response.json();
  assert.equal(response.status, 503, mode);
  assert.equal(payload.error, "service_unavailable");
  assert.equal(payload.suggestions, undefined);
  assert.equal(payload.suggestion_recovery_token, undefined);
  assert.equal(tables.external_api_usage_events.at(-1).request_payload.apartment_number, "59");
}

// Exercise actual local upstream handling, not only the route's error mapping.
for (const mode of ["empty", "http503", "timeout", "session", "apex", "geodata", "fallback"]) {
  const localLookup = await load("@/lib/cadastru-address-search", {}, {
    fetch: async (url, options = {}) => {
      const host = new URL(url).hostname;
      if (host === "nominatim.openstreetmap.org") return Response.json(["geodata", "fallback"].includes(mode) ? [{ lat: "47", lon: "28.8",
        display_name: "63, Bulevardul Decebal, Chișinău", address: { city: "Chișinău", road: "Bulevardul Decebal", house_number: "63" } }] : []);
      if (host === "geodata.gov.md") return new Response("Bad Gateway", { status: 502 });
      assert.equal(host, "www.cadastru.md");
      if (mode === "http503") return new Response("Unavailable", { status: 503 });
      if (mode === "timeout") throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      if (options.method !== "POST") return new Response(mode === "session" ? "<html>Maintenance</html>" : '<input name="p_instance" value="12345">');
      if (mode === "apex") return new Response("ORA-12541: TNS:no listener");
      const body = new URLSearchParams(options.body);
      if (body.get("p_request") === "APPLICATION_PROCESS=jQuery_Auto") return new Response(mode === "fallback" ? "0100106.131: mun. Chișinău, bd. Decebal 63" : "");
      return new Response('<div class="infoConstr">Adresa: mun. Chișinău, bd. Decebal 63<br><a onclick="getDetailedInfo(\'0100106.131.01.059\',3)"><i>59</i></a></div>');
    },
  });
  if (mode === "fallback") {
    assert.equal((await localLookup.findCadastralByAddress("Chișinău, bd Decebal 63 ap 59")).cadastral_number, "0100106.131.01.059");
  } else {
    for (const address of ["Chișinău, bd Decebal 63", "Chișinău, bd Decebal 63 ap 59"]) {
      await assert.rejects(localLookup.findCadastralByAddress(address), (error) => error.code === (mode === "empty" ? "not_found" : "service_unavailable"), `${mode}: ${address}`);
    }
  }
}
console.log("Outage regressions passed: real no-data, provider failures, worker transport, apartment telemetry, no suggestions and successful fallback.");

// Nearby enrichment runs after the cadastral result and keeps the original snapshot expiry.
const nearbyNumber = "0100106.131.01.099";
const nearbyParsing = await load("@/lib/cadastru-nearby");
assert.deepEqual(clone(nearbyParsing.nearbyAddressFromCadastru({
  apartment: { address: "mun. Chișinău, sect. Botanica, bd. Decebal 63, ap. 99" },
})), { city: "Chișinău", road_type: "bulevard", street: "Decebal", house_number: "63" });
assert.deepEqual(clone(nearbyParsing.nearbyAddressFromCadastru({
  request_address: "Chișinău, str 31 August 1989 14 ap 7",
})), { city: "Chișinău", road_type: "strada", street: "31 August 1989", house_number: "14" });
assert.deepEqual(clone(nearbyParsing.nearbyAddressFromCadastru({
  matched_address: "Chișinău, Bulevard Decebal, 63",
})), { city: "Chișinău", road_type: "bulevard", street: "Decebal", house_number: "63" });
await storage.persistCadastruRecord({ cadastral_number: nearbyNumber,
  apartment: { address: "mun. Chișinău, sect. Botanica, bd. Decebal 63, ap. 99", area_m2: 41 },
}, { officialFetch: true });
const nearbyRow = tables.cadastru_records.find((row) => row.cadastral_number === nearbyNumber);
const nearbyExpiry = nearbyRow.next_refresh_after;
const nearbyData = {
  attribution: "© OpenStreetMap contributors",
  categories: Object.fromEntries(["schools", "supermarkets", "pharmacies", "food", "parks", "public_transport"]
    .map((category) => [category, { available: ["schools", "food"].includes(category), places: category === "schools"
      ? [{ name: "School", osm_type: "node", osm_id: 1, walking_distance_m: 250, walking_duration_min: 3 }]
      : category === "food"
        ? [{ name: "Cafe", food_type: "cafe", osm_type: "node", osm_id: 2, walking_distance_m: 350, walking_duration_min: 4 }]
        : [] }])),
};
const legacyNearbyData = { ...nearbyData, categories: { ...nearbyData.categories } };
delete legacyNearbyData.categories.food;
assert.equal(nearbyParsing.validNearbyResult(legacyNearbyData), false, "nearby without food must be refreshed");
assert.equal(nearbyParsing.validNearbyResult(nearbyData), true);
await storage.persistCadastruNearby(await storage.getCadastruRecordByNumber(nearbyNumber), legacyNearbyData);
const nearbyUsage = await load("@/lib/external-api-usage");
const nearbyEventsBefore = tables.external_api_usage_events.length;
const signedNearby = await load("@/lib/cadastru-external-api", {
  "@/lib/external-api-usage": nearbyUsage,
}, {
  process: { env: { CADASTRU_EXTERNAL_API_BASE_URL: "https://worker.test/", CADASTRU_EXTERNAL_API_SECRET: "nearby-test" } },
  fetch: async (url, options) => {
    assert.equal(url, "https://worker.test/v1/nearby/address");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { city: "Chișinău", road_type: "bulevard", street: "Decebal", house_number: "63" });
    const signature = crypto.createHmac("sha256", "nearby-test")
      .update(options.headers["X-Catdai-Timestamp"]).update("\n").update(options.body).digest("hex");
    assert.equal(options.headers["X-Catdai-Signature"], `sha256=${signature}`);
    return Response.json({ ok: true, data: nearbyData });
  },
});
assert.deepEqual(clone(await signedNearby.fetchExternalNearbyData({ city: "Chișinău", road_type: "bulevard", street: "Decebal", house_number: "63" })), nearbyData);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(tables.external_api_usage_events.length, nearbyEventsBefore + 1);
assert.equal(tables.external_api_usage_events.at(-1).service, "cadastru_nearby");
assert.equal(tables.external_api_usage_events.at(-1).status, "success");
const failedSignedNearby = await load("@/lib/cadastru-external-api", {
  "@/lib/external-api-usage": nearbyUsage,
}, {
  process: { env: { CADASTRU_EXTERNAL_API_BASE_URL: "https://worker.test/", CADASTRU_EXTERNAL_API_SECRET: "nearby-test" } },
  fetch: async () => Response.json({ ok: false, error: "routing_unavailable", message: "Walking routes are temporarily unavailable." }, { status: 503 }),
});
await assert.rejects(failedSignedNearby.fetchExternalNearbyData({ city: "Chișinău", road_type: "bulevard", street: "Decebal", house_number: "63" }),
  (error) => error.code === "routing_unavailable" && error.status === 503);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(tables.external_api_usage_events.length, nearbyEventsBefore + 2);
assert.equal(tables.external_api_usage_events.at(-1).service, "cadastru_nearby");
assert.equal(tables.external_api_usage_events.at(-1).status, "failure");
assert.equal(tables.external_api_usage_events.at(-1).error_code, "routing_unavailable");
let nearbyCalls = 0;
const nearbyRoute = await load("src/app/api/cadastru/nearby/route.js", {
  "next/server": { NextResponse: { json: (data, options = {}) => Response.json(data, options) } },
  "@/lib/rate-limit": { rateLimit: () => ({ check: () => ({ allowed: true }) }) },
  "@/lib/cadastru-records": storage,
  "@/lib/cadastru-external-api": { fetchExternalNearbyData: async (fields) => {
    nearbyCalls++;
    assert.deepEqual(clone(fields), { city: "Chișinău", road_type: "bulevard", street: "Decebal", house_number: "63" });
    return nearbyData;
  } },
});
const nearbyRequest = () => new Request("http://localhost/api/cadastru/nearby", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ cadastral_number: nearbyNumber }),
});
assert.equal((await nearbyRoute.POST(nearbyRequest())).status, 200);
assert.equal(nearbyCalls, 1);
assert.equal(nearbyRow.raw_payload.nearby.categories.food.places[0].food_type, "cafe", "old Redis nearby data is replaced");
assert.equal(nearbyRow.next_refresh_after, nearbyExpiry, "nearby must not extend the official snapshot TTL");
assert.deepEqual(clone(nearbyRow.raw_payload.nearby), nearbyData, "nearby is stored in the cadastru JSONB payload");
assert.deepEqual(clone((await caching.readCadastruCache("number", nearbyNumber)).payload.nearby), nearbyData);
assert.equal((await nearbyRoute.POST(nearbyRequest())).status, 200);
cache.clear();
assert.equal((await nearbyRoute.POST(nearbyRequest())).status, 200);
assert.equal(nearbyCalls, 1, "Redis and DB hits must reuse nearby data");
nearbyRow.raw_payload.nearby = legacyNearbyData;
cache.clear();
assert.equal((await nearbyRoute.POST(nearbyRequest())).status, 200);
assert.equal(nearbyCalls, 2, "old DB nearby data must be refreshed");
assert.deepEqual(clone(nearbyRow.raw_payload.nearby), nearbyData);

const fallbackNumber = "0100106.131.01.098";
const unrelatedAddress = "Chișinău, bd Unrelated 111 ap 98";
await storage.persistCadastruRecord({ cadastral_number: fallbackNumber,
  apartment: { address: "mun. Chișinău, bd. Decebal 63, ap. 98" },
}, { officialFetch: true });
const fallbackResponse = await nearbyRoute.POST(new Request("http://localhost/api/cadastru/nearby", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address: unrelatedAddress, cadastral_number: fallbackNumber }),
}));
assert.equal(fallbackResponse.status, 200, "a number-backed result can recover from a missing old address alias");
assert.equal(await storage.getCadastruRecordByAddress(unrelatedAddress), null, "unverified fallback addresses must not become aliases");

const nearbyAggregateAddress = "Chișinău, bd Decebal 63";
await storage.persistCadastruAddressResult({ status: "success", matched_address: nearbyAggregateAddress,
  lands: [{ cadastral_number: "0100106.131", address: nearbyAggregateAddress }],
  buildings: [{ cadastral_number: "0100106.131.01", address: nearbyAggregateAddress }],
}, { requestAddress: nearbyAggregateAddress, officialFetch: true });
const aggregateEntry = await storage.getCadastruRecordByAddress(nearbyAggregateAddress);
const aggregateExpiry = aggregateEntry.expiresAt;
await storage.persistCadastruNearby(aggregateEntry, nearbyData, nearbyAggregateAddress);
cache.clear();
const restoredAggregate = await storage.getCadastruRecordByAddress(nearbyAggregateAddress);
assert.equal(restoredAggregate.expiresAt, aggregateExpiry);
assert.deepEqual(clone(restoredAggregate.payload.nearby), nearbyData, "address aggregates restore nearby from DB");
console.log("Nearby regressions passed: signed lookup input, legacy backfill, Redis/DB reuse and unchanged expiry.");

const transportParsing = await load("@/lib/cadastru-public-transport");
assert.deepEqual(clone(transportParsing.publicTransportInputFromCadastru({
  map_location: { latitude: 47.02, longitude: 28.83 },
  apartment: { address: "mun. Chișinău, com. Tohatin, sat. Tohatin, str. Păcii 1" },
  form_fields: { city: "Chișinău" },
})), { city: "Tohatin", road_type: "strada", street: "Păcii", house_number: "1" }, "the specific house address takes precedence over property coordinates");
const transportAddress = { city: "Chișinău", road_type: "bulevard", street: "Decebal", house_number: "63" };
assert.deepEqual(clone(transportParsing.publicTransportInputFromCadastru({
  map_location: { latitude: 47.02, longitude: 28.83 },
  apartment: { address: "mun. Chișinău, bd. Decebal 63, ap. 59" },
})), transportAddress, "Decebal 63 is sent as an address even when a stored coordinate points to the city center");
assert.deepEqual(clone(transportParsing.publicTransportInputFromCadastru({
  map_location: { latitude: null, longitude: 28.83 }, form_fields: { city: "Orhei" },
})), { locality: "Orhei" }, "invalid coordinates fall back to a locality");
assert.equal(transportParsing.publicTransportInputFromCadastru({}), null);
const transportNumber = "0100106.131.01.097";
await storage.persistCadastruRecord({ cadastral_number: transportNumber,
  map_location: { latitude: 47.02, longitude: 28.83 },
  apartment: { address: "mun. Chișinău, bd. Decebal 63, ap. 97" },
}, { officialFetch: true });
const transportData = {
  location: { latitude: 46.9990547, longitude: 28.8602536, source: "nominatim" },
  scope: "nearby", search_radius_m: 750,
  route_groups: [
    { mode: "trolleybus", routes: [{ ref: "4", name: null, source: "chisinau_transport" }] },
    { mode: "bus", routes: [{ ref: "19", name: null, source: "chisinau_transport" }] },
  ],
  sources: ["chisinau_transport"], attribution: "© OpenStreetMap contributors",
};
assert.equal(transportParsing.validPublicTransportResult(transportData), true);
assert.equal(transportParsing.validPublicTransportResult({ stops: [], locality_routes: [] }), false,
  "the old stop-based response cannot be rendered as grouped routes");
const signedTransport = await load("@/lib/cadastru-external-api", {
  "@/lib/external-api-usage": nearbyUsage,
}, {
  process: { env: { CADASTRU_EXTERNAL_API_BASE_URL: "https://worker.test/", CADASTRU_EXTERNAL_API_SECRET: "transport-test" } },
  fetch: async (url, options) => {
    assert.equal(url, "https://worker.test/v1/public-transport");
    assert.deepEqual(JSON.parse(options.body), transportAddress);
    const signature = crypto.createHmac("sha256", "transport-test")
      .update(options.headers["X-Catdai-Timestamp"]).update("\n").update(options.body).digest("hex");
    assert.equal(options.headers["X-Catdai-Signature"], `sha256=${signature}`);
    return Response.json({ ok: true, data: transportData });
  },
});
assert.deepEqual(clone(await signedTransport.fetchExternalPublicTransportData(transportAddress)), transportData);
let transportCalls = 0;
const transportRoute = await load("src/app/api/cadastru/public-transport/route.js", {
  "next/server": { NextResponse: { json: (data, options = {}) => Response.json(data, options) } },
  "@/lib/rate-limit": { rateLimit: () => ({ check: () => ({ allowed: true }) }) },
  "@/lib/cadastru-records": storage,
  "@/lib/cadastru-external-api": { fetchExternalPublicTransportData: async (input) => {
    transportCalls++;
    assert.deepEqual(clone(input), transportAddress);
    return transportData;
  } },
});
const transportRequest = (number) => new Request("http://localhost/api/cadastru/public-transport", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ cadastral_number: number }),
});
const transportResponse = await transportRoute.POST(transportRequest(transportNumber));
assert.equal(transportResponse.status, 200);
assert.deepEqual(clone((await transportResponse.json()).public_transport), transportData);
assert.equal(transportCalls, 1);
assert.equal((await transportRoute.POST(transportRequest("bad"))).status, 400);
assert.equal((await transportRoute.POST(transportRequest("0100106.131.01.096"))).status, 404);
const transportMissingNumber = "0100106.131.01.096";
await storage.persistCadastruRecord({ cadastral_number: transportMissingNumber }, { officialFetch: true });
assert.equal((await transportRoute.POST(transportRequest(transportMissingNumber))).status, 422, "records without a location or locality do not call the worker");
assert.equal(transportCalls, 1);
console.log("Public transport regressions passed: address priority, signed worker request and isolated route response.");
