// Isolated outage recovery/credit/storage regressions. No network or live database writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-outage.mjs
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

const number = "3126213.009";
const shape = { type: "Polygon", coordinates: [[[28, 47], [28.01, 47], [28.01, 47.01], [28, 47]]] };
const partial = { status: "success", cadastral_number: number, source: "geodata_wfs",
  registry_unavailable: true, partial: true, building: {}, apartment: {}, form_fields: {}, buildings: [],
  lands: [{ cadastral_number: number, area_m2: "1000", partial: true,
    object_type: "Teren", map_location: { latitude: 47, longitude: 28 }, map_geometry: shape }] };
const complete = { ...partial, source: "cadastru_md_detail", lands: [{ ...partial.lands[0],
  address: "Orhei, str. Test 1", ownership_type: "Private" }] };
delete complete.partial; delete complete.registry_unavailable; delete complete.lands[0].partial;
let allowed = true, credits = 0, fetches = 0, workerPayload = partial, workerError;
const overrides = {
  "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
  "@/lib/rate-limit": { rateLimit: () => ({ check: () => ({ allowed: true, remaining: 14 }) }) },
  "@/lib/access-tier": { resolveAccessTier: async () => ({ tier: "free", user_id: allowed ? "test-user" : null }) },
  "@/lib/paid-feature-usage": {
    checkFeatureAccess: async () => ({ allowed, reason: "no_credit" }),
    consumeFeatureCredit: async () => { credits++; return { allowed, reason: "no_credit" }; },
    makePaidFeatureUsageKey: (_feature, params) => JSON.stringify(params),
    buildFeatureCreditRequiredPayload: (_feature, reason) => ({ reason }),
  },
  "@/lib/cadastru-search-events": { logCadastruSearchEvent: async () => null },
  "@/lib/cadastru-external-api": { fetchExternalCadastralData: async () => {
    fetches++; if (workerError) throw workerError; return clone(workerPayload);
  } },
  "@/lib/cadastru-address-search": { fetchCadastruDetailData: async () => assert.fail("disabled local fallback") },
};
const route = await load("src/app/api/cadastral/route.js", overrides);
const storage = await load("@/lib/cadastru-records", overrides);
const caching = await load("@/lib/cadastru-cache");
const refresh = await load("@/lib/cadastru-refresh", overrides);
async function lookup(extra = {}) {
  return route.POST(new Request("http://localhost/api/cadastral", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cadastral_number: number, search_context: "cadastru", search_type: "number", ...extra }) }));
}
let response = await lookup();
assert.equal(response.status, 200);
let data = await response.json();
assert.equal(data.registry_unavailable, true);
assert.equal(data.lands[0].area_m2, "1000");
assert.deepEqual(data.lands[0].map_geometry, shape);
assert.equal(credits, 0, "fresh verified outage data does not spend an unlock");
let row = tables.cadastru_records[0];
const initialExpiry = row.next_refresh_after;
assert.ok(Date.parse(initialExpiry) - Date.now() <= 300_000);
assert.ok(Date.parse(initialExpiry) - Date.now() > 290_000);
assert.equal(row.raw_payload.registry_unavailable, true);
assert.equal(row.raw_payload.lands[0].area_m2, "1000");
await lookup();
assert.equal(fetches, 1, "a fresh partial snapshot is reusable without repeated source calls");
assert.equal(credits, 0, "reading cached outage data also leaves credits untouched");
allowed = false;
data = await (await lookup()).json();
assert.equal(data.registry_unavailable, true, "preview retains the outage notice");
assert.equal(data.full_access, false);
assert.equal(data.locked_sections.map, true);
assert.notEqual(data.lands[0].area_m2, "1000", "existing preview masking is retained");
assert.equal(data.lands[0].map_geometry, undefined, "preview never leaks geometry");
assert.equal(credits, 0);
allowed = true;
row.next_refresh_after = new Date(Date.now() - 1000).toISOString();
cache.clear();
workerError = Object.assign(new Error("Source offline"), { status: 503, code: "service_unavailable", fallbackEligible: true });
response = await lookup();
assert.equal(response.status, 200, "expired partial data is served before background refresh");
data = await response.json();
assert.equal(data.lands[0].area_m2, "1000");
assert.equal(data.data_freshness.property.stale, true);
await flushRefreshes();
assert.equal(credits, 0, "failed background refresh never consumes credits");
assert.equal(row.raw_payload.lands[0].area_m2, "1000");
workerError = null;
workerPayload = complete;
response = await lookup({ skip_cache: true });
assert.equal(response.status, 200);
data = await response.json();
assert.equal(data.registry_unavailable, undefined);
assert.equal(data.lands[0].ownership_type, "Private");
assert.equal(credits, 1, "a recovered full result uses the existing unlock path");
row = tables.cadastru_records[0];
assert.ok(Date.parse(row.next_refresh_after) - Date.now() > 89 * 86400_000);
const fullDate = row.last_official_fetch_at, fullExpiry = row.next_refresh_after;
workerPayload = partial;
data = await (await lookup({ skip_cache: true })).json();
assert.equal(data.lands[0].ownership_type, "Private", "an outage never replaces richer saved registry fields");
assert.equal(row.last_official_fetch_at, fullDate);
assert.equal(row.next_refresh_after, fullExpiry, "outage lookup cannot renew the richer snapshot's dates");
assert.equal(refresh.isUsableCadastruRefresh(partial, complete), true, "recovery can remove per-property partial flags");
assert.equal(refresh.isUsableCadastruRefresh(complete, partial), false, "background outages cannot downgrade saved results");
persistEnabled = false;
cache.clear();
credits = 0;
data = await (await lookup({ skip_cache: true })).json();
assert.equal(data.registry_unavailable, true);
assert.equal(credits, 0);
const cached = await caching.readCadastruCache("number", number, { allowExpired: true });
assert.ok(Date.parse(cached.expiresAt) - Date.now() <= 300_000, "Redis-only recovery uses the same early refresh deadline");
console.log("Outage checks passed: verified partial data, masking, no credit use, early refresh, recovery and richer-record preservation.");
