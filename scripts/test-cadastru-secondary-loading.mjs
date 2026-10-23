// Isolated client scheduling/card checks; no servers, network, or database writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-secondary-loading.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import * as validation from "../src/lib/validation.js";
import { createRequire } from "node:module";

const lookupContext = vm.createContext({ crypto, URL, get window() { return globalThis.window; } });
const lookupModule = new vm.SourceTextModule(await fs.readFile("src/lib/cadastru-lookup-tracking.js", "utf8"), { context: lookupContext });
await lookupModule.link(() => new vm.SyntheticModule(["getDeviceId"], function () {
  this.setExport("getDeviceId", () => null);
}, { context: lookupContext }));
await lookupModule.evaluate();
const { ensureCadastruLookupId } = lookupModule.namespace;

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require("next/dist/build/swc");
await loadBindings();
const noop = () => null;
const jsx = (type, props) => ({ type, props });
const ro = JSON.parse(await fs.readFile("src/locales/ro.json", "utf8"));
const ru = JSON.parse(await fs.readFile("src/locales/ru.json", "utf8"));
let lang = "ro";
const t = (key, params = {}) => Object.entries(params).reduce((text, [name, value]) =>
  text.replaceAll(`{${name}}`, String(value)), (lang === "ru" ? ru : ro)[key] || key);
const translation = { useTranslation: () => ({ lang, t }) };

async function loadJsx(file, mocks, globals = {}) {
  const source = await fs.readFile(file, "utf8");
  const { code } = await transform(source, {
    filename: file,
    jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
    module: { type: "es6" },
  });
  const context = vm.createContext({ console, crypto, URL, URLSearchParams, AbortController,
    setTimeout: () => 1, clearTimeout: noop, navigator: { userAgent: "" }, ...globals });
  const jsxModule = new vm.SourceTextModule(code, { context });
  await jsxModule.link((name) => {
    const exports = mocks[name] || (name === "@/lib/visitor-browser" ? { getDeviceId: () => null } : null) || (name === "@/components/CadastruFreshnessNote" ? { default: freshnessNote.default } : null) || (name.startsWith("@/components/") ? { default: noop } : null);
    assert(exports, `Unexpected import: ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await jsxModule.evaluate();
  return jsxModule.namespace;
}

const freshnessNote = await loadJsx("src/components/CadastruFreshnessNote.js", {
  "@/context/LanguageContext": translation,
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
});

const slots = [];
let cursor = 0;
let effects = [];
const frames = new Map();
let nextFrame = 0;
const requests = new Map();
const trackedOpens = [];
const useState = (initial) => {
  const index = cursor++;
  if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
  return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
};
const useEffect = (effect, deps) => {
  const index = cursor++;
  const previous = slots[index];
  if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
  previous?.cleanup?.();
  slots[index] = { deps };
  effects.push(() => { slots[index].cleanup = effect(); });
};
const number = "0100106.131.01.097";
let searchParams = new URLSearchParams({ cadastral_number: number });
let addressRequest = null;
let authSession = null;
const router = { push: noop, replace: (url) => {
  searchParams = new URLSearchParams(url.split("?")[1]);
} };
const page = await loadJsx("src/app/cadastru/rezultat/page.js", {
  "./loading": { default: noop },
  "@/lib/cadastru-lookup-tracking": { ...lookupModule.namespace },
  "@/lib/cadastru-share-tracking": { recordCadastruShareOpen: (slug) => trackedOpens.push(slug) },
  react: { Suspense: noop, useState, useRef: (value) => useState(() => ({ current: value }))[0], useEffect },
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
  "next/navigation": { useRouter: () => router, useSearchParams: () => searchParams },
  "@/context/LanguageContext": translation,
  "@/context/AuthContext": { useAuth: () => ({ isAuthenticated: Boolean(authSession), loading: false, session: authSession, clearAuthError: noop }) },
  "@/lib/validation": { ...validation, matchCity: () => null },
  "@/lib/cadastru-supported-cities": { CADASTRU_SUPPORTED_CITIES: ["Chișinău", "Durlești"] },
  "@/lib/cadastru-favorites": { getCadastruFavoritePath: () => null, getSavedCadastruAddress: () => null },
  "@/lib/cadastru-valuation-handoff": { resolveValuationDistrict: () => null,
    buildFullAccessAddressResultParams: (data, { skipCache }) => new URLSearchParams({ source: "address", cadastral_number: data.cadastral_number,
      ...(skipCache ? { skipcache: "true" } : {}) }) },
  "@/lib/cadastru-municipal-reports": { municipalReportsAvailableForCadastru: (data) => data?.form_fields?.city === "Chișinău" || data?.request_address?.startsWith("Chișinău,"), validMunicipalReportsResult: (data) => data?.summary?.total >= 0 },
}, {
  window: {}, localStorage: { removeItem: noop },
  sessionStorage: { getItem: (key) => key.includes("lookup-request") && addressRequest ? JSON.stringify(addressRequest) : null },
  requestAnimationFrame: (callback) => { const id = ++nextFrame; frames.set(id, callback); return id; },
  cancelAnimationFrame: (id) => frames.delete(id),
  fetch: (url, options) => {
    assert(!requests.has(url), `Duplicate request: ${url}`);
    return new Promise((resolve, reject) => requests.set(url, { resolve, reject, options }));
  },
});
function render() {
  cursor = 0;
  effects = [];
  const tree = page.default().props.children.type();
  effects.forEach((effect) => effect());
  return tree;
}
function paint() {
  const queued = [...frames.values()];
  frames.clear();
  queued.forEach((callback) => callback());
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
render();
assert.equal(requests.size, 1, "only the main request starts before a result exists");
requests.get("/api/cadastral").resolve({ ok: true, json: async () => ({ cadastral_number: number, form_fields: { city: "Chișinău" }, nearby: { categories: { schools: { places: [] } } } }) });
await flush();
render();
assert.equal(requests.size, 1, "secondary requests wait for the main card to paint");
paint();
paint();
for (const endpoint of ["nearby", "public-transport", "municipal-reports"]) {
  const request = requests.get(`/api/cadastru/${endpoint}`);
  assert(request, `${endpoint} starts without waiting for other secondary responses`);
  assert.equal(JSON.parse(request.options.body).cadastral_number, number);
  assert.equal(JSON.parse(request.options.body).lookup_id, JSON.parse(requests.get("/api/cadastral").options.body).lookup_id,
    "all secondary calls share the primary search ID");
  assert.equal(JSON.parse(request.options.body).lookup_query, number);
}
requests.get("/api/cadastru/municipal-reports").resolve({ ok: true,
  json: async () => ({ municipal_reports: { summary: { total: 4 } } }) });
await flush();
assert(slots.some((slot) => slot?.data?.summary?.total === 4 && !slot.loading),
  "municipal reports are shown while nearby and transport remain pending");
render();
paint();
paint();
assert.equal(requests.size, 4, "rerendering does not repeat completed or pending lookups");
const mainSlot = slots.findIndex((slot) => slot?.data?.cadastral_number === number);
slots[mainSlot] = { ...slots[mainSlot], data: { cadastral_number: number, form_fields: { city: "Orhei" } } };
requests.delete("/api/cadastru/municipal-reports");
const outsideTree = render();
paint();
paint();
assert(!requests.has("/api/cadastru/municipal-reports"), "other regions do not request municipal reports");
const containsReportsCard = (node) => Array.isArray(node) ? node.some(containsReportsCard)
  : Boolean(node && typeof node === "object" && ((node.props && "reports" in node.props) || containsReportsCard(node.props?.children)));
assert(!containsReportsCard(outsideTree), "other regions hide the entire municipal card");
for (const slot of slots) slot?.cleanup?.();
console.log("Secondary loading passed: main result first, three concurrent requests, independent completion and no duplicate rerender calls.");

const helperSource = await fs.readFile("src/lib/cadastru-municipal-reports.js", "utf8");
const helper = new vm.SourceTextModule(helperSource, { context: vm.createContext({ URL }) });
await helper.link((name) => new vm.SyntheticModule([name.includes("supported-cities") ? "resolveCadastruSupportedCity" : "publicTransportInputFromCadastru"], function () {
  this.setExport(name.includes("supported-cities") ? "resolveCadastruSupportedCity" : "publicTransportInputFromCadastru", () => null);
}, { context: helper.context }));
await helper.evaluate();
let descriptionExpanded = false;
let activeReportGroup = "at_address";
const visibleGroupCounts = {};
const card = await loadJsx("src/components/CadastruMunicipalReportsCard.js", {
  react: { useState: (initial) => {
    if (typeof initial === "number") {
      const key = activeReportGroup;
      visibleGroupCounts[key] ??= initial;
      return [visibleGroupCounts[key], (next) => {
        visibleGroupCounts[key] = typeof next === "function" ? next(visibleGroupCounts[key]) : next;
      }];
    }
    return [descriptionExpanded, (next) => {
      descriptionExpanded = typeof next === "function" ? next(descriptionExpanded) : next;
    }];
  } },
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
  "@/context/LanguageContext": translation,
  "@/lib/cadastru-municipal-reports": {
    municipalReportDate: helper.namespace.municipalReportDate,
    municipalSourceUrl: helper.namespace.municipalSourceUrl,
  },
});
function renderComponent(node) {
  const previousGroup = activeReportGroup;
  if (node.props?.group) activeReportGroup = node.props.nearby ? "nearby" : "at_address";
  try {
    return node.type(node.props);
  } finally {
    activeReportGroup = previousGroup;
  }
}
function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (typeof node !== "object") return String(node);
  if (typeof node.type === "function") return textOf(renderComponent(node));
  return textOf(node.props?.children);
}
function findNode(node, predicate) {
  if (Array.isArray(node)) return node.map((child) => findNode(child, predicate)).find(Boolean) || null;
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  if (typeof node.type === "function") return findNode(renderComponent(node), predicate);
  return findNode(node.props?.children, predicate);
}
const report = { id: "public", title: "Locuințe", category: { ro: "Locuințe", ru: "Жильё" },
  status: "INTHEWORK", reported_at: "2026-09-18T23:35:39", address: "bd. Decebal, 63", distance_m: 7,
  is_public: true, description: "Original description", photo_count: 2, source_url: "https://eu.chisinau.md/raport/public" };
const data = { address_match_available: true, search_radius_m: 300, period: { years: 2 },
  summary: { at_address: 1, nearby: 1, solved: 1, total: 2 },
  at_address: { count: 1, reports: [report] }, nearby: { count: 1, reports: [{ ...report, id: "nearby", status: "SOLVED" }] },
  cache: { fetched_at: "2026-10-10T15:53:29.376Z", stale: true }, incomplete: true };
const reportNode = findNode(card.default({ reports: data }), (node) => node.props?.report?.id === "public");
let reportTree = reportNode.type(reportNode.props);
let descriptionButton = findNode(reportTree, (node) => node.type === "button");
assert.equal(descriptionButton.props["aria-expanded"], false);
assert.equal(textOf(descriptionButton), ro["cadastru.reportsReadMore"]);
assert(findNode(reportTree, (node) => node.type === "p" && node.props?.children === report.description)
  .props.className.includes("truncate"), "descriptions start as one line");
descriptionButton.props.onClick();
reportTree = reportNode.type(reportNode.props);
descriptionButton = findNode(reportTree, (node) => node.type === "button");
assert.equal(descriptionButton.props["aria-expanded"], true);
assert.equal(textOf(descriptionButton), ro["cadastru.reportsReadLess"]);
assert(textOf(reportTree).includes(report.description), "read more keeps the full description on this page");
descriptionButton.props.onClick();
assert.equal(descriptionExpanded, false, "read less collapses the description again");
let text = textOf(card.default({ reports: data }));
for (const phrase of [ro["cadastru.reportsTitle"], ro["cadastru.reportsSubtitle"], "18.09.2026", "În lucru",
  "Soluționată", "2 fotografii", "Original description", ro["cadastru.reportsStale"], ro["cadastru.reportsIncomplete"]]) {
  assert(text.includes(phrase), `Missing card text: ${phrase}`);
}
lang = "ru";
text = textOf(card.default({ reports: data }));
assert(text.includes("Жильё") && text.includes("В работе"), "Russian category and status are localized");
lang = "ro";
const hidden = { ...data, at_address: { count: 1, reports: [{ ...report, is_public: false }] }, nearby: { count: 0, reports: [] } };
text = textOf(card.default({ reports: hidden }));
assert(!text.includes("Original description") && !text.includes("2 fotografii"), "private details/photos stay hidden");
assert(text.includes(ro["cadastru.reportsPrivate"]));
const coordinates = { ...data, address_match_available: false, summary: { ...data.summary, at_address: null } };
text = textOf(card.default({ reports: coordinates }));
assert(text.includes("—") && text.includes(ro["cadastru.reportsAddressUnknown"]));
assert(!text.includes(ro["cadastru.reportsAtAddress"]), "coordinate-only data cannot claim exact-address matches");
text = textOf(card.default({ reports: { ...data, summary: { at_address: 0, nearby: 0, solved: 0, total: 0 } } }));
assert(text.includes(ro["cadastru.reportsEmpty"]));
assert(textOf(card.default({ unavailable: true })).includes(ro["cadastru.reportsUnavailable"]));
assert(textOf(card.default({ loading: true })).includes(ro["cadastru.reportsLoading"]));

const manyReports = {
  ...data,
  at_address: { count: 10, reports: Array.from({ length: 10 }, (_, i) => ({ ...report, id: `address-${i}` })) },
  nearby: { count: 71, has_more: true, reports: Array.from({ length: 10 }, (_, i) => ({ ...report, id: `nearby-${i}` })) },
};
const groupNodes = card.default({ reports: manyReports });
const addressGroup = findNode(groupNodes, (node) => node.props?.group && !node.props.nearby);
const nearbyGroup = findNode(groupNodes, (node) => node.props?.group && node.props.nearby);
function reportIds(node) {
  if (Array.isArray(node)) return node.flatMap(reportIds);
  if (!node || typeof node !== "object") return [];
  if (node.props?.report) return [node.props.report.id];
  return reportIds(node.props?.children);
}
function loadMoreButton(tree) {
  return findNode(tree, (node) => node.type === "button" && textOf(node) === ro["cadastru.reportsLoadMore"]);
}
assert.equal(reportIds(renderComponent(addressGroup)).length, 3);
assert.equal(reportIds(renderComponent(nearbyGroup)).length, 3);
for (const expected of [6, 9, 10]) {
  loadMoreButton(renderComponent(addressGroup)).props.onClick();
  assert.equal(reportIds(renderComponent(addressGroup)).length, expected);
  assert.equal(reportIds(renderComponent(nearbyGroup)).length, 3, "loading address reports does not change nearby reports");
}
assert.equal(loadMoreButton(renderComponent(addressGroup)), null, "load more disappears when all returned reports are visible");
assert(textOf(renderComponent(addressGroup)).includes("10 din 10"));
for (const expected of [6, 9, 10]) {
  loadMoreButton(renderComponent(nearbyGroup)).props.onClick();
  assert.equal(reportIds(renderComponent(nearbyGroup)).length, expected);
}
assert.equal(loadMoreButton(renderComponent(nearbyGroup)), null, "the card cannot load beyond the worker's returned reports");
assert(textOf(renderComponent(nearbyGroup)).includes("10 din 71"));
assert(textOf(renderComponent(nearbyGroup)).includes(ro["cadastru.reportsMoreAtSource"]));
console.log("Municipal card passed: independent per-group load more and exhaustion, inline description expansion/collapse, RO/RU copy, privacy and data states.");

const transportCard = await loadJsx("src/components/CadastruPublicTransportCard.js", {
  "next/image": { default: noop },
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
  "@/context/LanguageContext": translation,
});
for (const locale of ["ro", "ru"]) {
  lang = locale;
  const transport = { scope: "nearby", route_groups: [{ mode: "bus", routes: [{ ref: "19" }] }], cache: { stale: true } };
  assert(textOf(transportCard.default({ transport })).includes(t("cadastru.savedDataStale")), "stored fallback is labeled in both locales");
  assert(!textOf(transportCard.default({ transport: { ...transport, cache: { stale: false } } })).includes(t("cadastru.savedDataStale")), "fresh data has no stale warning");
}
console.log("Transport card passed: stale fallback notice in RO/RU, without warnings on fresh responses.");

const nearbyCard = await loadJsx("src/components/CadastruNearbyCard.js", {
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
  "@/context/LanguageContext": translation,
});
for (const locale of ["ro", "ru"]) {
  lang = locale;
  const nearby = { categories: {}, cache: { stale: true } };
  assert(textOf(nearbyCard.default({ nearby })).includes(t("cadastru.savedDataStale")));
  assert(!textOf(nearbyCard.default({ nearby: { ...nearby, cache: { stale: false } } })).includes(t("cadastru.savedDataStale")));
  const fallback = nearbyCard.default({ nearby: { ...nearby, source: "geoapify",
    attribution: "Powered by Geoapify | © OpenStreetMap contributors" } });
  const credit = findNode(fallback, (node) => node.type === "a" && node.props.href === "https://www.geoapify.com/");
  assert(credit && !/nofollow/.test(credit.props.rel), "Geoapify fallback has a follow-link in both locales");
  assert(findNode(fallback, (node) => node.type === "a" && node.props.href === "https://www.openstreetmap.org/copyright"));
  assert(!findNode(nearbyCard.default({ nearby }), (node) => node.type === "a" && node.props.href === "https://www.geoapify.com/"),
    "OSM-only snapshots keep their existing attribution");
}
console.log("Nearby card passed: stale fallback notices in RO/RU, and embedded legacy data does not bypass the shared request.");

for (const locale of ["ro", "ru"]) {
  lang = locale;
  for (const scenario of [
    { source: "address", status: 503, error: "service_unavailable", continues: true },
    { source: "address", status: 504, error: "timeout", continues: true },
    { source: "address", status: 408, error: "timeout", continues: true },
    { source: "address", networkFailure: true, continues: true },
    { source: "address", status: 404, error: "not_found", continues: false },
    { source: "address", status: 400, error: "invalid_address_fields", continues: false },
    { source: "address", status: 401, error: "unauthorized", continues: false },
    { source: "address", status: 429, error: "too_many_requests", continues: false },
    { source: "number", status: 503, error: "service_unavailable", continues: false },
    { source: "number", status: 504, error: "timeout", continues: false },
    { source: "address", status: 503, error: "service_unavailable", city: "Orhei", continues: true },
    { source: "address", status: 503, error: "service_unavailable", followup: true, continues: true },
  ]) {
    for (const slot of slots) slot?.cleanup?.();
    slots.length = 0;
    requests.clear();
    frames.clear();
    addressRequest = { city: scenario.city || "Chișinău", road_type: "strada", street: "Decebal", house_number: "63", apartment_number: "1" };
    searchParams = new URLSearchParams({ source: scenario.source,
      ...(scenario.source === "number" || scenario.followup ? { cadastral_number: number } : { lookup: "1" }) });
    render();
    const main = requests.get(scenario.source === "number" || scenario.followup ? "/api/cadastral" : "/api/cadastru/address");
    assert(main);
    if (scenario.networkFailure) main.reject(new TypeError("Failed to fetch"));
    else main.resolve({ ok: false, status: scenario.status, json: async () => ({ error: scenario.error }) });
    await flush();
    const tree = render();
    const notice = findNode(tree, (node) => node.type === "p" && node.props.children === t("cadastru.otherDataAvailable"));
    assert.equal(Boolean(notice), scenario.continues, JSON.stringify(scenario));
    if (scenario.continues) assert(findNode(tree, (node) => node.type === "p" && node.props.children === t("cadastru.retrying")), "controlled retry is visible while secondary data loads");
    paint();
    paint();
    assert.equal(requests.has("/api/cadastru/nearby"), scenario.continues);
    assert.equal(requests.has("/api/cadastru/public-transport"), scenario.continues);
    assert.equal(requests.has("/api/cadastru/municipal-reports"), scenario.continues && !scenario.city);
    if (scenario.continues) {
      const nearby = requests.get("/api/cadastru/nearby");
      assert.equal(JSON.parse(nearby.options.body).address, `${addressRequest.city}, strada Decebal 63`);
      assert.equal(JSON.parse(nearby.options.body).lookup_id, JSON.parse(main.options.body).lookup_id,
        "outage and network-error continuations keep the original search ID");
      nearby.resolve({ ok: true, json: async () => ({ nearby: { categories: {}, location: { latitude: 47.02, longitude: 28.83 } } }) });
      await flush();
      const updated = render();
      assert(findNode(updated, (node) => node.type === "iframe" && node.props.src.includes("47.02")), "available nearby coordinates restore the map");
      assert(findNode(updated, (node) => node.props?.nearby?.location?.latitude === 47.02), "nearby displays while transport is still pending");
      assert(findNode(updated, (node) => "transport" in (node.props || {}) && node.props.loading), "transport remains independently loading");
    }
  }
}
for (const slot of slots) slot?.cleanup?.();
console.log("Outage continuation passed: RO/RU notice and preserved errors, concurrent address cards and map, timeout/network failures, number searches and validation/auth/rate-limit exclusions.");

for (const locale of ["ro", "ru"]) {
  lang = locale;
  for (const outcome of ["success", "unavailable", "network", "unauthorized", "auth-change"]) {
    for (const slot of slots) slot?.cleanup?.();
    slots.length = 0;
    requests.clear();
    frames.clear();
    authSession = { access_token: "signed-in" };
    addressRequest = { city: "Chișinău", road_type: "bulevard", street: "Dacia", house_number: "15", apartment_number: "9" };
    searchParams = new URLSearchParams({ source: "address", lookup: "1", skipcache: "true" });
    render();
    const addressLookup = requests.get("/api/cadastru/address");
    const addressTracking = JSON.parse(addressLookup.options.body);
    const addressData = { cadastral_number: number, request_address: "Chișinău, bulevard Dacia 15 ap 9",
      matched_address: "bd. Dacia 15, ap. 9", form_fields: { city: "Chișinău" }, apartment: { area_m2: 52 } };
    addressLookup.resolve({ ok: true, json: async () => addressData });
    await flush();
    const firstResult = render();
    assert(findNode(firstResult, (node) => node.props?.cadastral === addressData),
      "the address result replaces the loading screen while number details are still pending");
    const numberLookup = requests.get("/api/cadastral");
    assert(numberLookup, "address results still request number details");
    assert.equal(JSON.parse(numberLookup.options.body).lookup_id, addressTracking.lookup_id);
    assert.equal(JSON.parse(numberLookup.options.body).skip_cache, true);
    assert(findNode(render(), (node) => node.props?.cadastral === addressData),
      "the follow-up request does not reset the card to the loading screen");
    assert.equal(requests.size, 2, "secondary requests wait for the result to paint");
    paint();
    paint();
    for (const endpoint of ["nearby", "public-transport", "municipal-reports"]) {
      const body = JSON.parse(requests.get(`/api/cadastru/${endpoint}`).options.body);
      assert.equal(body.lookup_id, addressTracking.lookup_id);
      assert(body.lookup_query.includes("ap. 9"));
    }
    const transportRequest = requests.get("/api/cadastru/public-transport");
    if (outcome === "auth-change") {
      authSession = null;
      requests.delete("/api/cadastral");
      render();
      assert(!findNode(render(), (node) => node.props?.cadastral === addressData),
        "changing auth does not reuse the previous viewer's full address result");
      // Finish both requests before clearing this scenario's isolated state.
      const masked = { cadastral_number: number, locked_sections: { cadastru_details: true } };
      numberLookup.resolve({ ok: true, json: async () => addressData });
      requests.get("/api/cadastral").resolve({ ok: true, json: async () => masked });
      await flush();
      assert(findNode(render(), (node) => node.props?.cadastral === masked));
      continue;
    }
    if (outcome === "network") numberLookup.reject(new TypeError("Failed to fetch"));
    else numberLookup.resolve({ ok: outcome === "success", status: outcome === "unauthorized" ? 401 : 503,
      json: async () => outcome === "success"
        ? { cadastral_number: number, form_fields: { city: "Chișinău" }, apartment: { area_m2: 54 } }
        : { error: outcome === "unauthorized" ? "unauthorized" : "service_unavailable" } });
    await flush();
    const updated = render();
    if (outcome === "unauthorized") {
      assert(!findNode(updated, (node) => node.props?.cadastral), "unauthorized detail responses clear the full card");
      continue;
    }
    const card = findNode(updated, (node) => node.props?.cadastral);
    assert(card, "a failed detail request retains the successful address result");
    assert.equal(card.props.cadastral.apartment.area_m2, outcome === "success" ? 54 : 52);
    paint();
    paint();
    assert.equal(requests.size, 5, "detail completion does not restart secondary requests");
    const transportData = { route_groups: [] };
    transportRequest.resolve({ ok: true, json: async () => ({ public_transport: transportData }) });
    await flush();
    assert(findNode(render(), (node) => node.props?.transport === transportData),
      "secondary responses started from the address result still complete after number details");
  }
}
for (const slot of slots) slot?.cleanup?.();
console.log("Address handoff passed: RO/RU immediate card, background details and concurrent cards, stable lookup grouping, skip-cache, retained results on failure and auth isolation.");

// Compact parcel URLs use the same dotted identity for all result-page requests.
for (const locale of ["ro", "ru"]) {
  lang = locale;
  for (const slot of slots) slot?.cleanup?.();
  slots.length = 0;
  requests.clear();
  frames.clear();
  addressRequest = null;
  authSession = null;
  searchParams = new URLSearchParams({ cadastral_number: "1014203418" });
  render();
  const main = requests.get("/api/cadastral");
  assert(main, `${locale}: compact land input passes client validation`);
  assert.equal(JSON.parse(main.options.body).cadastral_number, "1014203.418");
  main.resolve({ ok: true, json: async () => ({ cadastral_number: "1014203.418",
    lands: [{ cadastral_number: "1014203.418", address: "Chișinău, str Test 1" }],
    form_fields: { city: "Chișinău" } }) });
  await flush();
  render();
  paint();
  paint();
  for (const endpoint of ["nearby", "public-transport", "municipal-reports"]) {
    const secondary = requests.get(`/api/cadastru/${endpoint}`);
    assert(secondary, `${locale}: ${endpoint} starts for the compact parcel result`);
    assert.equal(JSON.parse(secondary.options.body).cadastral_number, "1014203.418");
  }
}
for (const slot of slots) slot?.cleanup?.();
console.log("Compact land input passed: RO/RU result-page validation and canonical main/secondary requests.");

// Shared reports load a public saved result, ignoring ordinary query criteria.
for (const locale of ["ro", "ru"]) {
  lang = locale;
  for (const slot of slots) slot?.cleanup?.();
  slots.length = 0;
  requests.clear();
  frames.clear();
  addressRequest = null;
  authSession = null;
  const slug = "a".repeat(48);
  trackedOpens.length = 0;
  searchParams = new URLSearchParams({ share_slug: slug, cadastral_number: "1014203418",
    source: "address", city: "Orhei", street: "Injected", house_number: "999", skipcache: "true" });
  render();
  assert.equal(requests.size, 1);
  assert(requests.has(`/api/cadastru/share/${slug}`));
  assert.equal(trackedOpens.length, 0, "Loading requests do not count as opened reports");
  const snapshot = { cadastral_number: number, apartment: { area_m2: 52 },
    form_fields: { city: "Chișinău" }, map_location: { latitude: 47.02, longitude: 28.83 } };
  requests.get(`/api/cadastru/share/${slug}`).resolve({ ok: true, json: async () => ({ cadastral: snapshot }) });
  await flush();
  const tree = render();
  assert.deepEqual(trackedOpens, [slug], "Only a loaded shared report records an open");
  const sharedCard = findNode(tree, (node) => node.props?.cadastral === snapshot);
  assert(sharedCard, "anonymous viewers see the saved full report");
  assert(findNode(sharedCard.props.children, (node) => node.type === "iframe"), "public reports retain their map");
  paint();
  paint();
  for (const endpoint of ["nearby", "public-transport", "municipal-reports"]) {
    const request = requests.get(`/api/cadastru/${endpoint}`);
    assert(request);
    const body = JSON.parse(request.options.body);
    assert.equal(body.cadastral_number, number, "secondary cards use the shared report, ignoring edited query numbers");
    assert(!body.skip_cache);
  }
  assert(!requests.has("/api/cadastral"), "shared reports do not perform a credit-gated main lookup");
  assert(!requests.has("/api/cadastru/address"));
}
for (const slot of slots) slot?.cleanup?.();
console.log("Shared report viewer passed: anonymous RO/RU report, map and concurrent secondary cards, tamper-proof criteria and no gated lookup.");

for (lang of ["ro", "ru"]) {
  const freshness = { property: { fetched_at: "2026-10-01T12:00:00Z", stale: true } };
  const text = textOf(freshnessNote.default({ freshness }));
  assert(text.includes("01.10.2026"));
  assert(text.includes(t("cadastru.checkedAt")));
  assert(text.includes(t("cadastru.savedDataStale")));
  assert.equal(freshnessNote.default({ freshness: { property: { fetched_at: "invalid", stale: false } } }), null);
}
console.log("Snapshot notices passed: actual source dates and saved-data warnings in Romanian and Russian.");
