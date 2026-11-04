// pnpm exec node --experimental-vm-modules scripts/test-ad-tracking.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);

const device = "11111111-1111-4111-8111-111111111111";
const session = "22222222-2222-4222-8222-222222222222";
const account = "33333333-3333-4333-8333-333333333333";
const other = "44444444-4444-4444-8444-444444444444";
const guest = "55555555-5555-4555-8555-555555555555";
const entryAt = "2026-11-04T10:00:00Z";
const silentConsole = { ...console, error() {} };

function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), clear: () => values.clear() };
}

function loader(mocks, globals = {}) {
  const context = vm.createContext({ console: silentConsole, crypto, Headers, Request, Response, Date, URL, URLSearchParams, ...globals });
  const modules = new Map();
  async function moduleFor(id) {
    if (modules.has(id)) return modules.get(id);
    const mock = mocks[id];
    let source;
    if (!mock) {
      source = await fs.readFile(id.startsWith("@/") ? `src/${id.slice(2)}.js` : id, "utf8");
      if (id === "src/app/admin/ad-tracking/page.js") {
        const { loadBindings, transform } = require("next/dist/build/swc");
        await loadBindings();
        source = (await transform(source, { filename: id, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "es6" } })).code;
      }
    }
    const mod = mock ? new vm.SyntheticModule(Object.keys(mock), function () {
      for (const [key, value] of Object.entries(mock)) this.setExport(key, value);
    }, { context }) : new vm.SourceTextModule(source, { context, identifier: id });
    modules.set(id, mod);
    return mod;
  }
  return async (id) => {
    const mod = await moduleFor(id);
    if (mod.status === "unlinked") await mod.link(moduleFor);
    if (mod.status !== "evaluated") await mod.evaluate();
    return mod.namespace;
  };
}

// Capture before auth/page effects, direct localized entries, return tabs and expiry.
const sessionStorage = storage(), localStorage = storage(), requests = [];
const window = { location: { pathname: "/ro/cadastru", search: "?src=zdg2" } };
const process = { env: { NODE_ENV: "production" } };
const loadBrowser = loader({
  "@/lib/statistics-client": { fetchWithStatisticsAuth: async (url, options) => requests.push({ url, body: JSON.parse(options.body), headers: options.headers }) },
  "@/lib/visitor-browser": { getDeviceId: () => device },
}, { window, document: { referrer: "https://www.zdg.md/" }, sessionStorage, localStorage, process });
const tracking = await loadBrowser("@/lib/tracking");
assert.equal(tracking.getActiveAdSource().source, "zdg2", "Auth can capture a direct Cadastru tag before the tracker mounts");
const capturedAt = tracking.getActiveAdSource().captured_at;
tracking.trackAdSourceEvent("signed_in", { accessToken: "verified-token" });
assert.equal(requests[0].body.source, "zdg2");
assert.equal(requests[0].body.device_id, device);
assert.equal(requests[0].headers.Authorization, "Bearer verified-token");
assert.equal(requests[0].body.metadata.accessToken, undefined);
assert.equal(tracking.getActiveAdSource().captured_at, capturedAt, "Repeat capture keeps the entry time");
window.location = { pathname: "/ro/cadastru/rezultat", search: "?lookup_id=lookup" };
assert.equal(tracking.getActiveAdSource().source, "zdg2");
sessionStorage.clear();
window.location = { pathname: "/ro/cadastru", search: "" };
assert.equal(tracking.getActiveAdSource().source, "zdg2", "A return tab reuses the remembered tag");
window.location.search = "?utm_source=reddit";
assert.equal(tracking.getActiveAdSource().source, "reddit", "An explicit new campaign replaces the tag");
for (const [path, query, expected] of [["/ru/cadastru", "?src=zdg2", "zdg2"], ["/en/cadastru", "?src=ZDG2", "zdg2"], ["/cadastru", "?src=zdg", "zdg"], ["/ro/cadastru/rezultat", "?share_slug=x&src=999", "999"], ["/ro/cadastru", "?utm_source=vtememd", "vtememd"]]) {
  window.location = { pathname: path, search: query };
  assert.equal(tracking.getActiveAdSource().source, expected);
}
window.location.search = "";
sessionStorage.clear();
localStorage.setItem("catdai-ad-source", JSON.stringify({ source: "zdg2", captured_at: "2020-01-01T00:00:00Z" }));
assert.equal(tracking.getActiveAdSource(), null, "Expired attribution is not revived");
sessionStorage.setItem("catdai-ad-source", "broken json");
window.location.search = "?src=zdg2";
assert.equal(tracking.getActiveAdSource().source, "zdg2", "A valid tag repairs malformed old storage");
const setSessionItem = sessionStorage.setItem;
sessionStorage.clear(); localStorage.clear();
sessionStorage.setItem = () => { throw new Error("Blocked session storage"); };
assert.equal(tracking.getActiveAdSource().source, "zdg2", "Persistent storage can capture when session storage is blocked");
sessionStorage.setItem = setSessionItem;
const setLocalItem = localStorage.setItem;
localStorage.setItem = () => { throw new Error("Blocked local storage"); };
window.location.search = "?src=zdg";
assert.equal(tracking.getActiveAdSource().source, "zdg", "Session storage can capture when local storage is blocked");
localStorage.setItem = setLocalItem;
process.env.NODE_ENV = "development";
const beforeDev = requests.length;
tracking.trackAdSourceEvent("page_view");
assert.equal(requests.length, beforeDev, "Development Cadastru stays excluded");
assert.equal(tracking.getActiveAdSource(), null);
process.env.NODE_ENV = "production";
window.location = { pathname: "/admin", search: "?src=zdg2" };
tracking.trackAdSourceEvent("signed_in");
assert.equal(requests.length, beforeDev, "Admin routes never send ad events");
window.location = { pathname: "/ro/cadastru", search: "?src=zdg2" };

// Tracker effects: strict-mode replay, same-path query changes, admin suppression.
let ref = { current: null };
const tracked = [];
const loadTracker = loader({
  react: { useEffect: (callback) => callback(), useRef: () => ref },
  "next/navigation": { usePathname: () => window.location.pathname, useSearchParams: () => new URLSearchParams(window.location.search) },
  "@/lib/tracking": { getDeviceId: () => device, getActiveAdSource: () => ({ source: "zdg2" }), trackAdSourceEvent: (name) => tracked.push(name) },
}, { window, document: { title: "Cadastru" }, process: { env: { NODE_ENV: "production" } } });
const { default: Tracker } = await loadTracker("src/components/AdSourceTracker.js");
Tracker(); Tracker();
assert.deepEqual(tracked, ["source_landing_visit"], "Effect replay does not duplicate the entry");
window.location.search = "?src=zdg";
Tracker();
assert.equal(tracked.length, 2, "Same-path campaign changes count a new entry");
window.location = { pathname: "/ro/cadastru/rezultat", search: "?lookup_id=x" };
Tracker();
assert.equal(tracked.at(-1), "page_view");
window.location = { pathname: "/admin", search: "?src=zdg2" };
Tracker();
assert.equal(tracked.length, 3);

// Exercise report queries with real source events and saved feature/payment fixtures.
const adEvents = [
  { id: 1, source: "zdg2", event_name: "source_landing_visit", user_id: null, device_id: device, session_id: session, path: "/ro/cadastru?src=zdg2", created_at: entryAt },
  { id: 2, source: "zdg2", event_name: "signed_in", user_id: account, device_id: device, session_id: session, created_at: "2026-11-04T10:10:00Z" },
];
const payments = [
  { id: "before", user_id: account, product_key: "credits_10", status: "paid", provider: "maib", paid_at: "2026-11-04T09:59:00Z" },
  { id: "during-anonymous-entry", user_id: account, product_key: "cadastru_lookup_single", status: "paid", provider: "maib", created_at: "2026-11-03T12:00:00Z", paid_at: "2026-11-04T10:05:00Z", amount_minor: 2000, currency_code: "MDL" },
  { id: "refunded", user_id: account, status: "refunded", provider: "maib", paid_at: "2026-11-04T10:15:00Z" },
  { id: "partial", user_id: account, product_key: "credits_10", amount_minor: 10000, currency_code: "MDL", status: "partially_refunded", provider: "paddle", paid_at: "2026-11-04T10:20:00Z" },
];
const featureRows = [
  { id: "earlier", user_id: account, visitor: { device_id: device }, created_at: "2026-11-04T09:00:00Z" },
  { id: "anonymous-search", user_id: null, visitor: { device_id: device }, created_at: "2026-11-04T10:02:00Z", search_address: "Chișinău, Example 1", result_type: "found", duplicate_of: null },
  { id: "cross-device", user_id: account, visitor: { device_id: other }, created_at: "2026-11-04T10:12:00Z", duplicate_of: null },
  { id: "other-person", user_id: other, visitor: { device_id: device }, created_at: "2026-11-04T10:13:00Z", duplicate_of: null },
  { id: "duplicate", user_id: account, visitor: { device_id: device }, created_at: "2026-11-04T10:14:00Z", duplicate_of: "anonymous-search" },
  { id: "unrelated", user_id: other, visitor: { device_id: other }, created_at: "2026-11-04T10:14:00Z", duplicate_of: null },
];
let authorized = true, failSource = null, currentAccount = account;
let accountIsGuest = false;
const inserted = [], queries = [];
const db = { auth: { admin: { listUsers: async () => ({ data: { users: [{ id: account, email: "buyer@example.test" }, { id: guest, is_anonymous: true }] } }) } },
  from(table) {
    const query = { table, filters: [] }; queries.push(query);
    const builder = {
      select() { return builder; },
      eq(column, value) { query.filters.push((row) => row[column] === value); return builder; },
      gte(column, value) { query.since = value; query.filters.push((row) => Date.parse(row[column]) >= Date.parse(value)); return builder; },
      in(column, values) { query.filters.push((row) => values.includes(row[column])); return builder; },
      is(column, value) { query.filters.push((row) => row[column] === value); return builder; },
      or(value) {
        query.or = value;
        const ids = value.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/g) || [];
        query.filters.push((row) => ids.includes(row.visitor?.device_id) || ids.includes(row.device_id) || (value.includes("user_id.in") && ids.includes(row.user_id)));
        return builder;
      },
      order(column, options = {}) { (query.orders ||= []).push([column, options.ascending !== false]); return builder; },
      insert: async (row) => { inserted.push(row); return { error: null }; },
      range(from, to) { return run(from, to + 1); },
      limit(count) { query.limit = count; return run(0, count); },
    };
    async function run(from, to) {
      let rows = table === "ad_source_events" ? adEvents : table === "reporting_payment_orders" ? payments : table === "cadastru_search_events" ? featureRows : [];
      rows = rows.filter((row) => query.filters.every((filter) => filter(row)));
      rows = [...rows].sort((a, b) => {
        for (const [column, ascending] of query.orders || []) {
          if (a[column] !== b[column]) return (a[column] > b[column] ? 1 : -1) * (ascending ? 1 : -1);
        }
        return 0;
      });
      return { data: rows.slice(from, to), error: failSource === table ? { message: "provider unavailable" } : null };
    }
    return builder;
  },
};
const loadServer = loader({
  "@/lib/supabase-admin": { supabaseAdmin: db },
  "@/lib/admin-auth": { requireAdminApiAuth: () => authorized ? null : Response.json({}, { status: 401 }) },
  "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
  "node:crypto": { default: crypto },
  "@/lib/rate-limit": { rateLimit: () => ({ check: () => ({ allowed: true }) }) },
  "@/lib/statistics-context": { getStatisticsVisitor: () => ({ device_id: device }), shouldCollectStatistics: () => true, withStatisticsContext: (handler) => handler },
  "@/lib/access-tier": { resolveAccessTier: async () => ({ user_id: currentAccount, is_guest: accountIsGuest }) },
  "@/lib/cache": { getSharedCache: async () => null, setSharedCache: async () => {} },
}, { process: { env: {} } });
const { POST } = await loadServer("src/app/api/ad-source-events/route.js");
const post = (source) => POST(new Request("https://catdai.md/api/ad-source-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, event_name: "signed_in", device_id: device, session_id: session }) }));
assert.equal((await post("zdg2")).status, 200);
assert.equal(inserted[0].user_id, account);
assert.equal(inserted[0].visitor.device_id, device);
currentAccount = guest; accountIsGuest = true;
assert.equal((await post("zdg2")).status, 200);
assert.equal(inserted[1].metadata.is_guest, true);
assert.equal((await post("unknown")).status, 400);

const report = await loadServer("@/lib/admin-ad-tracking");
const stats = await report.fetchAdSourceStats({ source: "zdg2", since: entryAt });
assert.equal(stats.uniqueSessions, 1);
assert.equal(stats.identifiedUsers, 1);
assert.equal(stats.paidOrders, 2, "Counts paid/partially refunded orders after entry, even when created before it");
assert.equal(stats.journeys[0].userId, account);
assert.equal(stats.journeys[0].purchased, true);
assert.equal(stats.journeys[0].purchases.some((order) => order.id === "during-anonymous-entry"), true, "Account attachment retains the anonymous entry time");
const activity = await report.fetchAdJourneyActivity({ source: "zdg2", sessionId: session });
assert.deepEqual(Array.from(activity, (event) => event.id).sort(), ["anonymous-search", "cross-device"], "Reuses dashboard rows after entry; excludes prior actions, unrelated/conflicting accounts and duplicate searches");
assert.equal(queries.filter((query) => query.table === "cadastru_search_events").at(-1).since, entryAt);
assert(queries.filter((query) => ["user_favorites", "shared_links"].includes(query.table)).every((query) => query.or.includes(account)));
const paymentCount = payments.length;
payments.push(...Array.from({ length: 1001 }, (_, index) => ({ id: `extra-${index}`, user_id: account, status: "paid", provider: "maib", paid_at: "2026-11-04T11:00:00Z" })));
assert.equal((await report.fetchAdSourceStats({ source: "zdg2" })).paidOrders, 1003, "Payment pagination does not silently truncate attribution at 1000 orders");
payments.length = paymentCount;

// Compile/render the expanded admin UI against a populated cohort.
const states = ["zdg2", "all", false, false, false, { ad: stats }, null, { [stats.journeys[0].key]: true }];
const loadUi = loader({
  react: { useState: (initial) => [states.length ? states.shift() : initial, () => {}], useEffect() {}, useCallback: (callback) => callback, useRef: () => ({ current: null }) },
  "react/jsx-runtime": jsxRuntime,
  "@/components/admin/AdminUserCell": { default: ({ name }) => name || "Anonymous" },
  "@/lib/admin-payments": { PAYMENT_PRODUCT_LABELS: { cadastru_lookup_single: "Cadastru lookup", credits_10: "10 uses" } },
});
const { default: AdTrackingPage } = await loadUi("src/app/admin/ad-tracking/page.js");
const markup = renderToStaticMarkup(jsxRuntime.jsx(AdTrackingPage, {}));
for (const label of ["ZDG2", "/ro/cadastru?src=zdg2", "Ad Entries", "Feature activity after ad entry", "Purchases after ad entry", "Cadastru lookup", "20,00", "MDL", "maib", "buyer@example.test"]) assert(markup.includes(label), label);

// Mixed accounts never become a single attributed buyer; guest buyers stay distinct.
adEvents.push({ ...adEvents[1], id: 3, user_id: other });
assert.equal((await report.fetchAdSourceStats({ source: "zdg2" })).journeys[0].userId, null);
adEvents.pop();
adEvents[1].user_id = guest;
payments.push({ id: "guest-order", user_id: guest, status: "paid", provider: "maib", paid_at: "2026-11-04T10:06:00Z" });
const guestStats = await report.fetchAdSourceStats({ source: "zdg2" });
assert.equal(guestStats.identifiedUsers, 0);
assert.equal(guestStats.purchasedUsers, 1);
assert.equal(guestStats.journeys[0].user.isGuest, true);
adEvents[1].user_id = account;

const { GET } = await loadServer("src/app/api/admin/ad-tracking/route.js");
const get = (params) => GET({ nextUrl: new URL(`https://catdai.md/api/admin/ad-tracking?${params}`) });
authorized = false;
const queryCount = queries.length;
assert.equal((await get(`source=zdg2&sessionId=${session}`)).status, 401);
assert.equal(queries.length, queryCount, "Admin verification precedes every activity read");
authorized = true;
assert.equal((await get("source=zdg2&deviceId=invalid")).status, 400);
assert.equal((await get("source=unknown")).status, 400);
const response = await get(`source=zdg2&sessionId=${session}`);
assert.equal(response.status, 200);
assert.equal(response.headers.get("cache-control"), "private, no-store");
failSource = "cadastru_search_events";
assert.equal((await get(`source=zdg2&sessionId=${session}`)).status, 500, "Failed activity reads never masquerade as a complete empty history");
failSource = "reporting_payment_orders";
assert.equal((await report.fetchAdSourceStats({ source: "zdg2" })).purchaseTrackingAvailable, false);
console.log("Ad tracking checks passed: direct entries, early capture, return visits, guest/registered attachment, stored feature activity, purchase timing, conflicting accounts, auth and visible failures.");
