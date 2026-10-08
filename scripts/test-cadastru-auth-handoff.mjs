// pnpm exec node --experimental-vm-modules scripts/test-cadastru-auth-handoff.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const source = await fs.readFile('src/app/cadastru/rezultat/page.js', 'utf8');
const { code } = await transform(source, {
  filename: 'page.js',
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
  module: { type: 'es6' },
});

const storage = new Map([
  ['catdai:cadastru-address-lookup-request:v1', JSON.stringify({
    city: 'Chișinău', road_type: 'strada', street: 'Decebal', house_number: '63',
    apartment_number: '1', search_context: 'cadastru',
  })],
  ['catdai:cadastru-address-result-preview:v1', JSON.stringify({
    cadastral_number: '0100201.999.01.0101', locked_sections: { cadastru_details: true },
  })],
]);
const sessionStorage = {
  getItem: (key) => storage.get(key) ?? null,
  removeItem: (key) => storage.delete(key),
};
let slots = [];
let effects = [];
let cursor = 0;
let fetchCount = 0;
let finishFetch;
const useState = (initial) => {
  const index = cursor++;
  if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
  return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
};
const jsx = (type, props) => ({ type, props });
const noopComponent = () => null;
const mocks = {
  react: { Suspense: noopComponent, useState, useRef: (value) => useState(() => ({ current: value }))[0],
    useEffect: (effect) => { effects.push(effect); } },
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'next/navigation': { useRouter: () => ({ push: () => {} }),
    useSearchParams: () => new URLSearchParams('source=address&preview=1') },
  '@/context/LanguageContext': { useTranslation: () => ({ lang: 'ro', t: (key) => key }) },
  '@/context/AuthContext': { useAuth: () => ({ isAuthenticated: true, loading: false,
    session: { access_token: 'token' }, clearAuthError: () => {} }) },
  '@/lib/validation': { matchCity: () => null, validateCadastralNumber: () => ({ valid: false }) },
  '@/lib/cadastru-favorites': { getCadastruFavoritePath: () => null, getSavedCadastruAddress: () => null },
  '@/lib/cadastru-valuation-handoff': { resolveValuationDistrict: () => null },
};
for (const name of ['Navbar', 'Footer', 'BackButton', 'CadastralDataCard', 'CadastruFavoriteButton',
  'AuthRequiredModal', 'FeaturePricingAction']) {
  mocks[`@/components/${name}`] = { default: noopComponent };
}

const context = vm.createContext({ URL, URLSearchParams, window: {}, sessionStorage,
  localStorage: { removeItem: () => {} }, console,
  fetch: () => {
    fetchCount += 1;
    return new Promise((resolve) => { finishFetch = resolve; });
  } });
const pageModule = new vm.SourceTextModule(code, { context });
await pageModule.link((name) => {
  assert(mocks[name], `Unexpected import: ${name}`);
  const exports = mocks[name];
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
});
await pageModule.evaluate();

function render() {
  cursor = 0;
  effects = [];
  // The exported page wraps the content in Suspense, so invoke its child function.
  const page = pageModule.namespace.default();
  page.props.children.type();
  return effects;
}
const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

let currentEffects = render();
const cleanup = currentEffects[1]();
assert.equal(fetchCount, 1, 'authenticated preview starts one address lookup');
cleanup();
currentEffects[1]();
assert.equal(fetchCount, 1, 'effect restart reuses the in-flight lookup');
finishFetch({ ok: true, json: async () => ({ cadastral_number: '0100111.083.01.016' }) });
await flush();
assert(slots.some((slot) => slot?.data?.cadastral_number === '0100111.083.01.016' && !slot.error));
assert(storage.has('catdai:cadastru-address-lookup-request:v1'), 'result keeps its address handoff');

slots = [];
currentEffects = render();
currentEffects[1]();
assert.equal(fetchCount, 2, 'a remount can reload the same saved address');
finishFetch({ ok: true, json: async () => ({ cadastral_number: '0100111.083.01.016' }) });
await flush();
assert(slots.some((slot) => slot?.data?.cadastral_number === '0100111.083.01.016' && !slot.error));
console.log('Cadastru login handoff preserves the address and dedupes overlapping lookups.');
