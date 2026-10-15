// Isolated real component/effect and navigation checks; no network or live writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-auth-handoff.mjs
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
const address = { city: 'Chișinău', road_type: 'strada', street: 'Valea Trandafirilor', house_number: '11', search_context: 'cadastru' };
const number = '0100104.003.01';
const result = { lands: [{ cadastral_number: '0100104.003' }], request_address: 'Chișinău, str Valea Trandafirilor 11' };

async function harness(file, path, stored = {}) {
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
    react: { Suspense: noop, useState, useRef: (value) => useState(() => ({ current: value }))[0], useEffect },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/navigation': { useRouter: () => router, useSearchParams: () => new URL(browser.location.href).searchParams },
    '@/context/LanguageContext': { useTranslation: () => ({ lang: 'ro', t: (key) => key }) },
    '@/context/AuthContext': { useAuth: () => ({ isAuthenticated: Boolean(authSession), loading: false,
      session: authSession, clearAuthError: noop }) },
    '@/lib/validation': { matchCity: () => null, validateCadastralNumber: (value) => ({ valid: value === number }) },
    '@/lib/cadastru-favorites': { getCadastruFavoritePath: () => null, getSavedCadastruAddress: () => null },
    '@/lib/cadastru-valuation-handoff': { resolveValuationDistrict: () => null,
      buildFullAccessAddressResultParams: (data) => new URLSearchParams({ source: 'address', cadastral_number: data.cadastral_number }) },
    '@/lib/cadastru-municipal-reports': { municipalReportsAvailableForCadastru: () => false, validMunicipalReportsResult: () => false },
    '@/lib/cadastru-supported-cities': { CADASTRU_SUPPORTED_CITIES: ['Chișinău'] },
    './loading': { default: noop },
  };
  const context = vm.createContext({ URL, URLSearchParams, crypto, console, window: browser,
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
const page = await harness(pageFile, '/ro/cadastru/rezultat?source=address&lookup=1', { [addressKey]: JSON.stringify(address) });
page.render();
const id = page.requests[0].body.lookup_id;
assert.match(id, /^[0-9a-f-]{36}$/);
assert.equal(new URL(page.browser.location.href).searchParams.get('lookup_id'), id, 'legacy URLs acquire a durable ID');
assert.equal(page.browser.history.state.retained, true, 'Next history state survives');
page.restartEffects(); page.render();
assert.equal(page.requests.length, 1, 'overlapping effect restarts share a request');
await page.finish(); page.render();
assert.equal(page.requests.length, 1, 'loaded result does not refetch on rerender');
page.login(); page.render();
assert.equal(page.requests.length, 2, 'login still fetches authorized details');
assert.equal(page.requests[1].body.lookup_id, id, 'login retains the submitted search ID');
assert.equal(page.requests[1].options.headers.Authorization, 'Bearer signed-in');
await page.finish();
page.remount(); page.render();
assert.equal(page.requests.at(-1).body.lookup_id, id, 'completed remount retains the same event identity');
await page.finish();
page.login('refreshed-token'); page.render();
assert.equal(page.requests.length, 3, 'token refresh after loading does not repeat the lookup');
assert(page.storage.has(addressKey), 'address survives OAuth handoff');

// An explicit correction gets a new identity and its own durable result URL.
page.remount(); page.render();
await page.finish({ error: 'not_found', suggestions: ['Decebal'] }, 404);
const suggestion = walk(page.render()).find((node) => node.type === 'button' && node.props.className?.includes('border-sky-200'));
assert(suggestion, 'suggestion retry is available');
suggestion.props.onClick(); page.render();
const correctedId = page.requests.at(-1).body.lookup_id;
assert.notEqual(correctedId, id);
assert.equal(page.requests.at(-1).body.street, 'Decebal');
await page.finish({ ...result, cadastral_number: number }); page.render();
assert.equal(new URL(page.browser.location.href).searchParams.get('lookup_id'), correctedId, 'address-to-number navigation retains identity');
assert.equal(page.requests.at(-1).url, '/api/cadastral');
assert.equal(page.requests.at(-1).body.lookup_id, correctedId);
assert.equal(page.requests.at(-1).body.search_context, undefined, 'number detail handoff does not count a second search');
await page.finish({ cadastral_number: number });

const numberPage = await harness(pageFile, `/ro/cadastru/rezultat?source=number&cadastral_number=${number}`);
numberPage.render();
const numberId = numberPage.requests[0].body.lookup_id;
await numberPage.finish({ cadastral_number: number });
numberPage.login(); numberPage.render();
assert.equal(numberPage.requests.at(-1).body.lookup_id, numberId);
await numberPage.finish({ cadastral_number: number });
numberPage.remount(); numberPage.render();
assert.equal(numberPage.requests.at(-1).body.lookup_id, numberId);
await numberPage.finish({ cadastral_number: number });

// Real form handlers: two intentional submissions of identical input get new IDs.
const form = await harness('src/components/CadastruSearchForm.js', '/ro/cadastru');
const submit = (label) => walk(form.render()).find((node) => node.type === 'button' && node.props.children === label).props.onClick();
submit('cadastru.searchButton');
const first = new URL(form.browser.location.href).searchParams.get('lookup_id');
assert.equal(JSON.parse(form.storage.get(addressKey)).lookup_id, first);
form.remount(); submit('cadastru.searchButton');
assert.notEqual(new URL(form.browser.location.href).searchParams.get('lookup_id'), first);
form.remount(); submit('cadastru.numberSearchButton');
const numberFirst = new URL(form.browser.location.href).searchParams.get('lookup_id');
assert(!form.storage.has(addressKey), 'number submission clears stale address request');
form.remount(); submit('cadastru.numberSearchButton');
assert.notEqual(new URL(form.browser.location.href).searchParams.get('lookup_id'), numberFirst);
console.log('Search identity passed: real form submissions, OAuth reload, effect restarts, token refresh, remounts, explicit corrections and address-to-number handoff.');
