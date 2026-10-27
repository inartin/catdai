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
  const drafts = new Map();
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
    '@/components/usePaymentProvider': { default: () => 'maib' },
    '@/lib/maib/products.mjs': { maibProduct: key => ({ key, amount_mdl: 15 }) },
    '@/lib/payment-urls.mjs': { featureCheckoutUrl: () => '/payment/checkout' },
    '@/lib/cadastru-map': { cadastruMapLocation: () => null },
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
    setTimeout: () => 1, clearTimeout: noop,
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
assert(textOf(buildingTree).includes('Str. Kiev 6/1, Chișinău'));
assert(textOf(buildingTree).includes('Nu am putut localiza exact imobilul de pe Киев, nr. 6.'));
const choices = walk(buildingTree).filter((node) => node.type === 'button' && 'data-cadastru-suggestion' in node.props);
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
assert(!walk(buildingTree).some((node) => node.type === 'button' && 'data-cadastru-suggestion' in node.props), 'failed retry clears stale choices');
console.log('Building result page passed: explanatory copy, validated suffix choices, explicit retry, preserved skip-cache and cleared stale choices.');

const russianPage = await harness(pageFile, '/ru/cadastru/rezultat?source=address&lookup=1', { [addressKey]: JSON.stringify(kievInput) }, 'ru');
russianPage.render();
await russianPage.finish({ error: 'address_confirmation_required', address_suggestions: [
  { city: 'Chișinău', road_type: 'strada', street: 'Kiev', house_number: '6/2' },
] }, 422);
const russianText = textOf(russianPage.render());
assert(russianText.includes('Не удалось точно определить местоположение дома 6 на улице Киев.'));
assert(russianText.includes('Ул. Kiev 6/2, Chișinău'));
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
  const localityButtons = walk(localityTree).filter((node) => node.type === 'button' && 'data-cadastru-suggestion' in node.props);
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
  assert(!walk(localityPage.render()).some((node) => node.type === 'button' && 'data-cadastru-suggestion' in node.props));
}
console.log('RO/RU locality confirmation passed: full addresses, distinct city choices, exact house, explicit city retry, skip-cache, recovery and stale-choice cleanup.');


// An unconfirmed unit can offer the same verified address without changing it before selection.
for (const lang of ['ro', 'ru']) {
  const input = { city: 'Chișinău', road_type: 'strada', street: 'Maria Tănase', house_number: '15', apartment_number: '2', skip_cache: true };
  const choice = { city: input.city, road_type: input.road_type, street: input.street, house_number: input.house_number };
  const page = await harness(pageFile, `/${lang}/cadastru/rezultat?source=address&lookup=1&city=Chișinău&road_type=strada&street=Maria+Tănase&house_number=15&apartment_number=2&skipcache=true`,
    { [addressKey]: JSON.stringify(input) }, lang);
  page.render();
  await page.finish({ error: 'address_confirmation_required', suggestion_recovery_token: 'without-unit-recovery', address_suggestions: [
    choice, { ...choice, city: 'Bălți' }, { ...choice, road_type: 'bulevard' },
    { ...choice, house_number: '15/1' }, { ...choice, apartment_number: '3' },
  ] }, 422);
  const tree = page.render();
  const buttons = walk(tree).filter(node => node.type === 'button' && 'data-cadastru-suggestion' in node.props);
  assert.equal(buttons.length, 1, 'removing a unit cannot also change city, road type or house');
  assert(textOf(tree).includes(lang === 'ro' ? 'Apartamentul 2 nu a fost identificat' : 'Квартира 2 не найдена'));
  assert(textOf(tree).includes(translations[lang]['cadastru.withoutApartmentAlternativeFound']));
  assert.equal(textOf(buttons[0]).trim(), translations[lang]['cadastru.searchWithoutApartment']);
  assert(textOf(tree).includes(translations[lang]['cadastru.apartmentNotConfirmedNote']));
  assert(textOf(tree).includes('Maria Tănase 15, Chișinău'));
  assert(!textOf(tree).includes('undefined') && !textOf(tree).includes('{apartment}'));
  assert.equal(page.requests.length, 1, 'no retry or secondary request before choosing');
  assert.equal(JSON.parse(page.storage.get(addressKey)).apartment_number, '2');
  assert.equal(new URL(page.browser.location.href).searchParams.get('apartment_number'), '2');
  buttons[0].props.onClick(); page.render();
  const retry = page.requests.at(-1).body;
  for (const key of ['city', 'road_type', 'street', 'house_number']) assert.equal(retry[key], input[key]);
  assert.equal(retry.apartment_number, undefined);
  assert.equal(retry.skip_cache, true);
  assert.equal(retry.suggestion_recovery_token, 'without-unit-recovery');
  assert.equal(JSON.parse(page.storage.get(addressKey)).apartment_number, undefined);
  assert.equal(new URL(page.browser.location.href).searchParams.has('apartment_number'), false);
  await page.finish({ lands: [{ cadastral_number: '0100517.170' }], buildings: [{ cadastral_number: '0100517.170.01' }],
    request_address: 'Chișinău, str Maria Tănase 15' });
  assert(!walk(page.render()).some(node => node.type === 'button' && 'data-cadastru-suggestion' in node.props));
}
console.log('RO/RU unconfirmed-unit confirmation passed: exact address, explicit apartment removal, request/storage/URL consistency, skip-cache, recovery and successful house/land result.');

// Each suggestion context retains its meaning and waits for an explicit choice.
for (const lang of ['ro', 'ru']) {
  const input = { city: 'Chișinău', road_type: 'strada', street: 'Eminescu', house_number: '10/6', apartment_number: '3', skip_cache: true };
  for (const [status, failure, titleKey, noteKey] of [
    [404, { error: 'not_found', suggestions: ['Mihai Eminescu'] }, 'cadastru.addressNotIdentified', 'cadastru.didYouMean'],
    [422, { error: 'ambiguous_street', suggestions: ['Mihai Eminescu', 'Mihail Kogălniceanu'] }, 'cadastru.confirmStreet', 'cadastru.chooseStreet'],
    [404, { error: 'not_found', road_type_suggestions: [{ road_type: 'bulevard', street: 'Eminescu' }] }, 'cadastru.addressNotIdentified', 'cadastru.didYouMeanRoadType'],
    [503, { error: 'service_unavailable', road_type_suggestions: [{ road_type: 'bulevard', street: 'Eminescu' }] }, 'cadastru.confirmStreet', 'cadastru.didYouMeanRoadType'],
  ]) {
    const page = await harness(pageFile, `/${lang}/cadastru/rezultat?source=address&lookup=1&skipcache=true`,
      { [addressKey]: JSON.stringify(input) }, lang);
    page.render();
    await page.finish(failure, status);
    const tree = page.render();
    assert(textOf(tree).includes(translations[lang][titleKey]));
    assert(textOf(tree).includes(translations[lang][noteKey]));
    const buttons = walk(tree).filter(node => node.type === 'button' && 'data-cadastru-suggestion' in node.props);
    assert.equal(buttons.length, failure.suggestions?.length || 1);
    assert.equal(page.requests.length, 1);
    buttons[0].props.onClick(); page.render();
    const retry = page.requests.at(-1).body;
    assert.equal(retry.city, input.city);
    assert.equal(retry.house_number, input.house_number);
    assert.equal(retry.apartment_number, input.apartment_number);
    assert.equal(retry.skip_cache, true);
    assert.equal(retry.street, failure.suggestions?.[0] || input.street);
    assert.equal(retry.road_type, failure.road_type_suggestions?.[0].road_type || input.road_type);
    await page.finish({ error: 'not_found' }, 404);
    assert(!walk(page.render()).some(node => node.type === 'button' && 'data-cadastru-suggestion' in node.props));
  }
  const editPage = await harness(pageFile, `/${lang}/cadastru/rezultat?source=address&lookup=1&skipcache=true`,
    { [addressKey]: JSON.stringify(input) }, lang);
  editPage.render();
  await editPage.finish({ error: 'not_found', suggestions: ['Mihai Eminescu'] }, 404);
  const editButton = walk(editPage.render()).find(node => node.type === 'button' && textOf(node) === translations[lang]['cadastru.modifyAddress']);
  editButton.props.onClick();
  assert.equal(editPage.requests.length, 1, 'editing does not accept a suggestion or retry the lookup');
  assert.equal(editPage.navigations.at(-1), `/${lang}/cadastru?skipcache=true`);
  assert.deepEqual(JSON.parse(editPage.drafts.get('catdai:cadastru-search-draft:v1')).addressForm,
    { city: input.city, roadType: input.road_type, street: input.street, houseNumber: input.house_number, apartmentNumber: input.apartment_number });
}
console.log('RO/RU suggestion cards passed: street names, ambiguity, road types, unavailable provider, explicit retries and editing the filled address.');

// Public and admin inputs retain Latin letters; public navigation retains the exact house.
for (const file of ['src/components/CadastruSearchForm.js', 'src/components/admin/AdminCadastruOfflineSearch.js']) {
  const form = await harness(file, '/ro/cadastru');
  let tree = form.render();
  if (file.includes('/admin/')) {
    walk(tree).find(node => node.type === 'button' && node.props['aria-expanded'] === false).props.onClick();
  }
  const field = length => walk(form.render()).find(node => node.type === 'input' && node.props.maxLength === length);
  assert.equal(field(10).props.inputMode, 'text', 'letter suffixes need the text keyboard');
  for (const [input, expected] of [['22 /d', '22/D'], ['22/1', '22/1'], ['22', '22']]) {
    field(10).props.onChange({ target: { value: input } });
    assert.equal(field(10).props.value, expected);
    assert(new RegExp(`^(?:${field(10).props.pattern})$`).test(expected));
  }
  assert(!new RegExp(`^(?:${field(10).props.pattern})$`).test('22/DD'));
  field(80).props.onChange({ target: { value: 'Nuferilor' } });
  field(10).props.onChange({ target: { value: '22/d' } });
  tree = form.render();
  const button = walk(tree).find(node => node.type === 'button' && node.props.children ===
    (file.includes('/admin/') ? 'Caută adresă (offline)' : translations.ro['cadastru.searchButton']));
  button.props.onClick();
  if (file.includes('/admin/')) {
    assert.equal(form.requests.at(-1).body.house_number, '22/D');
    await form.finish({ error: 'not_found' }, 404);
  } else {
    const url = new URL(form.navigations.at(-1), 'https://catdai.md');
    assert.equal(url.searchParams.get('house_number'), '22/D');
    assert.equal(JSON.parse(form.storage.get(addressKey)).house_number, '22/D');
  }
}
for (const lang of ['ro', 'ru']) {
  const input = { city: 'Chișinău', road_type: 'strada', street: 'Nuferilor 22 /D', house_number: '22' };
  const page = await harness(pageFile, `/${lang}/cadastru/rezultat?source=address&lookup=1`, { [addressKey]: JSON.stringify(input) }, lang);
  page.render();
  await page.finish({ error: 'address_fields_conflict', embedded_house_number: '22/D', house_number: '22', corrections: [
    { street: 'Nuferilor', house_number: '22/D' }, { street: 'Nuferilor', house_number: '22' },
  ] }, 422);
  const buttons = walk(page.render()).filter(node => node.type === 'button' && 'data-cadastru-suggestion' in node.props);
  assert.equal(buttons.length, 2);
  assert(textOf(buttons[0]).includes('22/D'));
  buttons[0].props.onClick(); page.render();
  assert.equal(page.requests.at(-1).body.house_number, '22/D');
  assert.equal(page.requests.at(-1).body.street, 'Nuferilor');
  await page.finish({ error: 'not_found' }, 404);
}
console.log('Letter suffix UI checks passed: public/admin typing, keyboard, navigation and RO/RU correction retry.');
