// Isolated grouping and telemetry checks; no network or live database writes.
// pnpm exec node --experimental-vm-modules scripts/test-admin-api-log-grouping.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const context = vm.createContext({ console, Date, URL, AbortSignal, crypto,
  process: { env: { CADASTRU_EXTERNAL_API_BASE_URL: "https://worker.test", CADASTRU_EXTERNAL_API_SECRET: "test-secret" } } });
const recorded = [];
let mode = "success";
context.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  assert.equal(body.lookup_id, undefined, "correlation metadata never enters the worker body");
  assert.equal(options.headers["x-catdai-lookup-id"], undefined);
  if (mode === "network") throw new TypeError("offline");
  return Response.json(mode === "success" ? { ok: true, data: { status: "success" } }
    : { error: "service_unavailable", message: "offline" }, { status: mode === "success" ? 200 : 503 });
};
const mocks = {
  "node:crypto": { default: crypto },
  "@/lib/external-api-usage": {
    getExternalApiDiagnosticHeaders: () => ({ "content-type": "application/json" }),
    trackExternalApiUsage: (service, status, details) => {
      recorded.push({ id: recorded.length + 1, service, status, endpoint: details.endpoint,
        request_payload: details.requestPayload, response_headers: details.responseHeaders,
        created_at: new Date(1_000_000 + recorded.length * 1000).toISOString() });
      return Promise.resolve(null);
    },
  },
};
async function load(file, extraSource = "") {
  const loadedModule = new vm.SourceTextModule((await fs.readFile(file, "utf8")) + extraSource, { context });
  await loadedModule.link((name) => {
    const exports = mocks[name];
    assert(exports, `Unexpected import: ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await loadedModule.evaluate();
  return loadedModule.namespace;
}
const { getCadastruLookupTracking } = await load("src/lib/cadastru-lookup-tracking.js");
const { groupExternalApiEvents } = await load("src/lib/admin-external-api-groups.js");
const worker = await load("src/lib/cadastru-external-api.js");
const id = crypto.randomUUID();
const query = "Chișinău, strada Decebal 63, ap. 1";
const tracking = getCadastruLookupTracking({ lookup_id: id, lookup_query: query });
assert.equal(tracking.lookupId, id);
assert.equal(getCadastruLookupTracking({ lookup_id: "invalid" }).lookupId, undefined);
assert.equal(getCadastruLookupTracking({ lookup_id: id, lookup_query: "x".repeat(1000) }).lookupQuery.length, 500);
await worker.fetchExternalCadastruAddressData({ city: "Chișinău", street: "Decebal", house_number: "63" }, tracking);
await worker.fetchExternalCadastralData("0100106.131.01.097", tracking);
await worker.fetchExternalNearbyData({ city: "Chișinău", street: "Decebal", house_number: "63" }, tracking);
mode = "failure";
await assert.rejects(worker.fetchExternalPublicTransportData({ address: query }, tracking));
mode = "network";
await assert.rejects(worker.fetchExternalMunicipalReportsData({ address: query }, tracking));
for (const row of recorded) assert.equal(row.response_headers["x-catdai-lookup-id"], id,
  "success, HTTP failure and network failure all retain the search ID");
let groups = groupExternalApiEvents(recorded);
assert.equal(groups.length, 1);
assert.equal(groups[0].query, query);
assert.equal(groups[0].success, 3);
assert.equal(groups[0].failure, 2);
assert.equal(groups[0].events.length, 5);
assert.equal(groups[0].mainFailure, 0);
assert.equal(groupExternalApiEvents(recorded, "failure").length, 0,
  "secondary failures do not enter the Failed filter");
for (const service of ["cadastru_address", "cadastru_number"]) {
  const failedMain = recorded.map((event, index) => index === 0 ? { ...event, service, status: "failure" } : event);
  const failedGroups = groupExternalApiEvents(failedMain, "failure");
  assert.equal(failedGroups.length, 1, `${service} failure enters the Failed filter`);
  assert.equal(failedGroups[0].mainFailure, 1);
  assert.equal(failedGroups[0].events.length, 5, "failed searches retain all sibling calls");
}
assert.equal(groupExternalApiEvents(recorded.filter((event) => event.service === "cadastru_nearby"), "failure").length, 0,
  "secondary-only failures with a cached primary never become main lookup failures");
assert.equal(groupExternalApiEvents([{ ...recorded[0], service: "999_listing", status: "failure" }], "failure").length, 0,
  "the key Failed filter is reserved for Cadastru address and number lookups");
assert.equal(groupExternalApiEvents(recorded, "success").length, 1);

mode = "success";
await worker.fetchExternalNearbyData({ address: query }, getCadastruLookupTracking({ lookup_id: crypto.randomUUID(), lookup_query: query }));
groups = groupExternalApiEvents(recorded);
assert.equal(groups.length, 2, "repeated searches at the same address stay separate");
assert.equal(groups[0].events.length, 1, "a cached primary with only a secondary worker call still has a group");
assert.equal(groups[0].query, query);
assert.equal(groupExternalApiEvents(recorded, "failure").length, 0);
const historical = [1, 2].map((id) => ({ id: `old-${id}`, service: "cadastru_address", status: "success",
  created_at: recorded[0].created_at, request_payload: { address: query } }));
const listing = { ...recorded[0], id: "listing", service: "999_listing" };
assert.equal(groupExternalApiEvents([...historical, listing, ...recorded]).length, 5,
  "unlinked history and unrelated services never merge by time, query or copied metadata");
assert.equal(groupExternalApiEvents(recorded.filter((event) => event.id !== 1)).length, 2,
  "deleting the primary log does not split its remaining calls");
assert.equal(groupExternalApiEvents([], "failure").length, 0);
console.log("Admin API grouping passed: exact search identity, primary handoff, secondary-only groups, filters, deletion, history and failure telemetry.");

const legacyAddress = { city: "Bălți", road_type: "strada", street: "Mihail Alexeev", house_number: "5" };
const legacyCalls = [
  { id: "legacy-nearby", service: "cadastru_nearby", endpoint: "/v1/nearby/address", status: "failure",
    request_payload: legacyAddress, created_at: "2026-10-14T07:01:10Z", duration_ms: 70_000 },
  { id: "legacy-transport", service: "cadastru_nearby", endpoint: "/v1/public-transport", status: "success",
    request_payload: legacyAddress, created_at: "2026-10-14T07:00:01Z", duration_ms: 1000 },
  { id: "legacy-main", service: "cadastru_address", endpoint: "/v1/cadastru/address", status: "success",
    request_payload: legacyAddress, created_at: "2026-10-14T07:00:00Z", duration_ms: 10_000 },
];
let legacyGroups = groupExternalApiEvents(legacyCalls);
assert.equal(legacyGroups.length, 1, "the three older Bălți calls in the screenshot form one search");
assert.equal(legacyGroups[0].events.length, 3);
assert.equal(legacyGroups[0].inferred, true);
assert.equal(legacyGroups[0].failure, 1);
assert.equal(groupExternalApiEvents(legacyCalls, "failure").length, 0, "legacy secondary errors are also excluded");
assert.equal(groupExternalApiEvents(legacyCalls.map(({ duration_ms, ...event }) => event)).length, 1,
  "older logs without durations still group within the two-minute completion window");
const numberPrimary = { ...legacyCalls[2], service: "cadastru_number", request_payload: { cadastral_number: "0100106.131.01.097" },
  response_payload: { ok: true, data: { apartment: { address: "mun. Bălți, str. Mihail Alexeev, 5, ap. 10" } } } };
assert.equal(groupExternalApiEvents([numberPrimary, ...legacyCalls.slice(0, 2)]).length, 1,
  "number lookups use their returned address to match the follow-up building requests");
assert.equal(groupExternalApiEvents(legacyCalls.slice(0, 2)).length, 1,
  "secondary-only legacy calls also group when the primary was cached");
assert.equal(groupExternalApiEvents([...legacyCalls, { ...legacyCalls[2], id: "another-primary" }]).length, 4,
  "overlapping primary searches do not guess which visitor owns secondary calls");
assert.equal(groupExternalApiEvents([...legacyCalls, { ...legacyCalls[0], id: "repeat-nearby" }]).length, 2,
  "a second call to the same endpoint is not absorbed into the first search");
assert.equal(groupExternalApiEvents(legacyCalls.map((event) => ({ ...event,
  user_id: event.service === "cadastru_address" ? "first-user" : "second-user" }))).length, 2,
  "known different users are not combined");
assert.equal(groupExternalApiEvents(legacyCalls.map((event) => ({ ...event,
  user_id: event.id === "legacy-nearby" ? "first-user" : event.id === "legacy-transport" ? "second-user" : null }))).length, 2,
  "conflicting secondary users stay separate even if the primary identity was not recorded");
assert.equal(groupExternalApiEvents([...legacyCalls, ...legacyCalls.map((event) => ({ ...event,
  id: `later-${event.id}`, created_at: new Date(Date.parse(event.created_at) + 600_000).toISOString() }))]).length, 2,
  "a later query at the same address remains a separate search");
assert.equal(groupExternalApiEvents(legacyCalls.map((event) => event.id === "legacy-nearby"
  ? { ...event, request_payload: { ...legacyAddress, house_number: "6" } } : event)).length, 2,
  "different houses stay separate");
console.log("Older API grouping passed: screenshot example, durations, number response addresses, cached primaries, filters and ambiguous/repeated searches.");

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require("next/dist/build/swc");
await loadBindings();
const { code } = await transform(await fs.readFile("src/app/admin/page.js", "utf8"), {
  filename: "src/app/admin/page.js",
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  module: { type: "es6" },
});
const slots = [];
let cursor = 0;
let confirmations = 0;
const noop = () => null;
const jsx = (type, props) => ({ type, props });
const uiContext = vm.createContext({ console, Date, URLSearchParams,
  window: { confirm: () => { confirmations++; return false; } } });
const uiMocks = {
  react: { Fragment: "Fragment", useCallback: (fn) => fn, useEffect: noop,
    useState: (initial) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
    }, useRef: (value) => ({ current: value }) },
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
  "@/lib/admin-external-api-groups": { groupExternalApiEvents },
};
const uiModule = new vm.SourceTextModule(code, { context: uiContext });
await uiModule.link((name) => {
  const exports = uiMocks[name] || (name.startsWith("@/components/") ? { default: noop } : null);
  assert(exports, `Unexpected UI import: ${name}`);
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context: uiContext });
});
await uiModule.evaluate();
function render() { cursor = 0; return uiModule.namespace.default(); }
function nodes(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => nodes(child, predicate));
  return [...(predicate(node) ? [node] : []), ...nodes(typeof node.type === "function"
    ? node.type(node.props) : node.props?.children, predicate)];
}
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return typeof node === "object" ? textOf(typeof node.type === "function"
    ? node.type(node.props) : node.props?.children) : String(node);
}
render();
slots[0] = false;
slots[2] = { periodLabel: "1 month", externalApiUsage: { total: recorded.length, events: recorded,
  detailsAvailable: true, byService: {} } };
let tree = render();
nodes(tree, (node) => node.props?.label === "External API")[0].props.onClick();
tree = render();
let rows = nodes(tree, (node) => node.type === "tr" && node.props.role === "button");
assert.equal(rows.length, 2, "collapsed table shows searches rather than six separate calls");
rows.find((row) => /5\s+calls/.test(textOf(row))).props.onKeyDown({ key: "Enter", preventDefault() {} });
tree = render();
rows = nodes(tree, (node) => node.type === "tr" && node.props.role === "button");
assert.equal(rows.length, 7, "expanding a search reveals all five calls");
assert(textOf(tree).includes("Public transport") && textOf(tree).includes("Municipal reports"));
rows.find((row) => textOf(row).includes("Municipal reports")).props.onClick();
tree = render();
assert(textOf(tree).includes("Worker response") && textOf(tree).includes("Diagnostic response headers"));
nodes(tree, (node) => node.type === "button" && node.props["aria-label"] === "Delete API log 5")[0]
  .props.onClick({ stopPropagation() {} });
assert.equal(confirmations, 1, "nested call deletion retains confirmation");
nodes(tree, (node) => node.type === "button" && node.props.children === "Failed")[0].props.onClick();
tree = render();
assert.equal(nodes(tree, (node) => node.type === "tr" && node.props.role === "button").length, 0,
  "Failed hides successful Cadastru searches with secondary errors");
slots[2] = { ...slots[2], externalApiUsage: { ...slots[2].externalApiUsage,
  events: recorded.map((event) => event.id === 1 ? { ...event, status: "failure" } : event) } };
tree = render();
assert.equal(nodes(tree, (node) => node.type === "tr" && node.props.role === "button").length, 1);
assert(/5\s+calls/.test(textOf(tree)), "failed main lookup retains all siblings for context");
nodes(tree, (node) => node.type === "button" && node.props.children === "All")[0].props.onClick();
console.log("Admin grouped table passed: collapsed searches, keyboard expansion, service labels, call payloads, deletion and status filters.");

slots[2] = { ...slots[2], externalApiUsage: { ...slots[2].externalApiUsage, events: legacyCalls } };
tree = render();
rows = nodes(tree, (node) => node.type === "tr" && node.props.role === "button");
assert.equal(rows.length, 1, "older logs display one combined search row in the table");
assert(textOf(tree).includes("Cadastru search (older logs)"));
assert(textOf(tree).includes("With failures"), "secondary failure keeps the warning badge");
assert(/2\s+successful\s+·\s+0\s+failed\s+·\s+1 other errors/.test(textOf(tree)),
  "secondary errors stay visible without increasing failed counts");
rows[0].props.onClick();
assert.equal(nodes(render(), (node) => node.type === "tr" && node.props.role === "button").length, 4,
  "the older combined row expands into its three individual calls");

// Daily aggregates include history beyond the latest 200 event details.
mocks["@/lib/supabase-admin"] = { supabaseAdmin: {} };
mocks["@/lib/admin-auth"] = { requireAdminApiAuth: () => null };
mocks["next/server"] = { NextResponse: {} };
const { buildExternalApiUsageStats } = await load("src/app/api/admin/stats/route.js",
  "\nexport { buildExternalApiUsageStats };");
const daily = [
  { service: "cadastru_address", status: "success", count: 300 },
  { service: "cadastru_address", status: "failure", count: 3 },
  { service: "cadastru_number", status: "failure", count: "2" },
  { service: "cadastru_nearby", status: "failure", count: 7 },
  { service: "999_listing", status: "failure", count: 4 },
];
const usage = buildExternalApiUsageStats(daily, { available: true, rows: recorded });
assert.equal(usage.total, 316, "all worker calls remain counted");
assert.equal(usage.success, 300);
assert.equal(usage.failure, 5, "only address/number failures enter the key failed counter");
assert.equal(usage.otherFailure, 11, "secondary and listing errors remain separately visible");
assert.equal(usage.byService.cadastru_nearby.failure, 7, "raw per-service diagnostics stay intact");
assert.equal(usage.total, usage.success + usage.failure + usage.otherFailure);
assert.equal(buildExternalApiUsageStats(daily, { available: false, rows: [] }).failure, 5,
  "aggregate-only history uses the same classification when event details are unavailable");
assert.equal(buildExternalApiUsageStats([], { available: true, rows: [] }).failure, 0);
console.log("Admin API failure totals passed: primary failures, other errors, historical totals and unavailable details.");
