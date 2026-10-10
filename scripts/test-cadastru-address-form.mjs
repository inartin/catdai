// Isolated form handlers and rendered correction choices; no browser, server or network.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-address-form.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const source = await fs.readFile('src/components/CadastruSearchForm.js', 'utf8');
const { code } = await transform(source, {
  filename: 'CadastruSearchForm.js',
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
  module: { type: 'es6' },
});
const conflict = { error: 'address_fields_conflict', embedded_house_number: '47/2', house_number: '47',
  corrections: [{ street: 'Dacia', house_number: '47/2' }, { street: 'Dacia', house_number: '47' }] };
for (const lang of ['ro', 'ru']) {
  const translations = JSON.parse(await fs.readFile(`src/locales/${lang}.json`, 'utf8'));
  const t = (key, vars = {}) => Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), translations[key] || key);
  const slots = [], bodies = [], navigations = [];
  let cursor = 0, responder = async () => Response.json(conflict, { status: 422 });
  const useState = (initial) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
    return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
  };
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    react: { useState, useEffect: () => {}, useRef: (value) => useState(() => ({ current: value }))[0] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { useRouter: () => ({ push: (url) => navigations.push(url) }), useSearchParams: () => new URLSearchParams('skipcache=true') },
    '@/components/AuthRequiredModal': { default: () => null },
    '@/components/CadastralQuickSearchCard': { default: () => null },
    '@/context/LanguageContext': { useTranslation: () => ({ lang, t }) },
    '@/context/AuthContext': { useAuth: () => ({ isAuthenticated: true, loading: false, clearAuthError: () => {} }) },
    '@/lib/validation': { validateCadastralNumber: () => true },
    '@/lib/cadastru-valuation-handoff': { buildFullAccessAddressResultParams: () => new URLSearchParams({ source: 'address', skipcache: 'true' }) },
    '@/lib/cadastru-supported-cities': { CADASTRU_SUPPORTED_CITIES: ['Chișinău', 'Bălți'] },
  };
  const context = vm.createContext({ URLSearchParams, console,
    fetch: async (_url, options) => { bodies.push(JSON.parse(options.body)); return responder(); } });
  const formModule = new vm.SourceTextModule(code, { context });
  await formModule.link((name) => {
    assert(mocks[name], `Unexpected import: ${name}`);
    const exports = mocks[name];
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await formModule.evaluate();
  const render = () => { cursor = 0; return formModule.namespace.default({ quickSearchPlacement: 'top' }); };
  const walk = (node) => Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object'
    ? [node, ...walk(node.props?.children)] : [];
  const field = (length) => walk(render()).find((node) => node.type === 'input' && node.props.maxLength === length);
  const change = (length, value) => field(length).props.onChange({ target: { value } });
  const search = () => walk(render()).find((node) => node.type === 'button' && node.props.children === t('cadastru.searchButton')).props.onClick();
  const choices = () => walk(render()).filter((node) => node.type === 'button' && typeof node.props.children === 'string' && node.props.children.includes('Dacia'));
  walk(render()).find((node) => node.type === 'select' && node.props.value === 'strada').props.onChange({ target: { value: 'bulevard' } });
  change(80, 'DACIA BD. 47/2'); change(10, '47'); change(4, '16');
  for (const house of ['47/2', '47']) {
    responder = async () => Response.json(conflict, { status: 422 });
    change(80, 'DACIA BD. 47/2'); change(10, '47');
    await search();
    assert.equal(choices().length, 2, `${lang}: show both house choices`);
    assert(walk(render()).some((node) => node.type === 'p' && node.props.children === t('cadastru.addressFieldsConflict', { embedded: '47/2', house: '47' })));
    responder = async () => Response.json({ cadastral_number: '0100111.083.01.016' });
    const choice = choices().find((node) => node.props.children === t('cadastru.useAddressCorrection', { street: 'Dacia', house }));
    await choice.props.onClick();
    assert.deepEqual(bodies.at(-1), { city: 'Chișinău', road_type: 'bulevard', street: 'Dacia', house_number: house,
      apartment_number: '16', search_context: 'cadastru', skip_cache: true });
    assert.equal(field(80).props.value, 'Dacia'); assert.equal(field(10).props.value, house); assert.equal(field(4).props.value, '16');
    assert(navigations.at(-1).includes('skipcache=true'));
  }
  responder = async () => Response.json(conflict, { status: 422 });
  change(80, 'DACIA BD. 47/2'); change(10, '47'); await search();
  change(4, '17'); assert.equal(choices().length, 0, 'edits clear stale correction choices');
  let finish;
  responder = () => new Promise((resolve) => { finish = resolve; });
  const pending = search();
  change(10, '48'); finish(Response.json(conflict, { status: 422 })); await pending;
  assert.equal(choices().length, 0, 'late responses cannot restore stale choices');
  assert.equal(field(10).props.value, '48');

  change(80, 'Miron costin'); change(10, '114'); change(4, '24');
  responder = async () => Response.json({ error: 'service_unavailable',
    road_type_suggestions: [{ road_type: 'strada', street: 'Miron Costin' }] }, { status: 503 });
  const callsBeforeSuggestion = bodies.length;
  await search();
  assert.equal(bodies.length, callsBeforeSuggestion + 1, 'a road-type suggestion does not retry automatically');
  const roadChoice = walk(render()).find((node) => node.type === 'button' &&
    node.props.children === t('cadastru.useRoadTypeSuggestion', { road: t('cadastru.roadTypeStreet'), street: 'Miron Costin' }));
  assert(roadChoice, `${lang}: show the corrected road type after a timeout`);
  responder = async () => Response.json({ cadastral_number: '0100101.089.01.024' });
  await roadChoice.props.onClick();
  assert.deepEqual(bodies.at(-1), { city: 'Chișinău', road_type: 'strada', street: 'Miron Costin',
    house_number: '114', apartment_number: '24', search_context: 'cadastru', skip_cache: true });
  assert.equal(field(80).props.value, 'Miron Costin');
  assert(walk(render()).some((node) => node.type === 'select' && node.props.value === 'strada'));

  change(80, 'Ion Creangă'); change(10, '82'); change(4, '167');
  const alternative = { city: 'Chișinău', road_type: 'strada', street: 'Ion Creangă', house_number: '82/1', apartment_number: '167' };
  const confirmation = { error: 'address_confirmation_required', address_suggestions: [alternative] };
  responder = async () => Response.json(confirmation, { status: 422 });
  const beforeConfirmation = bodies.length;
  const beforeNavigation = navigations.length;
  await search();
  assert.equal(bodies.length, beforeConfirmation + 1, 'no automatic search of a house variant');
  assert.equal(navigations.length, beforeNavigation, 'no result before confirmation');
  assert.equal(field(10).props.value, '82', 'the requested house stays unchanged');
  assert(walk(render()).some((node) => node.type === 'p' && node.props.children ===
    t('cadastru.addressAlternativeIntro', { street: 'Ion Creangă', house: '82', apartment: '167' })));
  assert(walk(render()).some((node) => node.type === 'p' && node.props.children ===
    t('cadastru.addressAlternativeFound', { street: 'Ion Creangă', house: '82/1', apartment: '167' })));
  const confirmationChoice = () => walk(render()).find((node) => node.type === 'button' &&
    node.props.children === t('cadastru.searchSuggestedHouse', { house: '82/1' }));
  responder = async () => Response.json({ cadastral_number: '0100511.115.01.167' });
  await confirmationChoice().props.onClick();
  assert.deepEqual(bodies.at(-1), { city: 'Chișinău', road_type: 'strada', street: 'Ion Creangă', house_number: '82/1',
    apartment_number: '167', search_context: 'cadastru', skip_cache: true });
  assert.equal(field(10).props.value, '82/1');

  change(10, '82');
  responder = async () => Response.json(confirmation, { status: 422 });
  await search();
  change(4, '168');
  assert.equal(confirmationChoice(), undefined, 'field edits clear registry suggestions');
  change(4, '167');
  responder = () => new Promise((resolve) => { finish = resolve; });
  const lateConfirmation = search();
  change(10, '83'); finish(Response.json(confirmation, { status: 422 })); await lateConfirmation;
  assert.equal(confirmationChoice(), undefined, 'late registry suggestions stay discarded');
  assert.equal(field(10).props.value, '83');
}
console.log('Address form regressions passed: RO/RU choices, explicit road-type retry, retained fields/skip-cache, edit invalidation and stale responses.');
