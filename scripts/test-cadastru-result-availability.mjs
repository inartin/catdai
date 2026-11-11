// Render real result cards; no servers, network or database writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-result-availability.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { cadastruValueLabel } from "../src/lib/cadastru-value-labels.js";
import { cadastruPropertyDetails } from "../src/lib/cadastru-property-details.js";

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require("next/dist/build/swc");
await loadBindings();
const locales = Object.fromEntries(await Promise.all(["ro", "ru", "en"].map(async (lang) =>
  [lang, JSON.parse(await fs.readFile(`src/locales/${lang}.json`, "utf8"))])));
let lang = "ro";
const modules = new Map();
const context = vm.createContext({ Intl });
const mocks = {
  "react/jsx-runtime": jsxRuntime,
  "@/context/LanguageContext": { useTranslation: () => ({ lang, t: (key) => locales[lang][key] || key }) },
  "@/components/icons/LockIcon": { default: () => null },
  "@/lib/cadastru-value-labels": { cadastruValueLabel },
  "@/lib/cadastru-property-details": { cadastruPropertyDetails },
};
async function load(name) {
  if (modules.has(name)) return modules.get(name);
  let loadedModule;
  if (mocks[name]) {
    const exports = mocks[name];
    loadedModule = new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  } else {
    const file = `src/${name.slice(2)}.js`;
    const { code } = await transform(await fs.readFile(file, "utf8"), {
      filename: file,
      jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
      module: { type: "es6" },
    });
    loadedModule = new vm.SourceTextModule(code, { context });
  }
  modules.set(name, loadedModule);
  return loadedModule;
}
const component = await load("@/components/CadastralDataCard");
await component.link(load);
await component.evaluate();
const Card = component.namespace.default;
const render = (cadastral, extra = {}) => renderToStaticMarkup(jsxRuntime.jsx(Card, {
  cadastral, onRegistryRetry: () => {}, ...extra,
}));
const number = "6475103.437";
const results = [
  { cadastral_number: number, lands: [{ cadastral_number: number, area_m2: "1385", destination: "Agricol", use_mode: "Teren pentru grădini", partial: true }] },
  { buildings: [{ cadastral_number: `${number}.01`, object_type: "Construcție", partial: true }] },
  { cadastral_number: `${number}.01.001`, apartment: { area_m2: "50", floor: "2" } },
  { cadastral_number: `${number}.01`, building: { total_floors: "5" } },
  { cadastral_number: number, matched_address: "Orhei, str. Test 1" },
  { lands: [{ cadastral_number: number }], buildings: [{ cadastral_number: `${number}.01` }] },
  { cadastral_number: "|||||||||||", apartment: { area_m2: "||||" }, locked_sections: { cadastru_details: true } },
];
const unresolved = [
  {},
  { cadastral_number: number },
  { cadastral_number: number, map_location: { latitude: 47, longitude: 28 } },
  { matched_address: "Orhei, str. Test 1" },
  { lands: [{}], buildings: [{}] },
];
for (lang of ["ro", "ru", "en"]) {
  const notice = locales[lang]["cadastru.registryUnavailablePartial"];
  const retry = locales[lang]["cadastru.retrySearch"];
  for (const result of results) {
    const html = render({ ...result, registry_unavailable: true, partial: true,
      data_freshness: { property: { stale: true } } });
    assert(!html.includes(notice), `${lang}: a resolved property does not claim it is unavailable`);
    assert(!html.includes(retry), `${lang}: optional enrichment failure does not offer another search`);
    assert(html.includes(locales[lang]["cadastru.savedDataStale"]), `${lang}: the saved-data notice remains visible`);
  }
  for (const result of unresolved) {
    const html = render({ ...result, registry_unavailable: true });
    assert(html.includes(notice), `${lang}: unavailable results still explain the failure`);
    assert(html.includes(retry), `${lang}: unavailable results retain manual retry`);
  }
  const retrying = render({ cadastral_number: number, registry_unavailable: true }, { registryRetrying: true });
  assert(retrying.includes(locales[lang]["cadastru.registryRetrying"]));
  assert(retrying.includes("disabled="), "an active retry cannot be submitted twice");
}
console.log("Result availability passed in RO/RU/EN: resolved properties omit outage/retry, unavailable results retain retry, stale-data notices remain.");
