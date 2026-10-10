// Isolated client scheduling/card checks; no servers, network, or database writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-secondary-loading.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";

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
  const context = vm.createContext({ console, URL, URLSearchParams, AbortController, ...globals });
  const jsxModule = new vm.SourceTextModule(code, { context });
  await jsxModule.link((name) => {
    const exports = mocks[name] || (name.startsWith("@/components/") ? { default: noop } : null);
    assert(exports, `Unexpected import: ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await jsxModule.evaluate();
  return jsxModule.namespace;
}

const slots = [];
let cursor = 0;
let effects = [];
const frames = new Map();
let nextFrame = 0;
const requests = new Map();
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
const page = await loadJsx("src/app/cadastru/rezultat/page.js", {
  react: { Suspense: noop, useState, useRef: (value) => useState(() => ({ current: value }))[0], useEffect },
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
  "next/navigation": { useRouter: () => ({ push: noop }), useSearchParams: () => new URLSearchParams({ cadastral_number: number }) },
  "@/context/LanguageContext": translation,
  "@/context/AuthContext": { useAuth: () => ({ isAuthenticated: false, loading: false, session: null, clearAuthError: noop }) },
  "@/lib/validation": { matchCity: () => null, validateCadastralNumber: (value) => ({ valid: value === number, value }) },
  "@/lib/cadastru-favorites": { getCadastruFavoritePath: () => null, getSavedCadastruAddress: () => null },
  "@/lib/cadastru-valuation-handoff": { resolveValuationDistrict: () => null },
  "@/lib/cadastru-municipal-reports": { municipalReportsAvailableForCadastru: (data) => data?.form_fields?.city === "Chișinău", validMunicipalReportsResult: (data) => data?.summary?.total >= 0 },
}, {
  window: {}, localStorage: { removeItem: noop },
  requestAnimationFrame: (callback) => { const id = ++nextFrame; frames.set(id, callback); return id; },
  cancelAnimationFrame: (id) => frames.delete(id),
  fetch: (url, options) => {
    assert(!requests.has(url), `Duplicate request: ${url}`);
    return new Promise((resolve) => requests.set(url, { resolve, options }));
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
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
  "@/context/LanguageContext": translation,
});
for (const locale of ["ro", "ru"]) {
  lang = locale;
  const transport = { scope: "nearby", route_groups: [{ mode: "bus", routes: [{ ref: "19" }] }], cache: { stale: true } };
  assert(textOf(transportCard.default({ transport })).includes(t("cadastru.transportStale")), "stored fallback is labeled in both locales");
  assert(!textOf(transportCard.default({ transport: { ...transport, cache: { stale: false } } })).includes(t("cadastru.transportStale")), "fresh data has no stale warning");
}
console.log("Transport card passed: stale fallback notice in RO/RU, without warnings on fresh responses.");

const nearbyCard = await loadJsx("src/components/CadastruNearbyCard.js", {
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
  "@/context/LanguageContext": translation,
});
for (const locale of ["ro", "ru"]) {
  lang = locale;
  const nearby = { categories: {}, cache: { stale: true } };
  assert(textOf(nearbyCard.default({ nearby })).includes(t("cadastru.nearbyStale")));
  assert(!textOf(nearbyCard.default({ nearby: { ...nearby, cache: { stale: false } } })).includes(t("cadastru.nearbyStale")));
}
console.log("Nearby card passed: stale fallback notices in RO/RU, and embedded legacy data does not bypass the shared request.");
