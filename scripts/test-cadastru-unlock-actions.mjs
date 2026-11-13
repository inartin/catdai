// Isolated UI checks; no servers, network, or database writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-unlock-actions.mjs
import { cadastruValueLabel } from "../src/lib/cadastru-value-labels.js";
import { cadastruPropertyDetails, isCadastruNonResidential } from "../src/lib/cadastru-property-details.js";
import { CONSTRUCTION_CADASTRAL_RE, validateCadastralNumber } from "../src/lib/validation.js";
import { getCadastruFavoritePath } from "../src/lib/cadastru-favorites.js";
import { featureCheckoutUrl } from "../src/lib/payment-urls.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const trackingContext = vm.createContext({ crypto, URL });
const trackingModule = new vm.SourceTextModule(await fs.readFile("src/lib/cadastru-lookup-tracking.js", "utf8"), { context: trackingContext });
await trackingModule.link(() => new vm.SyntheticModule(["getDeviceId"], function () {
  this.setExport("getDeviceId", () => null);
}, { context: trackingContext }));
await trackingModule.evaluate();

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
  const context = vm.createContext({ console, crypto, URL, URLSearchParams, ...globals });
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

const CadastralDataCard = await loadJsx("src/components/CadastralDataCard.js", {
  "@/context/LanguageContext": translation,
  "@/lib/cadastru-value-labels": { cadastruValueLabel },
  "@/lib/cadastru-property-details": { cadastruPropertyDetails },
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
const parcelNumber = "0100201.999";
const parcelPreview = {
  ...multiPropertyPreview,
  cadastral_number: parcelNumber,
  matched_address: "Stăuceni, str. Exemplu 10",
  address_locality: "Stăuceni",
  lands: [{ cadastral_number: "|||||||||||", area_m2: "||||", estimated_value_lei: "||||||" }],
  buildings: [],
  registry_unavailable: true,
  locked_sections: { cadastru_details: true, address: true },
};

async function checkPageAction(isAuthenticated, numberPreview) {
  let checkoutUrl = "";
  let pdfChecks = 0;
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
  const lookupParams = new URLSearchParams(numberPreview
    ? { source: "number", cadastral_number: parcelNumber, lookup_id: crypto.randomUUID() }
    : { source: "address", preview: "1" });
  const storage = new Map([
    ["catdai:cadastru-address-result-preview:v1", JSON.stringify(multiPropertyPreview)],
    ["catdai:cadastru-address-lookup-request:v1", JSON.stringify(request)],
  ]);
  const page = await loadJsx("src/app/cadastru/rezultat/CadastruResultPage.js", {
    "./loading": { default: noop },
    "next/link": { default: noop },
    "@/components/usePaymentProvider": { default: () => "maib" },
    "@/lib/maib/products.mjs": { maibProduct: (key) => ({ key, amount_mdl: 49 }) },
    "@/lib/payment-urls.mjs": { featureCheckoutUrl },
    "@/lib/ga4-payment-client": { trackPaymentAnalytics: noop },
    "@/lib/cadastru-map": { cadastruMapLocation: () => null },
    "@/lib/cadastru-nearby": { nearbyAddressFromCadastru: () => null },
    "@/lib/cadastru-lookup-tracking": { ...trackingModule.namespace },
    "@/lib/visitor-browser": { getDeviceId: () => null },
    "@/lib/cadastru-share-tracking": { recordCadastruShareOpen: () => {} },
    "@/lib/cadastru-supported-cities": { CADASTRU_SUPPORTED_CITIES: ["Chișinău", "Durlești"] },
    react: { Suspense: noop, useState, useRef: (value) => useState(() => ({ current: value }))[0],
      useEffect: (effect) => effects.push(effect) },
    "next/navigation": { useRouter: () => ({ push: noop }),
      useSearchParams: () => lookupParams },
    "@/context/LanguageContext": translation,
    "@/context/AuthContext": { useAuth: () => ({ isAuthenticated, loading: false,
      session: isAuthenticated ? { access_token: "test-token" } : null, clearAuthError: noop }) },
    "@/lib/cadastru-property-details": { isCadastruNonResidential },
    "@/lib/validation": { CONSTRUCTION_CADASTRAL_RE, matchCity: () => null, validateCadastralNumber },
    "@/lib/cadastru-favorites": { getCadastruFavoritePath, getSavedCadastruAddress: () => null },
    "@/lib/cadastru-valuation-handoff": { resolveValuationDistrict: () => null, buildFullAccessAddressResultParams: noop },
    "@/lib/cadastru-municipal-reports": { municipalReportsAvailableForCadastru: () => false,
      validMunicipalReportsResult: () => false },
    "@/components/CadastralDataCard": { default: CadastralDataCard },
    "@/components/AuthRequiredModal": { default: AuthRequiredModal },
    "@/components/FeaturePricingAction": { default: FeaturePricingAction },
  }, {
    window: { location: { href: `https://catdai.md/${lang}/cadastru/rezultat?${lookupParams}`, assign: (url) => { checkoutUrl = url; } } },
    requestAnimationFrame: noop, navigator: { userAgent: "" }, localStorage: { removeItem: noop },
    sessionStorage: { getItem: (key) => storage.get(key) ?? null },
    fetch: async (url, options) => {
      if (numberPreview) {
        if (url === "/api/cadastral") {
          assert.equal(JSON.parse(options.body).cadastral_number, parcelNumber);
          return { ok: true, json: async () => numberPreview };
        }
        return { ok: false, json: async () => ({}) };
      }
      if (url === "/api/cadastru/pdf") {
        pdfChecks++;
        assert.equal(options.headers.Authorization, "Bearer test-token");
        assert.equal(JSON.parse(options.body).use_paid_credit, false);
        return { status: 402, json: async () => ({ error: "purchase_required" }) };
      }
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
  const tree = render();
  const [card] = findNodes(tree, (node) => node.type === CadastralDataCard);
  assert(card, "result renders its cadastral card");
  const [dock] = findNodes(tree, (node) => node.type === FeaturePricingAction && node.props.mobileDock);
  const [pdfAction] = findNodes(tree, (node) => node.props?.identity && node.props?.purchaseOffer);

  const assertCheckout = () => {
    const checkout = new URL(checkoutUrl);
    assert.equal(checkout.pathname, "/payment/checkout");
    assert.equal(checkout.searchParams.get("product_key"), purchase.product_key);
    assert.equal(checkout.searchParams.get("lang"), lang);
    if (numberPreview) {
      const returnTo = new URL(checkout.searchParams.get("return_to"), checkout.origin);
      assert.equal(returnTo.pathname, `/${lang}/cadastru/rezultat`);
      for (const [key, value] of lookupParams) assert.equal(returnTo.searchParams.get(key), value);
    }
  };

  if (numberPreview) {
    const cardContent = CadastralDataCard(card.props);
    const [addressField, ...fields] = findNodes(cardContent, (node) => node.props?.role === "button");
    if (numberPreview.access_limit.purchase === null) {
      assert(!addressField && !dock && !pdfAction, "bare recovery cannot start checkout");
      assert(findNodes(cardContent, (node) => node.type === "button" && node.props.children === t("cadastru.retrySearch")).length,
        "bare recovery offers a retry");
      return;
    }
    assert(dock && pdfAction, "verified number preview offers checkout on mobile and from Save PDF");
    assert(addressField && fields.length > 0, "masked address and property values are interactive");
    addressField.props.onClick();
    assertCheckout();
    checkoutUrl = "";
    let prevented = false;
    fields[0].props.onKeyDown({ key: "Enter", preventDefault: () => { prevented = true; } });
    assert(prevented);
    assertCheckout();
    checkoutUrl = "";
    const [desktopUnlock] = findNodes(cardContent, (node) => node.type === "button");
    desktopUnlock.props.onClick();
    assertCheckout();
    return;
  }

  assert(pdfAction, "locked previews show the PDF action");
  const pdfCursor = cursor;
  const renderPdf = () => {
    cursor = pdfCursor;
    effects = [];
    const pdf = pdfAction.type(pdfAction.props);
    effects.forEach((effect) => effect());
    return pdf;
  };
  const [button] = findNodes(renderPdf(), (node) => node.props?.["data-cadastru-save-pdf"] === true);
  assert(button);
  assert.equal(pdfChecks, 0, "rendering does not start an export");
  button.props.onClick();
  renderPdf();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const [popup] = findNodes(renderPdf(), (node) => node.type === AuthRequiredModal && node.props.open);
  assert(popup, "the non-paid PDF action opens the purchase popup");
  const [pdfOffer] = findNodes(popup, (node) => node.type === FeaturePricingAction);
  assert.equal(pdfOffer.props.offer.product_key, purchase.product_key);
  assert.equal(pdfChecks, 0, "locked previews open the popup without requesting an export");

  if (isAuthenticated) {
    slots.length = pdfCursor;
    pdfAction.props.locked = false;
    const [unlockedButton] = findNodes(renderPdf(), (node) => node.props?.["data-cadastru-save-pdf"] === true);
    unlockedButton.props.onClick();
    renderPdf();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(pdfChecks, 1, "a visible result still requires server authorization");
    assert(findNodes(renderPdf(), (node) => node.type === AuthRequiredModal && node.props.open).length,
      "a free unlock opens the purchase popup after the server declines the export");
  }
  assert.equal(dock.props.offer.product_key, purchase.product_key);
  card.props.onLockedClick();
  assertCheckout();
}

for (lang of ["ro", "ru"]) {
  await checkPageAction(false);
  await checkPageAction(true);
  await checkPageAction(false, parcelPreview);
  await checkPageAction(true, parcelPreview);
  await checkPageAction(false, { ...parcelPreview, access_limit: { purchase: null } });
  for (const cadastral of [multiPropertyPreview, singleNumberPreview]) {
    const props = { cadastral, onLockedClick: noop, showRevealButton: true };
    assert.equal(findNodes(CadastralDataCard(props), (node) => node.type === "button").length, 1,
      "single-number and multi-property previews have one action each");
    assert.equal(findNodes(CadastralDataCard({ ...props, cadastral: { ...cadastral, full_access: true, locked_sections: {} } }),
      (node) => node.type === "button").length, 0, "full-access results have no unlock action");
    assert.equal(findNodes(CadastralDataCard({ ...props, showRevealButton: false }),
      (node) => node.type === "button").length, 0, "a card without a reveal action does not show a button");
  }
}
console.log("Cadastru address and number unlock actions pass in RO/RU, including partial registry results.");
