// Isolated UI checks; no servers, network, or database writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-unlock-actions.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require("next/dist/build/swc");
await loadBindings();
const jsx = (type, props) => ({ type, props });
const noop = () => null;
const AuthRequiredModal = () => null;
const FeaturePricingAction = () => null;
const locales = Object.fromEntries(await Promise.all(["ro", "ru"].map(async (lang) =>
  [lang, JSON.parse(await fs.readFile(`src/locales/${lang}.json`, "utf8"))])));
let lang = "ro";
const t = (key) => locales[lang][key] || key;
const translation = { useTranslation: () => ({ lang, t }) };

async function loadJsx(file, mocks, globals = {}) {
  const { code } = await transform(await fs.readFile(file, "utf8"), {
    filename: file,
    jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
    module: { type: "es6" },
  });
  const context = vm.createContext({ console, URL, URLSearchParams, ...globals });
  const jsxModule = new vm.SourceTextModule(code, { context });
  await jsxModule.link((name) => {
    const exports = name === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "Fragment" }
      : mocks[name] || (name.startsWith("@/components/") ? { default: noop } : null);
    assert(exports, `Unexpected import: ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await jsxModule.evaluate();
  return jsxModule.namespace.default;
}

function findNodes(node, predicate) {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => findNodes(child, predicate));
  return [...(predicate(node) ? [node] : []), ...findNodes(node.props?.children, predicate)];
}

function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textOf).join("");
  return typeof node === "object" ? textOf(node.props?.children) : String(node);
}

const CadastralDataCard = await loadJsx("src/components/CadastralDataCard.js", {
  "@/context/LanguageContext": translation,
});
const address = "22, Strada Luceafărul, Stăuceni";
const purchase = { product_key: "cadastru_lookup_single", price_mdl: 25 };
const multiPropertyPreview = {
  status: "success",
  matched_address: address,
  lands: [{ cadastral_number: "|||||||||||", address, area_m2: "||||", object_type: "||||" }],
  buildings: [{ cadastral_number: "||||||||||||||", address, object_type: "||||" }],
  full_access: false,
  locked_sections: { cadastru_details: true },
  access_limit: { reason: "free_monthly_limit_reached", purchase },
};
const singleNumberPreview = {
  cadastral_number: "0100201.999.01.0101",
  apartment: { address, area_m2: "||||", floor: "2" },
  building: { classifier: "bloc", total_floors: "|" },
  full_access: false,
  locked_sections: { cadastru_details: true, cadastral_number: true },
};

async function checkPageAction(isAuthenticated) {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (next) => {
      slots[index] = typeof next === "function" ? next(slots[index]) : next;
    }];
  };
  const request = { city: "Stăuceni", road_type: "strada", street: "Luceafărul", house_number: "22" };
  const storage = new Map([
    ["catdai:cadastru-address-result-preview:v1", JSON.stringify(multiPropertyPreview)],
    ["catdai:cadastru-address-lookup-request:v1", JSON.stringify(request)],
  ]);
  const page = await loadJsx("src/app/cadastru/rezultat/page.js", {
    react: { Suspense: noop, useState, useRef: (value) => useState(() => ({ current: value }))[0],
      useEffect: (effect) => effects.push(effect) },
    "next/navigation": { useRouter: () => ({ push: noop }),
      useSearchParams: () => new URLSearchParams("source=address&preview=1") },
    "@/context/LanguageContext": translation,
    "@/context/AuthContext": { useAuth: () => ({ isAuthenticated, loading: false,
      session: isAuthenticated ? { access_token: "test-token" } : null, clearAuthError: noop }) },
    "@/lib/validation": { matchCity: () => null, validateCadastralNumber: () => ({ valid: false }) },
    "@/lib/cadastru-favorites": { getCadastruFavoritePath: () => null, getSavedCadastruAddress: () => null },
    "@/lib/cadastru-valuation-handoff": { resolveValuationDistrict: () => null },
    "@/lib/cadastru-municipal-reports": { municipalReportsAvailableForCadastru: () => false,
      validMunicipalReportsResult: () => false },
    "@/components/CadastralDataCard": { default: CadastralDataCard },
    "@/components/AuthRequiredModal": { default: AuthRequiredModal },
    "@/components/FeaturePricingAction": { default: FeaturePricingAction },
  }, {
    window: {}, localStorage: { removeItem: noop },
    sessionStorage: { getItem: (key) => storage.get(key) ?? null },
    fetch: async (url) => {
      assert(isAuthenticated, "anonymous result uses its saved preview");
      assert.equal(url, "/api/cadastru/address");
      return { ok: true, json: async () => multiPropertyPreview };
    },
  });
  const render = () => {
    cursor = 0;
    effects = [];
    return page().props.children.type();
  };
  render();
  effects.forEach((effect) => effect());
  await new Promise((resolve) => setTimeout(resolve, 0));
  let tree = render();
  const card = findNodes(tree, (node) => node.type === CadastralDataCard)[0];
  assert(card, "multi-property result renders its cadastral card");
  const buttons = findNodes(CadastralDataCard(card.props), (node) => node.type === "button");
  assert.equal(buttons.length, 1, `${lang}: multi-property result offers one shared unlock action`);
  assert.equal(textOf(buttons[0]), t(isAuthenticated ? "cadastru.payToUnlock" : "cadastru.unlockData"));
  buttons[0].props.onClick();
  tree = render();
  const openModals = findNodes(tree, (node) => node.type === AuthRequiredModal && node.props.open);
  assert.equal(openModals.length, 1, "unlock action opens one modal");
  assert.equal(openModals[0].props.copyKey, isAuthenticated ? "payment.buyAccess" : "cadastru.loginToUse");
  if (isAuthenticated) {
    const offer = findNodes(openModals[0], (node) => node.type === FeaturePricingAction)[0];
    assert.equal(offer.props.offer.product_key, purchase.product_key);
    assert.equal(offer.props.variant, "cadastru");
  }
}

for (lang of ["ro", "ru"]) {
  await checkPageAction(false);
  await checkPageAction(true);
  for (const cadastral of [multiPropertyPreview, singleNumberPreview]) {
    const props = { cadastral, onLockedClick: noop, showRevealButton: true };
    assert.equal(findNodes(CadastralDataCard(props), (node) => node.type === "button").length, 1,
      "single-number and multi-property previews have one action each");
    assert.equal(findNodes(CadastralDataCard({ ...props, cadastral: { ...cadastral, full_access: true, locked_sections: {} } }),
      (node) => node.type === "button").length, 0, "full-access results have no unlock action");
    assert.equal(findNodes(CadastralDataCard({ ...props, showRevealButton: false }),
      (node) => node.type === "button").length, 0, "image exports have no interactive action");
  }
}
console.log("Cadastru single/multi-property login and payment actions pass in RO/RU.");
