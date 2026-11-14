// Isolated worker routing checks: no network calls or database writes.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const env = { CADASTRU_EXTERNAL_API_BASE_URL: "https://pi.test", CADASTRU_EXTERNAL_API_SECRET: "test-secret" };
const attempts = [], events = [], healthChecks = [];
const offlineHealth = () => { throw new TypeError("health unreachable"); };
let healthReply = offlineHealth;
let reply = () => Response.json({ ok: true, data: { marker: "success" } });
const context = vm.createContext({ console, process: { env }, Date, URL, AbortSignal,
  fetch: async (url, options) => {
    if (new URL(url).pathname === "/health") {
      healthChecks.push({ url: String(url), options });
      assert.equal(options.headers, undefined, "health probes send no credentials");
      assert.equal(options.body, undefined);
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "error");
      assert(options.signal instanceof AbortSignal);
      return healthReply(url, options);
    }
    attempts.push({ url, options });
    const secret = new URL(url).pathname === "/v1/999/listing"
      ? env.LISTING999_EXTERNAL_API_SECRET || env.CADASTRU_EXTERNAL_API_SECRET : env.CADASTRU_EXTERNAL_API_SECRET;
    const signature = crypto.createHmac("sha256", secret).update(options.headers["X-Catdai-Timestamp"])
      .update("\n").update(options.body).digest("hex");
    assert.equal(options.headers["X-Catdai-Signature"], `sha256=${signature}`);
    assert.match(options.headers["X-Request-Id"], /^[a-f0-9-]{36}$/);
    assert(options.signal instanceof AbortSignal);
    assert.equal(JSON.parse(options.body).lookup_id, undefined);
    return reply(url, options);
  },
});
const redis = new Map();
const refreshes = [];
let database;
let savedProperty;
const unlockedNumber = "0100106.131.01.059";
const publicShare = "a".repeat(48);
const mocks = {
  "node:crypto": { default: crypto },
  "next/server": { NextResponse: Response },
  "@/lib/rate-limit": { rateLimit: () => ({ check: () => ({ allowed: true }) }) },
  "@/lib/validation": { validateCadastralNumber: (value) => ({ value: /^\d{7}\.\d{3}\.\d{2}\.\d{3}$/.test(value) ? value : null }) },
  "@/lib/cadastru-records": { getCadastruRecordByNumber: async (number) => number === unlockedNumber && { payload: savedProperty } },
  "@/lib/cadastru-nearby": { nearbyAddressFromCadastru: (payload) => payload?.house },
  "@/lib/cadastru-share-metadata": { getCadastruSharedReport: async (slug) => slug === publicShare && { payload: savedProperty } },
  "@/lib/access-tier": { resolveAccessTier: async (request) => ({ user_id: request.headers.get("authorization")?.slice(7) }) },
  "@/lib/paid-feature-usage": {
    makePaidFeatureUsageKey: (feature, fields) => `${feature}:${fields.cadastral_number}`,
    checkFeatureAccess: async ({ userId, idempotencyKey }) => ({ allowed: true,
      reason: userId === "buyer" && idempotencyKey === `cadastru_lookup:${unlockedNumber}` ? "already_consumed" : "has_credit" }),
  },
  "@/lib/cache": {
    getSharedCache: async (key) => redis.has(key) ? { value: redis.get(key).value } : null,
    setSharedCache: async (key, value, ttl) => redis.set(key, { value, ttl }),
  },
  "@/lib/cadastru-refresh": { scheduleCadastruRefresh: (key, refresh) => refreshes.push({ key, refresh }) },
  "@/lib/supabase-admin": { supabaseAdmin: { from(table) {
    assert.equal(table, "cadastru_building_management");
    return {
      select: () => ({ eq: (column, key) => ({ limit: async () => {
        assert.equal(column, "origin_key");
        const result = await database.query("select raw_payload, fetched_at, expires_at from cadastru_building_management where origin_key = $1", [key]);
        return { data: result.rows };
      } }) }),
      upsert: async (row, options) => {
        assert.equal(options.onConflict, "origin_key");
        await database.query(`insert into cadastru_building_management (origin_key, lookup_input, raw_payload, fetched_at, expires_at)
          values ($1, $2, $3, $4, $5) on conflict (origin_key) do update set raw_payload = excluded.raw_payload,
          fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
        [row.origin_key, row.lookup_input, row.raw_payload, row.fetched_at, row.expires_at]);
        return { error: null };
      },
    };
  } } },
  "@/lib/external-api-usage": {
    getExternalApiDiagnosticHeaders: (response) => Object.fromEntries(
      ["x-catdai-node", "x-catdai-app-version", "x-catdai-node-version"]
        .map((name) => [name, response.headers.get(name)]).filter(([, value]) => value)),
    trackExternalApiUsage: (service, status, details) => {
      events.push({ service, status, details });
      return Promise.resolve(events.length);
    },
  },
};
const modules = new Map();
async function moduleFor(id) {
  if (modules.has(id)) return modules.get(id);
  const values = mocks[id];
  const mod = values ? new vm.SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context }) : new vm.SourceTextModule(await fs.readFile(`src/${id.slice(2)}.js`, "utf8"), { context });
  modules.set(id, mod);
  return mod;
}
async function load(id) {
  const mod = await moduleFor(id);
  await mod.link(moduleFor);
  await mod.evaluate();
  return mod.namespace;
}
const workers = await load("@/lib/api-workers");
const cadastru = await load("@/lib/cadastru-external-api");
const listing = await load("@/lib/listing999-external-api");
const clone = (value) => JSON.parse(JSON.stringify(value));
const reset = () => { attempts.length = 0; events.length = 0; healthChecks.length = 0; healthReply = offlineHealth; };
const success = (name) => Response.json({ ok: true, data: { marker: name } }, {
  headers: { "x-catdai-node": name, "x-catdai-app-version": "abc123", "x-catdai-node-version": "v24.10.0" },
});

assert.deepEqual(clone(workers.getApiWorkerEndpoints("v1/cadastral")), [{ name: "pi", url: "https://pi.test/v1/cadastral" }]);
delete env.CADASTRU_EXTERNAL_API_BASE_URL;
assert.equal(workers.getApiWorkerEndpoints("v1/cadastral", "https://legacy.test/custom")[0].url, "https://legacy.test/custom");
env.CATDAI_API_PI_BASE_URL = "file:///tmp/worker";
assert.equal(workers.getApiWorkers()[0].url, null);
env.CATDAI_API_PI_BASE_URL = "https://secret:password@pi.test";
assert.equal(workers.getApiWorkers()[0].url, null);
env.CATDAI_API_PI_BASE_URL = "https://pi.test";
env.CATDAI_API_MAC_BASE_URL = "https://mac.test";
env.CATDAI_API_CURIOSITY_BASE_URL = "https://curiosity.test";
assert.deepEqual(clone(workers.getApiWorkers().map((worker) => worker.name)), ["pi", "mac", "curiosity"]);
env.CATDAI_API_MAC_BASE_URL = "https://pi.test/";
assert.equal(workers.getApiWorkerEndpoints("v1/cadastral").length, 2, "duplicate endpoints are not retried");
env.CATDAI_API_MAC_BASE_URL = "https://mac.test";

const lookupId = crypto.randomUUID();
reply = (url) => {
  if (new URL(url).hostname === "pi.test") throw new TypeError("connection refused");
  return success("mac");
};
assert.equal((await cadastru.fetchExternalCadastralData("0100101.001.01.001", { lookupId, lookupQuery: "test query" })).marker, "mac");
assert.deepEqual(attempts.map((attempt) => new URL(attempt.url).hostname), ["pi.test", "mac.test"]);
assert.equal(attempts[0].options.body, attempts[1].options.body);
assert.notEqual(attempts[0].options.headers["X-Request-Id"], attempts[1].options.headers["X-Request-Id"]);
assert.deepEqual(events.map((event) => event.status), ["failure", "success"]);
for (const event of events) assert.equal(event.details.responseHeaders["x-catdai-lookup-id"], lookupId);
assert.equal(events[0].details.responseHeaders["x-catdai-target-node"], "pi");
assert.equal(events[1].details.responseHeaders["x-catdai-node"], "mac");

const routes = [
  [cadastru.fetchExternalCadastralData, "0100101.001.01.001", "/v1/cadastral"],
  [cadastru.fetchExternalCadastruAddressData, { city: "Chișinău", street: "Decebal", house_number: "63" }, "/v1/cadastru/address"],
  [cadastru.fetchExternalNearbyData, { latitude: 47, longitude: 28 }, "/v1/nearby/address"],
  [cadastru.fetchExternalPublicTransportData, { latitude: 47, longitude: 28 }, "/v1/public-transport"],
  [cadastru.fetchExternalMunicipalReportsData, { latitude: 47, longitude: 28 }, "/v1/municipal-reports"],
  [listing.fetchExternal999Listing, "12345678", "/v1/999/listing"],
];
for (const [request, body, path] of routes) {
  reset();
  reply = (url) => {
    if (new URL(url).hostname !== "curiosity.test") throw new TypeError("worker unreachable");
    return success("curiosity");
  };
  assert.equal((await request(body)).marker, "curiosity");
  assert.deepEqual(attempts.map((attempt) => new URL(attempt.url).hostname), ["pi.test", "mac.test", "curiosity.test"]);
  assert(attempts.every((attempt) => new URL(attempt.url).pathname === path));
  assert.deepEqual(events.map((event) => event.status), ["failure", "failure", "success"]);
  assert.deepEqual(healthChecks.map((call) => call.url), ["https://pi.test/health", "https://mac.test/health"]);

  reset();
  reply = () => Response.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  await assert.rejects(request(body), (error) => error.status === 503);
  assert.equal(attempts.length, 1, `${path}: provider outages do not move between workers`);
  assert.equal(healthChecks.length, 0, "the worker error response already proves it is available");
}

for (const [request, body] of [routes[0], routes[5]]) {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    reset();
    reply = (url) => new URL(url).hostname === "pi.test"
      ? Response.json({ ok: false, error: "service_unavailable" }, { status }) : success("mac");
    await assert.rejects(request(body), (error) => error.status === status);
    assert.equal(attempts.length, 1, `worker HTTP ${status} is terminal`);
    assert.equal(healthChecks.length, 0);
  }
  for (const status of [400, 401, 403, 404, 422]) {
    reset();
    reply = () => Response.json({ ok: false, error: status === 404 ? "not_found" : "invalid_input" }, { status });
    await assert.rejects(request(body), (error) => error.status === status);
    assert.equal(attempts.length, 1, `HTTP ${status} is a terminal response`);
  }
  // An unavailable gateway is distinct from the worker's provider-error JSON.
  for (const status of [500, 502, 503, 504, 521, 522, 523, 524, 530]) {
    reset();
    reply = (url) => new URL(url).hostname === "pi.test" ? new Response("gateway unavailable", { status }) : success("mac");
    assert.equal((await request(body)).marker, "mac");
    assert.equal(attempts.length, 2);
    assert.equal(healthChecks.length, 1);
  }
  reset();
  reply = () => new Response("rate limited", { status: 429 });
  await assert.rejects(request(body), (error) => error.status === 429);
  assert.equal(attempts.length, 1);
  assert.equal(healthChecks.length, 0, "rate limits do not cause host failover");

  for (const failure of [() => { throw new DOMException("expired", "TimeoutError"); },
    () => new Response("<html>gateway</html>"),
    () => ({ ok: true, status: 200, headers: new Headers(), text: async () => { throw new Error("body interrupted"); } })]) {
    reset();
    reply = (url) => new URL(url).hostname === "pi.test" ? failure() : success("mac");
    assert.equal((await request(body)).marker, "mac");
    assert.equal(attempts.length, 2);
    assert.equal(healthChecks.length, 1);

    reset();
    healthReply = () => Response.json({ ok: true });
    reply = (url) => new URL(url).hostname === "pi.test" ? failure() : success("mac");
    await assert.rejects(request(body));
    assert.equal(attempts.length, 1, "a healthy worker's slow/broken lookup is not repeated on another host");
    assert.equal(healthChecks.length, 1);
    assert.equal(events.length, 1, "health probes are not counted as API usage");
  }
  for (const failureReply of [
    () => Response.json({ error: "service_unavailable" }, { status: 503 }),
    () => new Response("interrupted", { status: 502, headers: { "x-catdai-node": "pi" } }),
    () => Response.json({ ok: true }, { status: 200 }),
  ]) {
    reset();
    reply = failureReply;
    await assert.rejects(request(body));
    assert.equal(attempts.length, 1, "legacy worker errors, node headers and malformed worker results prove availability");
    assert.equal(healthChecks.length, 0);
  }
  for (const healthFailure of [
    () => Response.json({ ok: false }),
    () => new Response("gateway down", { status: 502 }),
    () => new Response("invalid health body"),
    () => { throw new DOMException("health timed out", "TimeoutError"); },
  ]) {
    reset();
    healthReply = healthFailure;
    reply = (url) => {
      if (new URL(url).hostname === "pi.test") throw new DOMException("lookup timed out", "TimeoutError");
      return success("mac");
    };
    assert.equal((await request(body)).marker, "mac");
    assert.equal(attempts.length, 2);
  }
  reset();
  healthReply = () => Response.json({ ok: true });
  reply = () => new Response("gateway error", { status: 502 });
  await assert.rejects(request(body), (error) => error.status === 502);
  assert.equal(attempts.length, 1, "a gateway lookup error does not move hosts when the worker still answers health");
}
reset();
const choice = { city: "Durlești", road_type: "strada", street: "Cartușa", house_number: "95/4" };
reply = () => Response.json({ ok: false, error: "address_confirmation_required", address_suggestions: [choice] }, { status: 422 });
await assert.rejects(cadastru.fetchExternalCadastruAddressData({}, { captureUsageEventId: true }), (error) => {
  assert.deepEqual(clone(error.addressSuggestions), [choice]);
  assert.equal(error.usageEventId, 1);
  return true;
});
assert.equal(attempts.length, 1);

reset();
reply = (url) => new URL(url).hostname === "pi.test" ? new Response("unavailable", { status: 503 }) : success("mac");
await cadastru.fetchExternalCadastralData("0100101.001.01.001", { trackUsage: false });
assert.equal(attempts.length, 2);
assert.equal(events.length, 0);
env.LISTING999_EXTERNAL_API_SECRET = "listing-specific-test-secret";
await listing.fetchExternal999Listing("12345678");
delete env.LISTING999_EXTERNAL_API_SECRET;

reset();
reply = () => new Response("gateway unavailable", { status: 503 });
await assert.rejects(cadastru.fetchExternalCadastralData("0100101.001.01.001"), (error) => error.status === 503);
assert.equal(attempts.length, 3);
assert.equal(healthChecks.length, 2, "no health probe is needed when there are no fallback hosts left");
delete env.CADASTRU_EXTERNAL_API_SECRET;
reset();
await assert.rejects(cadastru.fetchExternalCadastralData("0100101.001.01.001"), (error) => error.code === "external_cadastru_not_configured");
assert.equal(attempts.length, 0);
console.log("Worker fallbacks passed: all six endpoints, host outages, provider errors, healthy-worker timeouts, health-probe isolation, legacy responses, signing and telemetry.");

env.CADASTRU_EXTERNAL_API_SECRET = "test-secret";
env.CATDAI_API_PI_BASE_URL = "https://pi.test";
env.CATDAI_API_MAC_BASE_URL = "https://mac.test";
env.CATDAI_API_CURIOSITY_BASE_URL = "https://curiosity.test";
const buildingManagement = await load("@/app/api/cadastru/building-management/route");
const address = { city: "Chișinău", road_type: "bulevard", street: "Decebal", house_number: "63" };
const manager = { category: "building_management", scope: "building", name: "ÎMGFL nr. 1", phones: ["022550094"],
  office_address: "str. Nicolae Titulescu 6", assignment: { status: "historical", source_url: "https://example.test/source" } };
const preview = { contacts: [{ name: manager.name, has_office_address: true, phone_count: 1, locked: true }] };
const municipalContact = { category: "municipal_housing_enquiries", scope: "sector", name: "Pretura Botanica" };
const lookupManagement = (fields = address, viewer) => buildingManagement.POST(new Request("https://app.test/api/cadastru/building-management", {
  method: "POST", body: JSON.stringify(fields), headers: viewer ? { Authorization: `Bearer ${viewer}` } : {},
}));
reply = (url, options) => {
  assert.equal(new URL(url).pathname, "/v1/building-management/address");
  assert.deepEqual(JSON.parse(options.body), address);
  if (new URL(url).hostname === "pi.test") {
    return Response.json({ ok: false, error: "not_found" }, { status: 404, headers: { "x-catdai-node": "pi" } });
  }
  return Response.json({ ok: true, data: { contacts: [manager, municipalContact] } });
};
const freshPreview = await lookupManagement({ ...address, apartment_number: "59", unlocked: true });
assert.deepEqual(await freshPreview.json(), preview);
assert.equal(freshPreview.headers.get("Cache-Control"), "private, no-store");
assert.deepEqual(attempts.map(({ url }) => new URL(url).hostname), ["pi.test", "mac.test"]);
assert.equal(healthChecks.length, 0, "a healthy old worker can lack the building-management route");
redis.clear();
reply = () => Response.json({ ok: true, data: { contacts: [municipalContact] } });
assert.deepEqual(await (await lookupManagement()).json(), { contacts: [] });
redis.clear();
reset();
reply = () => Response.json({ ok: false, error: "not_found" }, { status: 404 });
assert.deepEqual(await (await lookupManagement()).json(), { contacts: [] });
assert.deepEqual(attempts.map(({ url }) => new URL(url).hostname), ["pi.test", "mac.test", "curiosity.test"]);
reply = () => Response.json({ ok: false, error: "service_unavailable" }, { status: 503 });
assert.equal((await lookupManagement()).status, 503);
const attemptsBeforeInvalidAddress = attempts.length;
assert.equal((await lookupManagement({ ...address, house_number: "63 or 65" })).status, 400);
assert.equal(attempts.length, attemptsBeforeInvalidAddress);
console.log("Building management route passed: signed fallback from Pi to Mac, exact-building contacts, empty matches, invalid input and unavailable worker.");

redis.clear();
reset();
env.ENABLE_RUNTIME_PERSISTENCE = "true";
database = new PGlite();
await database.exec("create role anon; create role authenticated; create role service_role bypassrls;");
await database.exec(await fs.readFile("supabase/migrations/20261114093711_cadastru_building_management.sql", "utf8"));
const table = "cadastru_building_management";
const dbRows = async () => (await database.query(`select * from ${table}`)).rows;
try {
  await database.exec("set role service_role");
  reply = () => Response.json({ ok: true, data: { contacts: [manager] } });
  const house = { ...address, house_number: "13 / 3a" };
  assert.deepEqual(await (await lookupManagement({ ...house, apartment_number: "59" })).json(), preview);
  const [saved] = await dbRows();
  assert.deepEqual(saved.lookup_input, { ...address, house_number: "13/3A" });
  assert.deepEqual(saved.raw_payload, { contacts: [manager] });
  assert.equal(saved.expires_at - saved.fetched_at, 30 * 24 * 60 * 60 * 1000);
  assert.equal(redis.values().next().value.ttl, 30 * 24 * 60 * 60);

  const sameBuilding = { ...house, street: "DECEBAL", house_number: "13/3A", apartment_number: "60" };
  assert.deepEqual(await (await lookupManagement(sameBuilding)).json(), preview);
  assert.equal(attempts.length, 1, "a different apartment uses the same Redis entry");
  savedProperty = { house };
  assert.deepEqual(await (await lookupManagement({ cadastral_number: unlockedNumber })).json(), preview);
  assert.deepEqual(await (await lookupManagement({ cadastral_number: unlockedNumber }, "unused-credit")).json(), preview);
  assert.deepEqual(await (await lookupManagement(house, "buyer")).json(), preview);
  assert.deepEqual(await (await lookupManagement({ ...house, cadastral_number: "0100106.131.01.060" }, "buyer")).json(), preview);
  assert.deepEqual(await (await lookupManagement({ ...address, cadastral_number: unlockedNumber }, "buyer")).json(), { contacts: [manager] });
  assert.deepEqual(await (await lookupManagement({ ...address, share_slug: publicShare })).json(), { contacts: [manager] });
  assert.equal((await lookupManagement({ ...address, share_slug: "invalid" })).status, 404);
  assert.equal(attempts.length, 1, "authorized requests use the verified stored address, ignoring a substituted address");
  redis.clear();
  assert.deepEqual(await (await lookupManagement(sameBuilding)).json(), preview);
  assert.equal(attempts.length, 1, "a Redis miss reads Supabase before the worker");
  assert.equal(redis.size, 1, "the DB hit repopulates Redis");
  assert.deepEqual(await dbRows(), [saved], "reads leave source dates intact");

  redis.clear();
  await database.exec(`update ${table} set fetched_at = now() - interval '31 days', expires_at = now() - interval '1 day'`);
  const [expired] = await dbRows();
  assert.deepEqual(await (await lookupManagement(house)).json(), preview);
  assert.equal(attempts.length, 1, "expired contacts return before the background refresh");
  reply = () => Response.json({ ok: false, error: "not_found" }, { status: 404 });
  await refreshes.shift().refresh();
  assert.deepEqual(await dbRows(), [expired], "ambiguous 404s do not replace saved contacts");
  assert.deepEqual(await (await lookupManagement(house)).json(), preview);
  reply = () => Response.json({ ok: true, data: { contacts: [municipalContact] } });
  await refreshes.shift().refresh();
  assert.deepEqual(await (await lookupManagement(house)).json(), { contacts: [] });
  assert.deepEqual((await dbRows())[0].raw_payload, { contacts: [] });

  assert.deepEqual(await (await lookupManagement({ ...house, house_number: "13/3" })).json(), { contacts: [] });
  assert.equal((await dbRows()).length, 2, "different house suffixes use separate rows");
  for (const role of ["anon", "authenticated"]) {
    await database.exec(`set role ${role}`);
    await assert.rejects(database.query(`select * from ${table}`), /permission denied/);
  }
} finally {
  await database.close();
}
console.log("Building management cache passed: shared building keys, Redis hits, database refill, stale refresh, empty snapshots and service-role access.");
