// Isolated API/UI regressions; no servers, network or database writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-secondary-preview.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";
import { loadAppModule } from "./lib/load-app-module.mjs";

const clone = value => JSON.parse(JSON.stringify(value));
const cache = { fetched_at: "2026-11-01T10:00:00Z", stale: false };
const location = { latitude: 47.02, longitude: 28.83 };
const categories = ["schools", "supermarkets", "pharmacies", "food", "parks", "public_transport"];
const nearby = { location, cache, categories: Object.fromEntries(categories.map((category, group) => [category, {
  available: true,
  places: Array.from({ length: group % 4 }, (_, index) => ({
    name: index ? `SECRET-${category}-${index}` : `Visible-${category}`,
    osm_id: group * 10 + index, osm_type: "node", latitude: 47.03, longitude: 28.84,
    walking_distance_m: 143 + index * 500, walking_duration_min: 2 + index * 6,
  })),
}])) };
const transport = { location, cache, scope: "nearby", route_groups:
  ["bus", "trolleybus", "share_taxi", "train", "tram", "light_rail", "unknown"].map((mode, group) => ({
    mode, routes: Array.from({ length: [4, 3, 1, 2, 0, 2, 1][group] }, (_, index) => ({
      ref: index ? `SECRET-${mode}-${index}` : `${100 + group}`,
      name: index ? `SECRET-route-name-${mode}-${index}` : `Visible-${mode}`,
    })),
  })), stops: [{ routes: ["SECRET-duplicate-route"] }] };
const report = index => ({ id: `SECRET-report-${index}`, title: `SECRET-complaint-${index}`,
  status: "SOLVED", reported_at: "2026-10-01T12:00:00Z", is_public: true, distance_m: 100,
  description: "SECRET-description", source_url: "https://eu.chisinau.md/raport/SECRET-link" });
const reports = { location, cache, address_match_available: true, search_radius_m: 300,
  summary: { total: 3, at_address: 1, nearby: 2, solved: 2 }, period: { years: 2 },
  at_address: { count: 1, reports: [report(1)], has_more: false },
  nearby: { count: 2, reports: [report(2), report(3)], has_more: false } };
const fixtures = { nearby, public_transport: transport, municipal_reports: reports };
const originals = clone(fixtures);
const previews = {};

for (const [path, key, storage, getter, formatter, writer, fetcher] of [
  ["nearby", "nearby", "cadastru-nearby-storage", "getStoredNearby", "nearbyFromStorage", "storeNearby", "fetchExternalNearbyData"],
  ["public-transport", "public_transport", "cadastru-public-transport-storage", "getStoredPublicTransport", "publicTransportFromStorage", "storePublicTransport", "fetchExternalPublicTransportData"],
  ["municipal-reports", "municipal_reports", "cadastru-municipal-reports-storage", "getStoredMunicipalReports", "municipalReportsFromStorage", "storeMunicipalReports", "fetchExternalMunicipalReportsData"],
]) {
  for (const unlocked of [false, true]) {
    for (const source of ["cached", "stale", "worker"]) {
      const fixture = fixtures[key];
      const payload = { ...fixture, cache: { ...cache, stale: source === "stale" } };
      let fetches = 0;
      const writes = [], refreshes = [];
      const route = await loadAppModule(`src/app/api/cadastru/${path}/route.js`, {
        "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
        "@/lib/statistics-context": { withStatisticsContext: handler => handler },
        "@/lib/cadastru-result-category-tracking": { recordCadastruResultCategories: async () => {} },
        "@/lib/supabase-admin": { supabaseAdmin: { from: () => { throw new Error("Unexpected database read"); } } },
        "@/lib/cache": { getSharedCache: async () => null, setSharedCache: async () => true },
        "@/lib/rate-limit": { rateLimit: () => ({ check: async () => ({ allowed: true }) }) },
        "@/lib/cadastru-map-access": { canReadCadastruMapData: async () => unlocked },
        "@/lib/cadastru-refresh": { scheduleCadastruRefresh: (_key, refresh) => refreshes.push(refresh) },
        "@/lib/cadastru-records": {
          getCadastruRecordByAddress: async () => ({ payload: { request_address: "Chișinău, strada Test 1" } }),
          getCadastruRecordByNumber: async () => null,
        },
        "@/lib/cadastru-buildings": { getBuildingFallback: async () => null },
        "@/lib/cadastru-external-api": { [fetcher]: async () => { fetches++; return payload; } },
        [`@/lib/${storage}`]: {
          [getter]: async () => source === "worker" ? null : { payload, expiresAt: source === "stale" ? "2020-01-01" : "2099-01-01" },
          [formatter]: saved => saved.payload,
          [writer]: async (_input, data) => { writes.push(clone(data)); return { payload: data }; },
        },
      });
      const response = await route.POST(new Request(`http://localhost/api/cadastru/${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: "Chișinău, strada Test 1" }),
      }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const data = (await response.json())[key];
      assert.equal(fetches, source === "worker" ? 1 : 0);
      assert.equal(refreshes.length, source === "stale" ? 1 : 0);
      assert.deepEqual(writes, source === "worker" ? [payload] : [], "storage always receives the complete source response");
      assert.equal(data.cache.stale, source === "stale");
      if (unlocked) {
        assert.deepEqual(data, payload, "unlocked results retain all original data");
        continue;
      }
      previews[key] = data;
      assert.equal(data.full_access, false);
      assert(!JSON.stringify(data).includes("SECRET"), `${path}/${source} leaks hidden details`);
      assert.equal(data.location?.latitude, undefined);
      assert.equal(data.location?.longitude, undefined);
      if (key === "nearby") {
        assert.equal(data.map_preview.available, true);
        for (const category of categories) {
          const visible = data.categories[category].places, real = fixture.categories[category].places;
          assert.equal(visible.length, real.length, "empty and single-entry categories add no placeholders");
          assert.equal(visible.filter(place => !place.locked).length, Math.min(1, real.length));
          if (real.length) {
            assert.equal(visible[0].name, real[0].name);
            assert.equal(visible[0].walking_distance_m, real[0].walking_distance_m);
            assert.equal(visible[0].latitude, undefined);
          }
          visible.slice(1).forEach((place, index) => {
            assert.equal(place.locked, true);
            assert.equal(place.osm_id, undefined);
            assert.notEqual(place.walking_distance_m, real[index + 1].walking_distance_m);
            assert.notEqual(place.walking_duration_min, real[index + 1].walking_duration_min);
          });
        }
      } else if (key === "public_transport") {
        data.route_groups.forEach((group, index) => {
          const real = fixture.route_groups[index].routes;
          assert.equal(group.routes.length, real.length);
          assert.equal(group.routes.filter(route => !route.locked).length, Math.min(1, real.length));
          if (real.length) assert.deepEqual(group.routes[0], real[0]);
          assert(group.routes.slice(1).every(route => route.locked));
        });
        assert.equal(data.stops, undefined, "alternate copies cannot expose hidden routes");
      } else {
        assert.deepEqual(data.summary, fixture.summary, "free previews retain all category totals");
        assert.equal(data.at_address, undefined);
        assert.equal(data.nearby, undefined);
      }
    }
  }
}
assert.deepEqual(fixtures, originals, "preview generation must not mutate shared snapshots");
console.log("Secondary APIs: cached, stale and worker previews, complete unlocked responses and unchanged storage passed.");

const parsing = await loadAppModule("src/lib/cadastru-municipal-reports.js");
assert(parsing.validMunicipalReportsResult(reports));
assert(!parsing.validMunicipalReportsResult(previews.municipal_reports), "worker/storage validation rejects previews");
assert(parsing.validMunicipalReportsResult(previews.municipal_reports, { allowPreview: true }));
for (const total of [0, 3]) assert(parsing.validMunicipalReportsResult({ ...previews.municipal_reports,
  summary: { ...reports.summary, total } }, { allowPreview: true }));
for (const field of ["at_address", "nearby", "solved", "total"]) {
  for (const value of [-1, "3", undefined]) assert(!parsing.validMunicipalReportsResult({ ...previews.municipal_reports,
    summary: { ...reports.summary, [field]: value } }, { allowPreview: true }));
}
assert(parsing.validMunicipalReportsResult({ ...previews.municipal_reports,
  summary: { ...reports.summary, at_address: null } }, { allowPreview: true }));

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require("next/dist/build/swc");
await loadBindings();
const copy = Object.fromEntries(await Promise.all(["ro", "ru", "en"].map(async lang =>
  [lang, JSON.parse(await fs.readFile(`src/locales/${lang}.json`, "utf8"))])));
let lang = "ro", state = [], cursor = 0, clicks = 0;
const t = (key, vars = {}) => {
  assert(copy[lang][key], `${lang}: missing ${key}`);
  return Object.entries(vars).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), copy[lang][key]);
};
const jsx = (type, props) => ({ type, props });
async function loadCard(file) {
  const { code } = await transform(await fs.readFile(file, "utf8"), {
    filename: file, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "es6" },
  });
  const context = vm.createContext({ Intl });
  const jsxModule = new vm.SourceTextModule(code, { context });
  await jsxModule.link(name => {
    const exports = name === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "fragment" }
      : name === "react" ? { useId: () => "reports", useState: initial => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      } } : name === "@/context/LanguageContext" ? { useTranslation: () => ({ lang, t }) }
        : name === "@/lib/cadastru-municipal-reports" ? { ...parsing } : { default: () => null };
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await jsxModule.evaluate();
  return jsxModule.namespace.default;
}
const find = (node, predicate) => !node || typeof node !== "object" ? [] : Array.isArray(node)
  ? node.flatMap(child => find(child, predicate)) : [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
const textOf = node => node == null || typeof node === "boolean" ? "" : Array.isArray(node)
  ? node.map(textOf).join("") : typeof node === "object" ? textOf(node.props?.children) : String(node);
const render = (Card, props) => { cursor = 0; return Card(props); };
const Nearby = await loadCard("src/components/CadastruNearbyCard.js");
const Transport = await loadCard("src/components/CadastruPublicTransportCard.js");
const Reports = await loadCard("src/components/CadastruMunicipalReportsCard.js");
for (lang of ["ro", "ru", "en"]) {
  for (const [Card, prop, data] of [[Nearby, "nearby", previews.nearby], [Transport, "transport", previews.public_transport]]) {
    state = [];
    const props = { [prop]: data, onLockedClick: () => clicks++ };
    let tree = render(Card, props);
    assert(!textOf(tree).includes("SECRET"));
    const buttons = find(tree, node => node.type === "button" && node.props["aria-label"] === t("cadastru.payToUnlock"));
    assert(buttons.length > 0);
    for (const button of buttons) {
      assert.equal(find(button, node => node.props?.className?.includes("blur-sm") && node.props["aria-hidden"] === true).length, 1);
      const before = clicks;
      button.props.onClick();
      assert.equal(clicks, before + 1, "blurred fake entries open the shared checkout action");
    }
    if (Card === Transport) {
      const expand = find(tree, node => node.type === "button" && "aria-expanded" in node.props)[0];
      expand.props.onClick();
      tree = render(Card, props);
      assert(!textOf(tree).includes("SECRET"), "expanding routes cannot reveal actual hidden data");
    }
    state = [];
    const full = render(Card, { [prop]: prop === "nearby" ? nearby : transport });
    assert.equal(find(full, node => node.props?.className?.includes("blur-sm")).length, 0);
  }
  state = [];
  let tree = render(Reports, { reports: previews.municipal_reports });
  assert.deepEqual(find(tree, node => node.type === "dd").map(textOf), ["1", "2", "2"]);
  for (const key of ["reportsCountAddress", "reportsCountNearby", "reportsCountSolved", "reportsDetailsLocked"]) {
    assert(textOf(tree).includes(t(`cadastru.${key}`)));
  }
  assert.equal(find(tree, node => node.type === "button" || node.type === "details").length, 0);
  tree = render(Reports, { reports: { ...previews.municipal_reports,
    summary: { total: 0, at_address: 0, nearby: 0, solved: 0 } } });
  assert.deepEqual(find(tree, node => node.type === "dd").map(textOf), ["0", "0", "0"]);
  assert(!textOf(tree).includes(t("cadastru.reportsDetailsLocked")), "empty results do not promise paid details");
  tree = render(Reports, { reports: { ...previews.municipal_reports,
    summary: { ...reports.summary, at_address: null } } });
  assert.deepEqual(find(tree, node => node.type === "dd").map(textOf), ["-", "2", "2"]);
  tree = render(Reports, { reports });
  assert(!textOf(tree).includes(t("cadastru.reportsDetailsLocked")));
  assert.equal(find(tree, node => node.type === "dd").length, 3);
  assert.equal(find(tree, node => node.type === "button")[0].props["aria-expanded"], false);
  find(tree, node => node.type === "button")[0].props.onClick();
  tree = render(Reports, { reports });
  assert.equal(find(tree, node => node.props?.id === "reports")[0].props.hidden, false);
  assert.equal(find(render(Reports, { reports: null, unavailable: true }), node => node.type === "dd").length, 0);
  assert(t("cadastru.unlockCompleteCta", { price: "20 MDL" }).includes("20 MDL"));
}
assert.equal(copy.ro["cadastru.unlockCompleteCta"], "Deblochează raportul complet - {price}");
console.log("RO/RU/EN UI: blurred fake entries, checkout actions, safe route expansion, complaints totals and full-report CTA passed.");
