// Isolated API/UI checks; no network or live database writes.
// pnpm exec node --experimental-vm-modules scripts/test-admin-active-users.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";

let now = Date.parse("2026-10-31T21:59:30Z");
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
let authorized = true, fail = false, calls = 0, cacheReads = 0, lastArgs;
const cache = new Map();
const sample = { activeUsers: 5, newUsers: 1, oldUsers: 2, dailyActiveUsers: [{ date: "00:00", activeUsers: 5 }] };
const context = vm.createContext({ Date: FixedDate, console: { error() {} } });
const periods = new vm.SourceTextModule(await fs.readFile("src/lib/admin-periods.js", "utf8"), { context });
await periods.link(() => { throw new Error("Unexpected period import"); });
await periods.evaluate();
const mocks = {
  "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
  "@/lib/admin-auth": { requireAdminApiAuth: () => authorized ? null : Response.json({}, { status: 401 }) },
  "@/lib/admin-periods": periods.namespace,
  "@/lib/cache": {
    getSharedCache: async (key) => { cacheReads++; return cache.has(key) ? { value: cache.get(key) } : null; },
    setSharedCache: async (key, value, ttl) => { assert.equal(ttl, 300); cache.set(key, value); },
  },
  "@/lib/supabase-admin": { supabaseAdmin: {
    rpc: async (name, args) => {
      assert.equal(name, "admin_active_users_chart");
      calls++; lastArgs = args;
      return fail ? { data: null, error: { message: "DB unavailable" } } : { data: sample, error: null };
    },
    from() { throw new Error("Chart must not download event rows"); },
    auth: { admin: { listUsers() { throw new Error("Chart must not download auth accounts"); } } },
  } },
};
const route = new vm.SourceTextModule(await fs.readFile("src/app/api/admin/active-users/route.js", "utf8"), { context });
await route.link((name) => new vm.SyntheticModule(Object.keys(mocks[name]), function () {
  for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
}, { context }));
await route.evaluate();
const get = (params = "period=day") => route.namespace.GET({ nextUrl: new URL(`https://example.com/?${params}`) });
let response = await get();
assert.equal(response.headers.get("cache-control"), "private, no-store");
assert.equal((await response.json()).activeUsers, 5);
assert.equal(lastArgs.p_since, "2026-10-30T22:00:00.000Z");
assert.equal(lastArgs.p_hourly, true);
await get(); assert.equal(calls, 1, "Revisiting a timeframe uses its shared cached aggregate");
authorized = false;
const readsBefore = cacheReads;
assert.equal((await get()).status, 401);
assert.equal(cacheReads, readsBefore, "Authentication precedes cache reads");
authorized = true;
await get("period=day&fresh=1"); assert.equal(calls, 2);
await get(); assert.equal(calls, 2, "Refresh replaces the cached report");
await get("period=previous_month");
assert.equal(lastArgs.p_until, "2026-09-30T21:00:00.000Z");
now += 60000;
await get("period=previous_month");
assert.equal(lastArgs.p_until, "2026-10-31T22:00:00.000Z", "Cache rolls over across the local month boundary");
await get("period=week"); const weekCalls = calls;
now += 1000;
await get("period=week"); assert.equal(calls, weekCalls, "Rolling cutoffs do not defeat caching");
fail = true;
assert.equal((await get("period=all")).status, 503);
fail = false;
assert.equal((await get("period=all")).status, 200, "Failures are not cached");
console.log("Active-user API passed: aggregate-only request, authentication, caching, refresh, calendar rollover and failures.");

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require("next/dist/build/swc");
await loadBindings();
const slots = [], requests = [];
let cursor = 0, effect, cleanup, previousDeps;
const jsx = (type, props) => ({ type, props });
const uiContext = vm.createContext({ Date: FixedDate, URLSearchParams, AbortController,
  fetch: (url, options) => new Promise((resolve) => requests.push({ url, options, resolve })),
});
const uiMocks = {
  react: {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useEffect(callback, deps) {
      if (!previousDeps || deps.some((value, i) => value !== previousDeps[i])) {
        previousDeps = deps; effect = callback;
      }
    },
  },
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "@/components/ActiveUsersChart": { default: "Chart" },
  "@/lib/admin-periods": periods.namespace,
};
const { code } = await transform(await fs.readFile("src/components/admin/AdminActiveUsersChart.js", "utf8"), {
  filename: "AdminActiveUsersChart.js",
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "es6" },
});
const ui = new vm.SourceTextModule(code, { context: uiContext });
await ui.link((name) => new vm.SyntheticModule(Object.keys(uiMocks[name]), function () {
  for (const [key, value] of Object.entries(uiMocks[name])) this.setExport(key, value);
}, { context: uiContext }));
await ui.evaluate();
const render = (initialPeriod = "day") => {
  cursor = 0;
  const tree = ui.namespace.default({ initialPeriod });
  if (effect) { cleanup?.(); cleanup = effect(); effect = null; }
  return tree.props;
};
const settle = () => new Promise(setImmediate);
let props = render();
assert.equal(props.loading, true);
assert.equal(requests[0].url, "/api/admin/active-users?period=day");
requests[0].resolve(Response.json({ ...sample, period: "day" })); await settle();
props = render(); assert.equal(props.totalActive, 5);
props.onPeriodChange("week"); props = render();
assert.equal(props.period, "week"); assert.equal(props.loading, true);
assert.equal(props.data.length, 1, "Previous chart points remain visible while an uncached period loads");
assert.equal(props.type, "hourly", "Retained points keep their original resolution");
assert.equal(props.periodLabel, "1 day", "Retained points keep their original timeframe label");
assert.equal(requests[1].url, "/api/admin/active-users?period=week");
// Returning to a loaded period is synchronous and makes no request.
props.onPeriodChange("day"); props = render();
assert.equal(props.loading, false);
assert.equal(props.totalActive, 5);
assert.equal(requests.length, 2, "A loaded timeframe is reused without fetching again");
assert.equal(requests[1].options.signal.aborted, true, "Superseded timeframe requests are cancelled");
props.onPeriodChange("month"); props = render();
assert.equal(props.loading, true);
assert.equal(props.totalActive, 5, "The metric cards remain populated while switching periods");
requests[1].resolve(Response.json({ ...sample, period: "week", activeUsers: 99 }));
requests[2].resolve(Response.json({ ...sample, period: "month", activeUsers: 7 })); await settle();
props = render("all");
assert.equal(props.totalActive, 7, "Old responses cannot replace the selected timeframe");
assert.equal(props.period, "month", "Dashboard period changes do not reload or reset the open chart");
props.onPeriodChange("day"); props = render();
assert.equal(props.loading, false); assert.equal(props.totalActive, 5);
props.onPeriodChange("month"); props = render();
assert.equal(props.loading, false); assert.equal(props.totalActive, 7);
assert.equal(requests.length, 3, "Repeated toggles reuse both cached periods");
props.onRefresh(); props = render();
assert.equal(props.totalActive, 7, "Refresh retains the displayed chart");
assert.equal(requests[3].url, "/api/admin/active-users?period=month&fresh=1");
requests[3].resolve(Response.json({}, { status: 503 })); await settle();
props = render(); assert(props.error); assert.equal(props.loading, false);
assert.equal(props.totalActive, 7, "A failed refresh preserves the last successful chart");
props.onRefresh(); render();
assert.equal(requests[4].url, "/api/admin/active-users?period=month&fresh=1");
requests[4].resolve(Response.json({ ...sample, period: "month", activeUsers: 8 })); await settle();
props = render();
props.onPeriodChange("day"); props = render();
props.onPeriodChange("month"); props = render();
assert.equal(props.totalActive, 8, "Refresh replaces the locally cached report");
assert.equal(requests.length, 5);
now += 5 * 60 * 1000 + 1;
props.onPeriodChange("day"); props = render();
assert.equal(props.loading, true);
assert.equal(requests[5].url, "/api/admin/active-users?period=day", "Expired cache entries are fetched again");
assert.equal(props.totalActive, 8, "Expired data refreshes without clearing the current chart");
requests[5].resolve(Response.json({ ...sample, period: "day" })); await settle();
props = render();
props.onPeriodChange("month"); render();
requests[6].resolve(Response.json({ ...sample, period: "month", updatedAt: new FixedDate().toISOString() })); await settle();
props = render();
// Cross midnight before the five-minute TTL expires.
now = Date.parse("2026-11-01T21:59:30Z");
props.onRefresh(); render();
requests[7].resolve(Response.json({ ...sample, period: "month", updatedAt: new FixedDate().toISOString() })); await settle();
props = render();
props.onPeriodChange("day"); render();
requests[8].resolve(Response.json({ ...sample, period: "day" })); await settle();
props = render();
now += 60_000;
props.onPeriodChange("month"); render();
assert.equal(requests[9].url, "/api/admin/active-users?period=month", "Local cache resets across Chișinău midnight");
cleanup(); assert.equal(requests[9].options.signal.aborted, true, "Closing the chart cancels its request");
assert(requests.every(({ url }) => !url.startsWith("/api/admin/stats")), "Chart changes never fetch the dashboard");
console.log("Active-user chart UI passed: retained charts/labels, instant cached periods, expiry, rollover, refresh, cancellation and retry.");

// Render the actual chart so its loading/error paths cannot remove the plot or metrics.
const chartSource = await transform(await fs.readFile("src/components/ActiveUsersChart.js", "utf8"), {
  filename: "ActiveUsersChart.js",
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "es6" },
});
const chartModule = new vm.SourceTextModule(chartSource.code, { context: uiContext });
const chartMocks = {
  react: { useMemo: (fn) => fn(), useState: () => [null, () => {}] },
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
};
await chartModule.link((name) => new vm.SyntheticModule(Object.keys(chartMocks[name]), function () {
  for (const [key, value] of Object.entries(chartMocks[name])) this.setExport(key, value);
}, { context: uiContext }));
await chartModule.evaluate();
const nodes = (node) => !node || typeof node !== "object" ? [] : Array.isArray(node)
  ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const textOf = (node) => node == null || typeof node === "boolean" ? "" : Array.isArray(node) ? node.map(textOf).join(" ")
  : typeof node === "object" ? textOf(node.props?.children) : String(node);
for (const state of [{}, { loading: true }, { error: "Failed" }]) {
  const tree = chartModule.namespace.default({ data: sample.dailyActiveUsers, totalActive: 5, ...state });
  assert.equal(nodes(tree).filter((node) => node.type === "svg").length, 1, "Plot remains mounted during loading/errors");
  assert(textOf(tree).includes("Period Total"), "Metric cards remain mounted during loading/errors");
  assert(nodes(tree).some((node) => node.type === "path"), "Existing plot lines remain visible during loading/errors");
  assert(!textOf(tree).includes("Loading activity chart"), "Loading text never replaces a populated chart");
}
const initial = chartModule.namespace.default({ loading: true });
assert(nodes(initial).some((node) => node.type === "svg"), "Even initial load reserves the plot dimensions");
assert(textOf(initial).includes("Period Total"), "Initial load reserves the metric card dimensions");
console.log("Chart layout passed: metrics and SVG remain mounted through initial loading, timeframe changes, refresh and errors.");
