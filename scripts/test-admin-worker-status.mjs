// Isolated admin health checks: no network calls or database writes.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const env = {};
let authorized = false;
const calls = [];
let reply = () => Response.json({ ok: true });
const context = vm.createContext({ Date, URL, AbortSignal, process: { env },
  fetch: async (url, options) => { calls.push({ url, options }); return reply(url, options); },
});
const workers = new vm.SourceTextModule(await fs.readFile("src/lib/api-workers.js", "utf8"), { context });
await workers.link(() => { throw new Error("Worker config has no dependencies"); });
await workers.evaluate();
const mocks = {
  "next/server": { NextResponse: { json: Response.json } },
  "@/lib/admin-auth": { requireAdminApiAuth: () => authorized ? null : Response.json({}, { status: 401 }) },
};
const mod = new vm.SourceTextModule(await fs.readFile("src/app/api/admin/worker-status/route.js", "utf8"), { context });
await mod.link((name) => name === "@/lib/api-workers" ? workers : new vm.SyntheticModule(Object.keys(mocks[name]), function () {
  for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
}, { context }));
await mod.evaluate();
const { GET } = mod.namespace;
const check = async () => {
  const response = await GET({});
  assert.equal(response.headers.get("cache-control"), "no-store");
  const data = await response.json();
  assert(Number.isFinite(Date.parse(data.checkedAt)));
  assert.deepEqual(data.workers.map((worker) => worker.name), ["pi", "mac", "curiosity"]);
  return data.workers;
};
assert.equal((await GET({})).status, 401);
assert.equal(calls.length, 0);
authorized = true;
assert((await check()).every((worker) => worker.status === "not_configured"));
for (const value of ["invalid", "file:///tmp/worker", "https://user:secret@worker.test"]) {
  env.CADASTRU_EXTERNAL_API_BASE_URL = value;
  assert((await check()).every((worker) => worker.status === "not_configured"));
}
assert.equal(calls.length, 0);
env.CADASTRU_EXTERNAL_API_BASE_URL = "https://pi.test/";
let data = await check();
assert.equal(data[0].status, "online");
assert.equal(data[0].appVersion, null, "old workers remain compatible");
assert.equal(calls.at(-1).url.href, "https://pi.test/health");
delete env.CADASTRU_EXTERNAL_API_BASE_URL;
env.CADASTRU_EXTERNAL_ADDRESS_API_URL = "https://legacy.test/v1/cadastru/address";
await check();
assert.equal(calls.at(-1).url.href, "https://legacy.test/health");
delete env.CADASTRU_EXTERNAL_ADDRESS_API_URL;
env.CATDAI_API_PI_BASE_URL = "https://pi.test";
env.CATDAI_API_MAC_BASE_URL = "https://mac.test";
env.CATDAI_API_CURIOSITY_BASE_URL = "https://curiosity.test";
reply = (url) => {
  const name = url.hostname.split(".")[0];
  return name === "pi" ? new Response("gateway", { status: 502 })
    : Response.json({ ok: true, node_name: name, app_version: "a".repeat(40), node_version: "v24.10.0" });
};
data = await check();
assert.deepEqual(data.map((worker) => worker.status), ["offline", "online", "online"]);
assert.equal(data[0].detail, "HTTP 502");
assert.equal(data[0].responseTimeMs, null);
assert.equal(data[1].nodeName, "mac");
assert.equal(data[1].nodeVersion, "v24.10.0");
assert.equal(data[2].appVersion, "a".repeat(40));
for (const call of calls) {
  assert.equal(call.options.cache, "no-store");
  assert.equal(call.options.redirect, "error");
  assert(call.options.signal instanceof AbortSignal);
  assert.equal(call.options.headers, undefined, "worker credentials never leave with health requests");
}
const before = calls.length;
await check();
assert.equal(calls.length, before + 3);
for (const payload of [{ ok: false }, { ok: "true" }, {}]) {
  reply = () => Response.json(payload);
  assert((await check()).every((worker) => worker.status === "offline"));
}
reply = () => new Response("<html>gateway</html>");
assert((await check()).every((worker) => worker.status === "offline"));
reply = () => { throw new TypeError("private connection details"); };
data = await check();
assert(data.every((worker) => worker.detail === "Unreachable"));
assert(!JSON.stringify(data).includes("private"));
reply = () => { throw new DOMException("expired", "TimeoutError"); };
assert((await check()).every((worker) => worker.detail === "Timed out"));

const pending = [];
reply = () => new Promise((resolve) => pending.push(resolve));
const checking = check();
assert.equal(pending.length, 3, "hosts are checked concurrently");
pending.forEach((resolve) => resolve(Response.json({ ok: true })));
assert((await checking).every((worker) => worker.status === "online"));
console.log("Worker status passed: admin authentication, three hosts, legacy URLs, parallel live checks, versions, invalid responses and sanitized failures.");

// Render the actual status component and exercise refresh without a Next server.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { transform, loadBindings } = require("next/dist/build/swc");
await loadBindings();
const slots = [], effects = [];
let cursor = 0;
const jsx = (type, props) => ({ type, props });
const uiPayload = { checkedAt: new Date().toISOString(), workers: [
  { name: "pi", status: "offline", detail: "HTTP 502" },
  { name: "mac", status: "online", responseTimeMs: 12, nodeName: "mac", appVersion: "a".repeat(40), nodeVersion: "v24.10.0" },
  { name: "curiosity", status: "not_configured" },
] };
const uiMocks = {
  react: {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useEffect(effect) { effects.push(effect); },
  },
  "react/jsx-runtime": { jsx, jsxs: jsx },
};
let uiFetches = 0;
const uiContext = vm.createContext({ Date, AbortSignal, AbortController,
  fetch: async (url) => { assert.equal(url, "/api/admin/worker-status"); uiFetches++; return Response.json(uiPayload); },
});
const transformed = await transform(await fs.readFile("src/components/admin/AdminWorkerStatus.js", "utf8"), {
  filename: "AdminWorkerStatus.js", jsc: { parser: { syntax: "ecmascript", jsx: true },
    transform: { react: { runtime: "automatic" } } }, module: { type: "es6" },
});
const ui = new vm.SourceTextModule(transformed.code, { context: uiContext });
await ui.link((name) => new vm.SyntheticModule(Object.keys(uiMocks[name]), function () {
  for (const [key, value] of Object.entries(uiMocks[name])) this.setExport(key, value);
}, { context: uiContext }));
await ui.evaluate();
const render = () => { cursor = 0; effects.length = 0; return ui.namespace.default(); };
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  return typeof node === "object" ? textOf(node.props?.children) : String(node);
}
function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
let tree = render();
assert(textOf(tree).includes("Checking…"));
const cleanup = effects[0]();
await new Promise(setImmediate);
tree = render();
const text = textOf(tree);
for (const label of ["pi", "mac", "curiosity", "Offline", "Online", "Not configured", "HTTP 502", "aaaaaaaa", "v24.10.0"])
  assert(text.includes(label), `Status component displays ${label}`);
const button = nodes(tree).find((node) => node.type === "button");
assert(button.props.className.includes("cursor-pointer"));
button.props.onClick();
tree = render();
assert(nodes(tree).find((node) => node.type === "button").props.disabled);
const refreshedCleanup = effects[0]();
await new Promise(setImmediate);
assert.equal(uiFetches, 2);
cleanup(); refreshedCleanup();
console.log("Worker status UI passed: three host states, version labels, failure detail and manual refresh.");
