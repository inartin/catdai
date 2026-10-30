import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { loadAppModule } from "./lib/load-app-module.mjs";

const data = {
  available: true, state: "running", updatedAt: "2026-10-26T09:30:00.000Z",
  totals: { total: 3471, processed: 740, complete: 702, partial: 38, pending: 2731, running: 2, skipped: 0 },
  addressProgress: { complete: 702, retry: 30, working: 100, empty: 2639 },
  categories: Object.fromEntries(["cadastru", "nearby", "transport", "reports"].map(key => [key, { saved: 702, missing: 38 }])),
  current: { address: "Chișinău, str Test 5", categories: { cadastru: "complete", nearby: "pending" } },
  retry: [{ id: "one", address: "Chișinău, str Test 2", missing: [{ category: "nearby", error: "Provider timed out" }] }],
  lastEvent: "2026-10-26T09:30:00.000Z nearby: fetching",
};
const workers = ["pi", "mac", "curiosity"].map(name => ({ name, url: `https://${name}.test` }));
let calls = 0;
const replies = { pi: { available: false }, mac: data, curiosity: { ...data, state: "stopped", updatedAt: "2026-10-26T10:00:00.000Z" } };
const helperContext = vm.createContext({ Date, URL, AbortSignal,
  process: { env: { CADASTRU_EXTERNAL_API_SECRET: "test-secret", SUPABASE_URL: "https://example.supabase.co" } },
  fetch: async (url, options) => {
    calls++;
    assert.equal(url.pathname, "/v1/collector/status");
    assert.equal(options.method, "POST");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.deepEqual(JSON.parse(options.body), { database_host: "example.supabase.co" });
    const timestamp = options.headers["X-Catdai-Timestamp"];
    assert.equal(options.headers["X-Catdai-Signature"], `sha256=${crypto.createHmac("sha256", "test-secret").update(`${timestamp}\n${options.body}`).digest("hex")}`);
    return Response.json({ ok: true, data: replies[url.hostname.split(".")[0]] });
  },
});
const helper = new vm.SourceTextModule(await fs.readFile("src/lib/admin-collector-status.js", "utf8"), { context: helperContext });
const helperMocks = { "node:crypto": { default: crypto }, "@/lib/api-workers": { getApiWorkers: () => workers } };
await helper.link(name => new vm.SyntheticModule(Object.keys(helperMocks[name]), function () {
  for (const [key, value] of Object.entries(helperMocks[name])) this.setExport(key, value);
}, { context: helperContext }));
await helper.evaluate();
let result = await helper.namespace.fetchCollectorStatus();
assert.equal(result.worker, "mac", "the running collector wins over a newer stopped checkpoint");
assert.equal(result.totals.complete, 702);
replies.mac = { ...data, state: "stopped" };
result = await helper.namespace.fetchCollectorStatus();
assert.equal(result.worker, "curiosity", "with no active collector use the newest checkpoint");
replies.mac = { ...data, totals: {} };
replies.curiosity = { available: false };
assert.equal((await helper.namespace.fetchCollectorStatus()).available, false, "invalid/unavailable checkpoints never become zero progress");
replies.mac = data;
const route = await loadAppModule("src/app/api/admin/collector-status/route.js", {
  "next/server": { NextResponse: { json: Response.json } },
  "@/lib/admin-auth": { requireAdminApiAuth: request => request.authorized ? null : new Response(null, { status: 401 }) },
  "@/lib/admin-collector-status": { fetchCollectorStatus: helper.namespace.fetchCollectorStatus },
});
const beforeUnauthorized = calls;
assert.equal((await route.GET({})).status, 401);
assert.equal(calls, beforeUnauthorized, "admin authentication precedes every worker request");
const response = await route.GET({ authorized: true });
assert.equal(response.headers.get("cache-control"), "private, no-store");
assert.equal((await response.json()).totals.complete, 702);
console.log("Collector API passed: signed concurrent worker requests, source selection, auth, uncached responses and unavailable states.");

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require("next/dist/build/swc");
await loadBindings();
const slots = [], effects = [], listeners = new Map();
let cursor = 0, timerCallback, timerCleared = false, resolveFetch, fetches = 0;
const document = { visibilityState: "visible", addEventListener: (event, handler) => listeners.set(event, handler), removeEventListener: event => listeners.delete(event) };
const jsx = (type, props) => ({ type, props });
const uiContext = vm.createContext({ Date, AbortSignal, AbortController, document,
  setInterval(callback, milliseconds) { assert.equal(milliseconds, 10_000); timerCallback = callback; return 1; },
  clearInterval() { timerCleared = true; },
  fetch: async (url, options) => {
    assert.equal(url, "/api/admin/collector-status"); assert.equal(options.cache, "no-store");
    fetches++;
    return new Promise(resolve => { resolveFetch = resolve; });
  },
});
const mocks = { react: {
  useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
  useEffect(effect) { effects.push(effect); },
}, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" } };
const transformed = await transform(await fs.readFile("src/components/admin/AdminCollectorStatus.js", "utf8"), {
  filename: "AdminCollectorStatus.js", jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "es6" },
});
const ui = new vm.SourceTextModule(transformed.code, { context: uiContext });
await ui.link(name => new vm.SyntheticModule(Object.keys(mocks[name]), function () {
  for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
}, { context: uiContext }));
await ui.evaluate();
const render = () => { cursor = 0; effects.length = 0; return ui.namespace.default({}); };
const textOf = node => node == null || typeof node === "boolean" ? "" : Array.isArray(node) ? node.map(textOf).join(" ")
  : typeof node === "object" ? textOf(node.props?.children) : String(node);
const nodes = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const settle = () => new Promise(setImmediate);
let tree = render();
assert(textOf(tree).includes("Loading live collector statistics"));
const cleanup = effects[0]();
timerCallback();
assert.equal(fetches, 1, "polls cannot overlap a pending request");
resolveFetch(Response.json({ ...data, worker: "mac" })); await settle();
tree = render();
for (const value of ["702", "740", "38", "Running", "Chișinău, str Test 5", "Nearby places", "Needs retry", "Partly saved / queued", "No data saved"]) assert(textOf(tree).includes(value));
nodes(tree).find(node => node.type === "button" && textOf(node) === "See what is missing").props.onClick();
tree = render();
assert(textOf(tree).includes("Provider timed out"));
document.visibilityState = "hidden"; timerCallback();
assert.equal(fetches, 1, "hidden tabs do not poll");
document.visibilityState = "visible"; listeners.get("visibilitychange")();
assert.equal(fetches, 2, "returning to the tab refreshes immediately");
tree = render();
assert(textOf(tree).includes("702"), "previous statistics remain visible while refreshing");
resolveFetch(Response.json({ available: false })); await settle();
tree = render();
assert(textOf(tree).includes("Showing the last received statistics"));
assert(textOf(tree).includes("702"));
timerCallback();
resolveFetch(Response.json({ ...data, worker: "mac", state: "stopped", current: null, totals: { ...data.totals, complete: 703 }, addressProgress: { ...data.addressProgress, complete: 703, empty: 2638 } })); await settle();
tree = render();
assert(textOf(tree).includes("Stopped"));
assert(textOf(tree).includes("703"));
assert(!textOf(tree).includes("Showing the last received statistics"));
cleanup();
assert(timerCleared); assert.equal(listeners.size, 0);
console.log("Collector UI passed: real totals/current address, missing-data details, polling, tab visibility, stopped state, stale snapshots and cleanup.");

replies.mac = { ...data, addressProgress: { ...data.addressProgress, empty: 1 } };
assert.equal((await helper.namespace.fetchCollectorStatus()).available, false, "inconsistent address totals are rejected");
const legacy = { ...data }; delete legacy.addressProgress;
replies.mac = legacy;
assert.equal((await helper.namespace.fetchCollectorStatus()).available, true, "older workers retain existing status data");
slots[0] = { ...legacy, worker: "mac" };
assert(textOf(render()).includes("Update the collector API worker"));
console.log("Collector address groups passed: exact counts, invalid-total rejection and older-worker notice.");
