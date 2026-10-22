// Isolated worker routing checks: no network calls or database writes.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";

const env = { CADASTRU_EXTERNAL_API_BASE_URL: "https://pi.test", CADASTRU_EXTERNAL_API_SECRET: "test-secret" };
const attempts = [], events = [];
let reply = () => Response.json({ ok: true, data: { marker: "success" } });
const context = vm.createContext({ console, process: { env }, Date, URL, AbortSignal,
  fetch: async (url, options) => {
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
const mocks = {
  "node:crypto": { default: crypto },
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
const reset = () => { attempts.length = 0; events.length = 0; };
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
  reply = (url) => new URL(url).hostname === "curiosity.test" ? success("curiosity")
    : Response.json({ ok: false, error: "service_unavailable" }, { status: 502 });
  assert.equal((await request(body)).marker, "curiosity");
  assert.deepEqual(attempts.map((attempt) => new URL(attempt.url).hostname), ["pi.test", "mac.test", "curiosity.test"]);
  assert(attempts.every((attempt) => new URL(attempt.url).pathname === path));
  assert.deepEqual(events.map((event) => event.status), ["failure", "failure", "success"]);
}

for (const [request, body] of [routes[0], routes[5]]) {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    reset();
    reply = (url) => new URL(url).hostname === "pi.test"
      ? Response.json({ ok: false, error: "service_unavailable" }, { status }) : success("mac");
    assert.equal((await request(body)).marker, "mac");
    assert.equal(attempts.length, 2);
  }
  for (const status of [400, 401, 403, 404, 422]) {
    reset();
    reply = () => Response.json({ ok: false, error: status === 404 ? "not_found" : "invalid_input" }, { status });
    await assert.rejects(request(body), (error) => error.status === status);
    assert.equal(attempts.length, 1, `HTTP ${status} is a terminal response`);
  }
  for (const failure of [() => { throw new DOMException("expired", "TimeoutError"); },
    () => new Response("<html>gateway</html>"),
    () => ({ ok: true, status: 200, headers: new Headers(), text: async () => { throw new Error("body interrupted"); } })]) {
    reset();
    reply = (url) => new URL(url).hostname === "pi.test" ? failure() : success("mac");
    assert.equal((await request(body)).marker, "mac");
    assert.equal(attempts.length, 2);
  }
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
reply = () => Response.json({ ok: false, error: "service_unavailable" }, { status: 503 });
await assert.rejects(cadastru.fetchExternalCadastralData("0100101.001.01.001"), (error) => error.status === 503);
assert.equal(attempts.length, 3);
delete env.CADASTRU_EXTERNAL_API_SECRET;
reset();
await assert.rejects(cadastru.fetchExternalCadastralData("0100101.001.01.001"), (error) => error.code === "external_cadastru_not_configured");
assert.equal(attempts.length, 0);
console.log("Worker fallbacks passed: legacy configuration, all six endpoints, signing, telemetry, availability failures, terminal results, body failures and secret overrides.");
