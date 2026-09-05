// Isolated storage/route regression tests. No network or live database writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-storage.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";

const cache = new Map();
const tables = { cadastru_records: [], cadastru_address_aliases: [] };
let persistEnabled = true;
const clone = (value) => JSON.parse(JSON.stringify(value));
const supabaseAdmin = {
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
            const row = { id: tables[table].length + 1, saved_at: new Date().toISOString(), ...clone(values), cadastral_number_digits: values.cadastral_number.replace(/\D/g, "") };
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
async function load(entry, extraMocks = {}) {
  const context = vm.createContext({ console, Date, URL, Request, Response, Headers, AbortSignal, setTimeout, clearTimeout });
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
      const path = id.startsWith("@/") ? `src/${id.slice(2)}.js` : id;
      loadedModule = new vm.SourceTextModule(await fs.readFile(path, "utf8"), { context, identifier: id });
    }
    modules.set(id, loadedModule);
    await loadedModule.link(moduleFor);
    return loadedModule;
  }
  const loadedModule = await moduleFor(entry);
  await loadedModule.evaluate();
  return loadedModule.namespace;
}
const storage = await load("@/lib/cadastru-records");
const caching = await load("@/lib/cadastru-cache");
const address = "Chișinău, str Ștefan cel Mare 9 ap 12";
const structuredAddress = { city: "Chișinău", street: "Strada Ștefan cel Mare", houseNumber: "9", apartmentNumber: "12" };
const number = "0100201.999.01.012";
const payload = { cadastral_number: number, apartment: { address, area_m2: 64, unknown_field: { nested: [0, false, null] } }, building: { address: "Chișinău, str Ștefan cel Mare 9", construction_year: 1981 }, novel: { records: [{ value: "unexpected" }] }, access_tier: "paid", access_limit: { reason: "private" }, locked_sections: {} };
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

const russian = "Кишинев, ул Штефан чел Маре 9 кв 12";
await storage.persistCadastruAddressResult({ ...expected, method: "address", request_address: russian }, { requestAddress: russian, structuredAddress: { ...structuredAddress, street: "Strada Штефан чел Маре" }, officialFetch: true });
const updated = { ...expected, apartment: { ...expected.apartment, area_m2: 70 } };
await storage.persistCadastruRecord(updated, { officialFetch: true });
assert.equal((await storage.getCadastruRecordByAddress(russian)).payload.apartment.area_m2, 70, "old RO/RU aliases resolve the current canonical record");
cache.clear();
assert.equal((await storage.getCadastruRecordByAddress(russian)).payload.apartment.area_m2, 70);

const aggregateAddress = "Chișinău, bd Moscova 9/5";
const aggregate = { status: "success", matched_address: aggregateAddress, extra: { unknown: [false, 0] }, lands: [{ cadastral_number: "0100201.555", address: aggregateAddress, custom: { x: 1 } }], buildings: [{ cadastral_number: "0100201.555.01", address: aggregateAddress, unusual: [1, 2] }, { cadastral_number: "0100201.555.02", address: aggregateAddress, restrictions: "test" }] };
await storage.persistCadastruAddressResult(aggregate, { requestAddress: aggregateAddress, structuredAddress: { city: "Chișinău", street: "Bulevard Moscova", houseNumber: "9/5", apartmentNumber: "" }, officialFetch: true });
cache.clear();
assert.deepEqual(clone((await storage.getCadastruRecordByAddress(aggregateAddress)).payload), aggregate);
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
persistEnabled = true;
console.log("Storage regressions passed: full JSON, number/address parity, aggregates, RO/RU aliases, exact matching, expiry, Redis fallback.");

cache.clear(); tables.cadastru_records.length = 0; tables.cadastru_address_aliases.length = 0;
let addressFetches = 0, numberFetches = 0, enrichFetches = 0;
let hasCredit = false;
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
    fetchExternalCadastruAddressData: async () => { addressFetches++; return { ...expected, matched_address: address }; },
    fetchExternalCadastralData: async () => { numberFetches++; return expected; },
  },
  "@/lib/cadastru-address-search": {
    findCadastralByAddress: async () => { throw Error("Unexpected local fallback"); },
    fetchCadastruDetailData: async () => { enrichFetches++; return null; },
  },
};
const addressRoute = await load("src/app/api/cadastru/address/route.js", routeMocks);
const numberRoute = await load("src/app/api/cadastral/route.js", routeMocks);
const request = (body) => new Request("http://localhost/api/cadastral", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ search_context: "cadastru", ...body }) });
const addressBody = { city: "Chisinau", road_type: "strada", street: "Ștefan cel Mare", house_number: "9", apartment_number: "012" };
const preview = await (await addressRoute.POST(request(addressBody))).json();
assert.equal(preview.full_access, false);
assert.notEqual(preview.apartment.area_m2, 64);
assert.equal(tables.cadastru_records[0].raw_payload.apartment.area_m2, 64, "anonymous lookups store unmasked JSON");
assert.equal(tables.cadastru_records[0].raw_payload.access_limit, undefined);
const numberPreview = await (await numberRoute.POST(request({ cadastral_number: number }))).json();
assert.equal(numberPreview.full_access, false);
assert.equal(numberFetches, 0, "address-saved details satisfy number lookup");
assert.equal(enrichFetches, 0, "fresh snapshots must not call enrichment again");
hasCredit = true;
const full = await (await numberRoute.POST(request({ cadastral_number: number }))).json();
assert.equal(full.apartment.area_m2, 64);
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
