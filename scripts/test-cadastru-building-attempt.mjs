// Isolated real component/effect and navigation checks; no network or live writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-building-attempt.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const jsx = (type, props) => ({ type, props });
const noop = () => null;
const walk = (node) => Array.isArray(node) ? node.flatMap(walk)
  : node && typeof node === 'object' ? [node, ...walk(node.props?.children)] : [];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const addressKey = 'catdai:cadastru-address-lookup-request:v1';
const number = '0100104.003.01';
const result = { lands: [{ cadastral_number: '0100104.003' }], request_address: 'Chișinău, str Valea Trandafirilor 11' };

const translations = Object.fromEntries(await Promise.all(['ro', 'ru', 'en'].map(async (lang) =>
  [lang, JSON.parse(await fs.readFile(`src/locales/${lang}.json`, 'utf8'))])));
const textOf = (node) => Array.isArray(node) ? node.map(textOf).join(' ')
  : node && typeof node === 'object' ? textOf(node.props?.children) : String(node ?? '');
async function harness(file, path, stored = {}, lang = 'ro') {
  let slots = [], cursor = 0, effects = [], authSession = null;
  const storage = new Map(Object.entries(stored));
  const drafts = new Map();
  const requests = [], navigations = [], timers = [];
  const browser = { location: { href: `https://catdai.md${path}` }, history: { state: { retained: true } } };
  browser.history.replaceState = (state, _, url) => {
    browser.history.state = state;
    browser.location.href = new URL(url, browser.location.href).href;
  };
  const navigate = (url) => { navigations.push(url); browser.location.href = new URL(url, browser.location.href).href; };
  const router = { push: navigate, replace: navigate };
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
  };
  const useEffect = (effect, deps) => {
    const index = cursor++;
    const previous = slots[index];
    if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
    previous?.cleanup?.();
    slots[index] = { deps, effect };
    effects.push(() => { slots[index].cleanup = effect(); });
  };
  const mocks = {
    'next/link': { default: noop },
    '@/lib/ga4-payment-client': { trackPaymentAnalytics: noop },
    '@/components/usePaymentProvider': { default: () => 'maib' },
    '@/lib/maib/products.mjs': { maibProduct: key => ({ key, amount_mdl: 15 }) },
    '@/lib/payment-urls.mjs': { featureCheckoutUrl: () => '/payment/checkout' },
    '@/lib/cadastru-map': { cadastruMapLocation: () => null },
    '@/lib/cadastru-nearby': { nearbyAddressFromCadastru: () => null },
    '@/lib/visitor-browser': { getDeviceId: () => null },
    '@/lib/cadastru-share-tracking': { recordCadastruShareOpen: () => {} },
  "@/lib/statistics-context": { shouldCollectStatistics: () => true, withStatisticsContext: handler => handler },
    react: { Suspense: noop, useState, useRef: (value) => useState(() => ({ current: value }))[0], useEffect },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/navigation': { useRouter: () => router, useSearchParams: () => new URL(browser.location.href).searchParams },
    '@/context/LanguageContext': { useTranslation: () => ({ lang, t: (key, params = {}) => Object.entries(params).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), translations[lang][key] || key) }) },
    '@/context/AuthContext': { useAuth: () => ({ isAuthenticated: Boolean(authSession), loading: false,
      session: authSession, clearAuthError: noop }) },
    '@/lib/validation': { matchCity: () => null, validateCadastralNumber: (value) => ({ valid: value === number }) },
    '@/lib/cadastru-favorites': { getCadastruFavoritePath: () => null, getSavedCadastruAddress: () => null },
    '@/lib/cadastru-valuation-handoff': { resolveValuationDistrict: () => null,
      buildFullAccessAddressResultParams: (data) => new URLSearchParams({ source: 'address', cadastral_number: data.cadastral_number }) },
    '@/lib/cadastru-municipal-reports': { municipalReportsAvailableForCadastru: () => false, validMunicipalReportsResult: () => false },
    '@/lib/cadastru-supported-cities': { CADASTRU_SUPPORTED_CITIES: ['Chișinău', 'Durlești', 'Codru', 'Bălți'] },
    './loading': { default: noop },
  };
  const context = vm.createContext({ URL, URLSearchParams, crypto, console, window: browser, navigator: { userAgent: "" },
    localStorage: { getItem: key => drafts.get(key) ?? null, setItem: (key, value) => drafts.set(key, value), removeItem: key => drafts.delete(key) },
    sessionStorage: { getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
    setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout: noop,
    fetch: (url, options) => new Promise((resolve) => requests.push({ url, body: JSON.parse(options.body), options, resolve })),
  });
  const { code } = await transform(await fs.readFile(file, 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'es6' },
  });
  const pageModule = new vm.SourceTextModule(code, { context });
  await pageModule.link(async (name) => {
    if (name === '@/lib/cadastru-lookup-tracking') {
      return new vm.SourceTextModule(await fs.readFile('src/lib/cadastru-lookup-tracking.js', 'utf8'), { context });
    }
    const exports = mocks[name] || (name.startsWith('@/components/') ? { default: noop } : null);
    assert(exports, `Unexpected import: ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await pageModule.evaluate();
  return {
    requests, storage, drafts, browser, navigations,
    runRetry() { timers.shift()?.(); },
    login(token = 'signed-in') { authSession = { access_token: token }; },
    remount() { slots.forEach((slot) => slot?.cleanup?.()); slots = []; },
    restartEffects() { slots.filter((slot) => slot?.effect).forEach((slot) => { slot.cleanup?.(); slot.cleanup = slot.effect(); }); },
    render() {
      cursor = 0; effects = [];
      const tree = pageModule.namespace.default({ allowAnonymousSearch: true });
      const content = file.includes('/rezultat/') ? tree.props.children.type() : tree;
      effects.forEach((effect) => effect());
      return content;
    },
    async finish(data = result, status = 200) {
      requests.at(-1).resolve({ ok: status < 400, status, json: async () => data });
      await flush();
    },
  };
}

const pageFile = 'src/app/cadastru/rezultat/CadastruResultPage.js';
// An unverified building attempt is never presented as a verified suggestion.
for (const lang of ['ro', 'ru', 'en']) {
  for (const status of [404, 503, 400, 401, 429]) {
    const input = { city: 'Comrat', road_type: 'strada', street: 'Kotovski', house_number: '92', apartment_number: '22',
      lookup_id: crypto.randomUUID(), suggestion_recovery_token: 'stale-token', skip_cache: true };
    const page = await harness(pageFile, `/${lang}/cadastru/rezultat?source=address&lookup=1&skipcache=true`,
      { [addressKey]: JSON.stringify(input) }, lang);
    page.render();
    const failure = { error: status === 404 ? 'not_found' : status === 503 ? 'service_unavailable' : 'invalid_address_fields' };
    await page.finish(failure, status);
    let tree = page.render();
    const attemptButton = () => walk(tree).find(n => n.type === 'button' && 'data-cadastru-building-attempt' in n.props);
    if (status === 503) {
      assert(!attemptButton(), 'no optional action during automatic retry');
      page.runRetry(); page.render();
      await page.finish(failure, status); tree = page.render();
      assert(textOf(tree).includes(translations[lang]['cadastru.addressUnverifiedTitle']));
      assert(textOf(tree).includes(translations[lang]['cadastru.verifyAddress']));
      assert(!textOf(tree).includes(translations[lang]['cadastru.apartmentNoMatchDescription']));
    }
    if (![404, 503].includes(status)) { assert(!attemptButton()); continue; }
    assert(attemptButton());
    assert(!walk(tree).some(n => n.type === 'button' && 'data-cadastru-suggestion' in n.props));
    assert(!textOf(tree).includes(translations[lang]['cadastru.withoutApartmentAlternativeFound']));
    assert(textOf(tree).includes(translations[lang]['cadastru.tryWithoutApartmentDescription']));
    if (status === 404) assert(textOf(tree).includes(translations[lang]['cadastru.apartmentNoMatchDescription']));
    assert.equal(JSON.parse(page.storage.get(addressKey)).apartment_number, '22');
    attemptButton().props.onClick(); page.render();
    const body = page.requests.at(-1).body;
    for (const key of ['city', 'street', 'road_type', 'house_number', 'skip_cache']) assert.equal(body[key], input[key]);
    assert.equal(body.apartment_number, undefined);
    assert.equal(body.suggestion_recovery_token, undefined);
    assert.notEqual(body.lookup_id, input.lookup_id);
    assert(!new URL(page.browser.location.href).searchParams.has('apartment_number'));
    await page.finish({ error: 'not_found' }, 404); tree = page.render();
    assert(!attemptButton(), 'building-only failures cannot repeat the apartment-removal action');
  }
}
console.log('RO/RU/EN building attempts passed: distinct outage/no-match UX, explicit action, new identity, no recovery token and error exclusions.');

for (const lang of ['ro', 'ru', 'en']) {
  const input = { city: 'Comrat', road_type: 'strada', street: 'Kotovski', house_number: '92', apartment_number: '22' };
  const choice = { city: input.city, road_type: input.road_type, street: input.street, house_number: input.house_number };
  const page = await harness(pageFile, `/${lang}/cadastru/rezultat?source=address&lookup=1`,
    { [addressKey]: JSON.stringify(input) }, lang);
  page.render();
  await page.finish({ error: 'address_confirmation_required', address_suggestions: [choice], suggestion_recovery_token: 'verified-choice' }, 422);
  let tree = page.render();
  assert(textOf(tree).includes(translations[lang]['cadastru.withoutApartmentAlternativeFound']));
  assert(!walk(tree).some(n => n.props?.['data-cadastru-building-attempt'] !== undefined));
  const button = walk(tree).find(n => n.type === 'button' && 'data-cadastru-suggestion' in n.props);
  assert(button);
  button.props.onClick(); page.render();
  assert.equal(page.requests.at(-1).body.apartment_number, undefined);
  assert.equal(page.requests.at(-1).body.suggestion_recovery_token, 'verified-choice');
  await page.finish(result); tree = page.render();
  assert(!walk(tree).some(n => n.type === 'button' && ('data-cadastru-building-attempt' in n.props || 'data-cadastru-suggestion' in n.props)));
}
console.log('Verified alternatives retain their distinct copy, confirmation action and recovery tracking in RO/RU/EN.');
