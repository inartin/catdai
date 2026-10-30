// Exact house-suffix route/storage regressions. No network or live database writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-house-suffix.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import path from "node:path";
import * as validation from "../src/lib/validation.js";

const deferredRefreshes = [];
async function flushRefreshes() { while (deferredRefreshes.length) await deferredRefreshes.shift()(); }
const cache = new Map();
const tables = { cadastru_records: [], cadastru_address_aliases: [], external_api_usage_events: [], cadastru_public_transport: [], cadastru_nearby: [], cadastru_buildings: [], cadastru_building_addresses: [], cadastru_municipal_reports: [] };
let persistEnabled = true;
const clone = (value) => JSON.parse(JSON.stringify(value));
const supabaseAdmin = {
  rpc: async () => ({ error: null }),
  from(table) {
    const filters = [];
    let operation = "select", values, conflictKey = "address_key", limit = Infinity;
    const query = {
      select() { return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      gte(key, value) { filters.push((row) => row[key] >= value); return query; },
      lt(key, value) { filters.push((row) => row[key] < value); return query; },
      like(key, value) {
        const pattern = new RegExp(`^${value.replace(/\./g, "\\.").replace(/_/g, ".").replace(/%/g, ".*")}$`);
        filters.push((row) => pattern.test(row[key])); return query;
      },
      is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query; },
      limit(value) { limit = value; return query; },
      insert(value) { operation = "insert"; values = value; return query; },
      update(value) { operation = "update"; values = value; return query; },
      upsert(value, options = {}) { operation = "upsert"; values = value; conflictKey = options.onConflict || "address_key"; return query; },
      then(resolve, reject) {
        try {
          let rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
          if (operation === "insert") {
            const row = { id: tables[table].length + 1, saved_at: new Date().toISOString(), ...clone(values), ...(values.cadastral_number ? { cadastral_number_digits: values.cadastral_number.replace(/\D/g, "") } : {}) };
            tables[table].push(row); rows = [row];
          }
          if (operation === "update") rows.forEach((row) => Object.assign(row, clone(values)));
          if (operation === "upsert") {
            let row = tables[table].find((item) => item[conflictKey] === values[conflictKey]);
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
  "@/lib/statistics-context": { getStatisticsVisitor: () => null, getStatisticsUserId: () => null, shouldCollectStatistics: () => true, withStatisticsContext: handler => handler },
  "node:crypto": { default: crypto },
  "@/lib/runtime-persistence": { shouldPersistRuntimeData: () => persistEnabled },
  "@/lib/supabase-admin": { supabaseAdmin },
  "@/lib/validation": { ...validation, matchDistrict: () => null },
  "@/lib/cache": {
    getSharedCacheClient: async () => null,
    getSharedCache: async (key) => cache.has(key) ? { value: clone(cache.get(key)) } : null,
    setSharedCache: async (key, value, ttl) => {
      assert(ttl > 0 && ttl <= 180 * 86400); cache.set(key, clone(value)); return true;
    },
  },
};
async function load(entry, extraMocks = {}, globals = {}) {
  const context = vm.createContext({ console, Date, URL, URLSearchParams, Request, Response, Headers, AbortSignal, Buffer, setTimeout, clearTimeout, process, ...globals });
  const modules = new Map(), mocks = { ...baseMocks, ...extraMocks };
  if (mocks["@/lib/cadastru-records"]) mocks["@/lib/cadastru-records"] = { persistCadastruRecord: async () => { throw new Error("Unexpected number persistence"); }, ...mocks["@/lib/cadastru-records"] };
  if (mocks["@/lib/cadastru-external-api"]) mocks["@/lib/cadastru-external-api"] = { fetchExternalCadastralData: async () => { throw new Error("Unexpected number refresh"); }, ...mocks["@/lib/cadastru-external-api"] };
  if (mocks["next/server"]) mocks["next/server"] = { after: callback => deferredRefreshes.push(callback), ...mocks["next/server"] };
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
const nearbyParsing = await load("@/lib/cadastru-nearby");
const routeMocks = {
  "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
  "@/lib/rate-limit": { rateLimit: () => ({ check: () => ({ allowed: true, remaining: 10 }) }) },
  "@/lib/access-tier": { resolveAccessTier: async () => ({ tier: "free", user_id: null }) },
  "@/lib/paid-feature-usage": {
    checkFeatureAccess: async () => ({ allowed: false, reason: "no_credit" }),
    consumeFeatureCredit: async () => ({ allowed: false, reason: "no_credit" }),
    buildFeatureCreditRequiredPayload: (_feature, reason) => ({ reason }),
    makePaidFeatureUsageKey: (_feature, params) => JSON.stringify(params),
  },
  "@/lib/cadastru-search-events": { logCadastruSearchEvent: async () => {} },
  "@/lib/cadastru-address-search": { getVerifiedAddressAlternative: () => null,
    findCadastralByAddress: async () => { throw Error("Unexpected local fallback"); } },
};
const request = body => new Request("http://localhost/api/cadastru/address", { method: "POST",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify({ search_context: "cadastru", ...body }) });


// Letter suffixes survive app validation, stored parsing, cache identity and nearby origins.
{
  const letterAddress = 'mun. Chișinău, str. Nuferilor 22 / d, ap. 9';
  const letterStructured = { city: 'Chișinău', street: 'Strada Nuferilor', houseNumber: '22/D', apartmentNumber: '9' };
  const letterNumber = '0100118.111.01.009';
  await storage.persistCadastruRecord({ cadastral_number: letterNumber, apartment: { address: letterAddress } }, { officialFetch: true });
  const row = tables.cadastru_records.find(item => item.cadastral_number === letterNumber);
  assert.equal(row.house_number, '22/D');
  assert.equal(storage.recordMatchesStructuredAddress(row, '', letterStructured), true);
  for (const houseNumber of ['22', '22/A', '22/1']) {
    assert.equal(storage.recordMatchesStructuredAddress(row, '', { ...letterStructured, houseNumber }), false, houseNumber);
  }
  assert.equal(storage.recordMatchesStructuredAddress({ ...row, house_number: '22 / d' }, '', letterStructured), true);
  assert.equal(storage.normalizeCadastruAddressForDb(letterAddress), storage.normalizeCadastruAddressForDb(letterAddress.replace('22 / d', '22/D')));
  assert.notEqual(storage.normalizeCadastruAddressForDb(letterAddress), storage.normalizeCadastruAddressForDb(letterAddress.replace('22 / d', '22')));
  const found = await storage.getCadastruRecordByAddress('Chișinău, str Nuferilor 22/D ap 9', { structuredAddress: letterStructured });
  assert.equal(found.payload.cadastral_number, letterNumber);
  assert.equal(await storage.getCadastruRecordByAddress('Chișinău, str Nuferilor 22 ap 9', {
    structuredAddress: { ...letterStructured, houseNumber: '22' },
  }), null, 'house 22 cannot reuse a 22/D snapshot');
  for (const address of ['Chișinău, str Nuferilor 22/D', 'Chișinău, str Nuferilor, 22 /d, ap 9']) {
    assert.deepEqual(clone(nearbyParsing.nearbyAddressFromCadastru({ request_address: address })),
      { city: 'Chișinău', road_type: 'strada', street: 'Nuferilor', house_number: '22/D' });
  }
  const submissions = [];
  let letterFailure = null, cacheReads = 0;
  const letterRoute = await load('src/app/api/cadastru/address/route.js', {
    ...routeMocks,
    '@/lib/cadastru-records': {
      getCadastruRecordByAddress: async () => { cacheReads++; return null; },
      persistCadastruAddressResult: async payload => payload,
    },
    '@/lib/cadastru-external-api': { fetchExternalCadastruAddressData: async fields => {
      submissions.push(clone(fields));
      if (letterFailure) throw letterFailure;
      return { lands: [{ cadastral_number: '0100118.111', address: `Chișinău, str Nuferilor ${fields.house_number}` }] };
    } },
  });
  const fields = { city: 'Chișinău', road_type: 'strada', street: 'Nuferilor', house_number: '22/D' };
  for (const house_number of ['22/D', '22/d', '22 / d']) {
    const response = await letterRoute.POST(request({ ...fields, house_number }));
    assert.equal(response.status, 200);
    assert.equal(submissions.at(-1).house_number, '22/D');
    assert.equal((await response.json()).resolved_address, 'Chișinău, str Nuferilor 22/D');
  }
  const beforeInvalid = submissions.length, readsBeforeInvalid = cacheReads;
  for (const house_number of ['22/', '22/DD', '22/D/1', '22/1D', '22/Д']) {
    const response = await letterRoute.POST(request({ ...fields, house_number }));
    assert.equal(response.status, 400, house_number);
    assert.equal((await response.json()).field, 'house_number');
  }
  const conflict = await letterRoute.POST(request({ ...fields, street: 'Nuferilor 22 /d', house_number: '22' }));
  assert.equal(conflict.status, 422);
  assert.deepEqual((await conflict.json()).corrections, [
    { street: 'Nuferilor', house_number: '22/D' }, { street: 'Nuferilor', house_number: '22' },
  ]);
  assert.equal(submissions.length, beforeInvalid);
  assert.equal(cacheReads, readsBeforeInvalid, 'invalid/conflicting letter suffixes stop before cache/provider calls');
  const cleaned = await letterRoute.POST(request({ ...fields, street: 'Nuferilor 22 /d' }));
  assert.equal(cleaned.status, 200);
  assert.equal(submissions.at(-1).street, 'Nuferilor');
  const choice = { ...fields };
  letterFailure = Object.assign(new Error('confirm'), { code: 'address_confirmation_required', status: 422, addressSuggestions: [choice] });
  const confirmation = await letterRoute.POST(request({ ...fields, house_number: '22' }));
  assert.equal(confirmation.status, 422);
  assert.deepEqual((await confirmation.json()).address_suggestions, [choice]);
  console.log('Letter suffix regressions passed: exact app validation, worker forwarding, conflict/confirmation, records, cache separation and nearby origins.');
}

// Șoseaua selection stays exact through the app API, storage identity and secondary origins.
{
  const fields = { city: "Chișinău", road_type: "sos", street: "Hincesti", house_number: "140/2" };
  const submissions = [], reads = [], events = [];
  let confirmation = false;
  const route = await load("src/app/api/cadastru/address/route.js", {
    ...routeMocks,
    "@/lib/cadastru-records": {
      getCadastruRecordByAddress: async (address, options) => { reads.push({ address, ...clone(options) }); return null; },
      persistCadastruAddressResult: async payload => payload,
    },
    "@/lib/cadastru-search-events": { logCadastruSearchEvent: async (_request, _type, options) => { events.push(clone(options)); } },
    "@/lib/cadastru-external-api": { fetchExternalCadastruAddressData: async input => {
      submissions.push(clone(input));
      if (confirmation) throw Object.assign(new Error("confirm"), { code: "address_confirmation_required", status: 422,
        addressSuggestions: [{ ...fields, street: "Hâncești", house_number: "140/2/A" },
          { ...fields, street: "Hâncești", house_number: "140/2", apartment_number: undefined }] });
      return { lands: [{ cadastral_number: "0100217.173", address: "mun. Chișinău, șos. Hâncești 140/2" }] };
    } },
  });
  for (const street of ["Hâncești", "Hîncești", "Hincesti", "Soseul Hincesti"]) {
    const response = await route.POST(request({ ...fields, street }));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.resolved_address, "Chișinău, sos Hâncești 140/2");
    assert.equal(submissions.at(-1).road_type, "sos");
    assert.equal(submissions.at(-1).street, "Hâncești");
    assert.equal(submissions.at(-1).house_number, "140/2");
    assert.equal(reads.at(-1).address, "Chișinău, sos Hâncești 140/2");
    assert.equal(reads.at(-1).structuredAddress.street, "Șos. Hâncești");
    assert.equal(events.at(-1).searchRequest.road_type, "sos");
  }
  const row = { city: "Chișinău", full_address: "mun. Chișinău, șos. Hâncești 140/2",
    street: "șos. Hâncești", house_number: "140/2" };
  const structured = { city: "Chișinău", street: "Șos. Hâncești", houseNumber: "140/2" };
  assert(storage.recordMatchesStructuredAddress(row, "", structured));
  assert(!storage.recordMatchesStructuredAddress(row, "", { ...structured, street: "Strada Hâncești" }));
  assert(!storage.recordMatchesStructuredAddress(row, "", { ...structured, houseNumber: "140" }));
  for (const marker of ["sos", "șos.", "Șoseaua", "шоссе"]) {
    assert.deepEqual(clone(nearbyParsing.nearbyAddressFromCadastru({ request_address: `Chișinău, ${marker} Hâncești, 140/2` })),
      { ...fields, street: "Hâncești" });
  }
  const suggestions = await load("@/lib/cadastru-street-suggestions");
  assert.deepEqual(clone(suggestions.suggestRoadTypes({ city: "Chișinău", roadType: "str", street: "Hincesti" })),
    [{ road_type: "sos", street: "Hâncești" }]);
  assert.deepEqual(clone(suggestions.suggestRoadTypes({ city: "Chișinău", roadType: "sos", street: "Hincesti" })), []);
  const market = await load("@/lib/cadastru-market");
  const listing = { id: 1, external_id: "12345678", is_active: true, price_currency: "EUR", price_amount: 100000,
    attributes: { sourceStreet: "șos. Hîncești", sourceBuildingNumber: "140/2" } };
  const db = { from(table) {
    assert(["listing", "listing_price_history"].includes(table), table);
    const query = { then(resolve, reject) { return Promise.resolve({ data: table === "listing"
      ? [listing, { ...listing, id: 2, attributes: { ...listing.attributes, sourceStreet: "str. Hîncești" } }] : [], error: null }).then(resolve, reject); } };
    for (const method of ["select", "eq", "or", "order", "limit", "in", "range"]) query[method] = () => query;
    return query;
  } };
  const prices = await market.loadCadastruMarket(db, { address: "Chișinău, sos Hâncești 140/2" });
  assert.equal(prices.collectedCount, 1, "market matching cannot mix strada and șoseaua listings");
  assert.equal(prices.listings.length, 1);
  assert.equal(prices.houses[0].address, "șos. Hâncești 140/2");
  confirmation = true;
  const response = await route.POST(request({ ...fields, apartment_number: "9" }));
  assert.equal(response.status, 422);
  assert.deepEqual((await response.json()).address_suggestions, [{ ...fields, street: "Hâncești" }]);
  console.log("Șoseaua regressions passed: exact aliases, worker requests, cache identity, history request type, confirmation and secondary origins.");
}
