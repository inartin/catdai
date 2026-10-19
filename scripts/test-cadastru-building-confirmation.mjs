// Isolated real component/effect and navigation checks; no network or live writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-building-confirmation.mjs
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

const translations = Object.fromEntries(await Promise.all(['ro', 'ru'].map(async (lang) =>
  [lang, JSON.parse(await fs.readFile(`src/locales/${lang}.json`, 'utf8'))])));
const textOf = (node) => Array.isArray(node) ? node.map(textOf).join(' ')
  : node && typeof node === 'object' ? textOf(node.props?.children) : String(node ?? '');
async function harness(file, path, stored = {}, lang = 'ro') {
  let slots = [], cursor = 0, effects = [], authSession = null;
  const storage = new Map(Object.entries(stored));
  const requests = [], navigations = [];
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
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    sessionStorage: { getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
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
    requests, storage, browser, navigations,
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

const pageFile = 'src/app/cadastru/rezultat/page.js';
// Building confirmations keep the input unchanged until an explicit suffix choice.
const kievInput = { city: 'Chișinău', road_type: 'strada', street: 'Киев', house_number: '6', skip_cache: true };
const buildingPage = await harness(pageFile, '/ro/cadastru/rezultat?source=address&lookup=1&skipcache=true', { [addressKey]: JSON.stringify(kievInput) });
buildingPage.render();
await buildingPage.finish({ error: 'address_confirmation_required', suggestion_recovery_token: 'signed-choice', address_suggestions: [
  { city: 'Chișinău', road_type: 'strada', street: 'Kiev', house_number: '6/1' },
  { city: 'Bălți', road_type: 'strada', street: 'Kiev', house_number: '6/2' },
  { city: 'Chișinău', road_type: 'strada', street: 'Kiev', house_number: '16/1' },
  { city: 'Chișinău', road_type: 'strada', street: 'Kiev', house_number: '6/2', apartment_number: '7' },
] }, 422);
let buildingTree = buildingPage.render();
assert(textOf(buildingTree).includes('Am găsit imobilul de pe Kiev, nr. 6/1.'));
assert(textOf(buildingTree).includes('Nu am putut localiza exact imobilul de pe Киев, nr. 6.'));
const choices = walk(buildingTree).filter((node) => node.type === 'button' && node.props.className?.includes('border-sky-200'));
assert.equal(choices.length, 1, 'only valid house choices without an apartment are shown');
assert.equal(buildingPage.requests.length, 1, 'no secondary requests before choosing a building');
assert.equal(JSON.parse(buildingPage.storage.get(addressKey)).house_number, '6');
choices[0].props.onClick(); buildingPage.render();
assert.equal(buildingPage.requests.at(-1).body.street, 'Kiev');
assert.equal(buildingPage.requests.at(-1).body.house_number, '6/1');
assert.equal(buildingPage.requests.at(-1).body.apartment_number, undefined);
assert.equal(buildingPage.requests.at(-1).body.skip_cache, true);
assert.equal(buildingPage.requests.at(-1).body.suggestion_recovery_token, 'signed-choice');
await buildingPage.finish({ error: 'not_found' }, 404);
buildingTree = buildingPage.render();
assert(textOf(buildingTree).includes('Fără locația exactă nu putem căuta informațiile despre zonă.'));
assert(!walk(buildingTree).some((node) => node.type === 'button' && node.props.className?.includes('border-sky-200')), 'failed retry clears stale choices');
console.log('Building result page passed: explanatory copy, validated suffix choices, explicit retry, preserved skip-cache and cleared stale choices.');

const russianPage = await harness(pageFile, '/ru/cadastru/rezultat?source=address&lookup=1', { [addressKey]: JSON.stringify(kievInput) }, 'ru');
russianPage.render();
await russianPage.finish({ error: 'address_confirmation_required', address_suggestions: [
  { city: 'Chișinău', road_type: 'strada', street: 'Kiev', house_number: '6/2' },
] }, 422);
const russianText = textOf(russianPage.render());
assert(russianText.includes('Не удалось точно определить местоположение дома 6 на улице Киев.'));
assert(russianText.includes('Найден дом 6/2 на улице Kiev.'));
assert(!russianText.includes('undefined') && !russianText.includes('{house}'));
console.log('RO/RU building confirmation translations passed.');

// Locality corrections retain the complete address until the user explicitly selects a city.
for (const lang of ['ro', 'ru']) {
  const input = { city: 'Chișinău', road_type: 'strada', street: 'Cartușa', house_number: '95/4', skip_cache: true };
  const singlePage = await harness(pageFile, `/${lang}/cadastru/rezultat?source=address&lookup=1`,
    { [addressKey]: JSON.stringify(input) }, lang);
  singlePage.render();
  await singlePage.finish({ error: 'address_confirmation_required', address_suggestions: [{ ...input, city: 'Durlești' }] }, 422);
  const singleText = textOf(singlePage.render());
  assert(singleText.includes(lang === 'ro' ? 'Am găsit aceeași adresă în Durlești.' : 'Такой же адрес найден в Durlești.'));
  assert(singleText.includes(lang === 'ro' ? 'Este aceasta adresa dorită?' : 'Это нужный вам адрес?'));
  assert(!singleText.includes(lang === 'ro' ? 'Am găsit imobilul de pe' : 'Найден дом'));
  assert(!singleText.includes('{localities}'));
  const localityPage = await harness(pageFile, `/${lang}/cadastru/rezultat?source=address&lookup=1&skipcache=true`,
    { [addressKey]: JSON.stringify(input) }, lang);
  localityPage.render();
  await localityPage.finish({ error: 'address_confirmation_required', suggestion_recovery_token: 'locality-recovery', address_suggestions: [
    { ...input, city: 'Durlești' }, { ...input, city: 'Codru' },
    { ...input, city: 'Unknown' }, { ...input, city: 'Durlești', house_number: '95/5' },
    { ...input, city: 'Durlești', road_type: 'bulevard' }, { ...input, city: 'Durlești', apartment_number: '7' },
  ] }, 422);
  const localityTree = localityPage.render();
  const localityButtons = walk(localityTree).filter((node) => node.type === 'button' && node.props.className?.includes('border-sky-200'));
  assert.equal(localityButtons.length, 2);
  assert(textOf(localityTree).includes(lang === 'ro' ? 'Am găsit aceeași adresă în Durlești, Codru.' : 'Такой же адрес найден в Durlești, Codru.'));
  assert(textOf(localityButtons[0]).includes('Durlești, Cartușa 95/4'));
  assert(textOf(localityButtons[1]).includes('Codru, Cartușa 95/4'));
  assert.equal(localityPage.requests.length, 1, 'no speculative retry or secondary data before selection');
  assert.equal(JSON.parse(localityPage.storage.get(addressKey)).city, 'Chișinău');
  localityButtons[0].props.onClick(); localityPage.render();
  assert.equal(localityPage.requests.at(-1).body.city, 'Durlești');
  assert.equal(localityPage.requests.at(-1).body.street, 'Cartușa');
  assert.equal(localityPage.requests.at(-1).body.house_number, '95/4');
  assert.equal(localityPage.requests.at(-1).body.skip_cache, true);
  assert.equal(localityPage.requests.at(-1).body.suggestion_recovery_token, 'locality-recovery');
  await localityPage.finish({ error: 'not_found' }, 404);
  assert(!walk(localityPage.render()).some((node) => node.type === 'button' && node.props.className?.includes('border-sky-200')));
}
console.log('RO/RU locality confirmation passed: full addresses, distinct city choices, exact house, explicit city retry, skip-cache, recovery and stale-choice cleanup.');
