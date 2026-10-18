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
const t = (key) => key;
const walk = (node) => Array.isArray(node) ? node.flatMap(walk)
  : node && typeof node === 'object' ? [node, ...walk(node.props?.children)] : [];
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const addressKey = 'catdai:cadastru-address-lookup-request:v1';
const address = { city: 'Chișinău', road_type: 'strada', street: 'Valea Trandafirilor', house_number: '11', search_context: 'cadastru' };
const number = '0100104.003.01';
const result = { lands: [{ cadastral_number: '0100104.003' }], request_address: 'Chișinău, str Valea Trandafirilor 11' };

async function harness(file, path, stored = {}) {
  let slots = [], cursor = 0, effects = [], authSession = null, clearAuthError = noop;
  const storage = new Map(Object.entries(stored));
  const requests = [], navigations = [];
  const timers = new Map();
  let nextTimer = 0;
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
    '@/context/LanguageContext': { useTranslation: () => ({ lang: 'ro', t }) },
    '@/context/AuthContext': { useAuth: () => ({ isAuthenticated: Boolean(authSession), loading: false,
      session: authSession, clearAuthError }) },
    '@/lib/validation': { matchCity: () => null, validateCadastralNumber: (value) => ({ valid: value === number }) },
    '@/lib/cadastru-favorites': { getCadastruFavoritePath: () => null, getSavedCadastruAddress: () => null },
    '@/lib/cadastru-valuation-handoff': { resolveValuationDistrict: () => null,
      buildFullAccessAddressResultParams: (data) => new URLSearchParams({ source: 'address', cadastral_number: data.cadastral_number }) },
    '@/lib/cadastru-municipal-reports': { municipalReportsAvailableForCadastru: () => false, validMunicipalReportsResult: () => false },
    '@/lib/cadastru-supported-cities': { CADASTRU_SUPPORTED_CITIES: ['Chișinău'] },
    './loading': { default: noop },
  };
  const context = vm.createContext({ URL, URLSearchParams, crypto, console, AbortController,
    navigator: { userAgent: '', platform: '', maxTouchPoints: 0 }, window: browser,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    sessionStorage: { getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, body: JSON.parse(options.body), options, resolve, reject })),
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
    requests, storage, browser, navigations, navigate, timers,
    runRetryTimer() {
      assert.equal(timers.size, 1, 'exactly one retry is scheduled');
      const [id, timer] = [...timers][0];
      assert.equal(timer.delay, 2000, 'retry waits two seconds');
      timers.delete(id); timer.callback();
    },
    unmount() { slots.forEach((slot) => slot?.cleanup?.()); },
    login(token = 'signed-in', userId = 'user-1') { authSession = { access_token: token, user: { id: userId } }; },
    notifyAuth() { authSession = authSession && { ...authSession }; clearAuthError = () => null; },
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
    async failNetwork() { requests.at(-1).reject(new TypeError('Failed to fetch')); await flush(); },
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

// A completed failure belongs to this search, including after auth notifications.
for (const type of ['number', 'address']) {
  const lookupId = crypto.randomUUID();
  const path = type === 'number'
    ? `/ro/cadastru/rezultat?source=number&cadastral_number=${number}&lookup_id=${lookupId}`
    : `/ro/cadastru/rezultat?source=address&lookup=1&lookup_id=${lookupId}`;
  const stored = type === 'address' ? { [addressKey]: JSON.stringify({ ...address, lookup_id: lookupId }) } : {};
  const failed = await harness(pageFile, path, stored);
  failed.login(); failed.render();
  await failed.finish({ error: 'service_unavailable' }, 503);
  failed.notifyAuth(); failed.render();
  assert.equal(failed.requests.length, 1, `${type}: auth notification does not retry a failed lookup`);
  failed.login('refreshed'); failed.render();
  assert.equal(failed.requests.length, 1, `${type}: token refresh does not retry a failed lookup`);

  // A deliberate new submission still runs, and token refresh shares pending work.
  failed.navigate(path.replace(lookupId, crypto.randomUUID()));
  if (type === 'address') failed.storage.set(addressKey, JSON.stringify({ ...address,
    lookup_id: new URL(failed.browser.location.href).searchParams.get('lookup_id') }));
  failed.render();
  assert.equal(failed.requests.length, 2, `${type}: new search ID starts a lookup`);
  failed.login('refreshed-during-request'); failed.render();
  assert.equal(failed.requests.length, 2, `${type}: token refresh shares an in-flight lookup`);
  await failed.failNetwork();
  failed.notifyAuth(); failed.render();
  assert.equal(failed.requests.length, 2, `${type}: network errors do not retry on auth notifications`);
  failed.login('different-user', 'user-2'); failed.render();
  assert.equal(failed.requests.length, 3, `${type}: switching authenticated users fetches their result`);
  await failed.finish({ error: 'service_unavailable' }, 503);

  const anonymous = await harness(pageFile, path, stored);
  anonymous.render();
  await anonymous.finish({ error: 'service_unavailable' }, 503);
  anonymous.login(); anonymous.render();
  assert.equal(anonymous.requests.length, 2, `${type}: login after an anonymous failure still fetches authorized data`);
  await anonymous.finish();
}

// Recovery is deliberate and bounded, and success must reach the displayed card.
for (const type of ['number', 'address']) {
  const lookupId = crypto.randomUUID();
  const path = type === 'number'
    ? `/ro/cadastru/rezultat?source=number&cadastral_number=${number}&lookup_id=${lookupId}`
    : `/ro/cadastru/rezultat?source=address&lookup=1&lookup_id=${lookupId}`;
  const stored = type === 'address' ? { [addressKey]: JSON.stringify({ ...address, lookup_id: lookupId }) } : {};
  const success = type === 'number' ? { cadastral_number: number } : result;
  const recover = await harness(pageFile, path, stored);
  recover.login(); recover.render();
  await recover.finish({ error: 'service_unavailable' }, 503);
  let tree = recover.render();
  assert(walk(tree).some((node) => node.props?.children === 'cadastru.retrying'), `${type}: retrying is visible`);
  recover.notifyAuth(); recover.render();
  assert.equal(recover.requests.length, 1);
  recover.runRetryTimer(); recover.render();
  assert.equal(recover.requests.length, 2);
  assert.deepEqual(recover.requests[1].body, recover.requests[0].body, `${type}: retry preserves query and grouping`);
  recover.login('refreshed'); recover.render();
  assert.equal(recover.requests.length, 2, `${type}: auth refresh cannot duplicate the retry`);
  await recover.finish(success);
  tree = recover.render();
  assert(walk(tree).some((node) => node.props?.cadastral === success), `${type}: successful retry displays the result`);
  assert(!walk(tree).some((node) => node.props?.children === 'cadastru.retrying'));
  assert.equal(recover.timers.size, 0);

  const exhausted = await harness(pageFile, path, stored);
  exhausted.render(); await exhausted.failNetwork(); exhausted.render();
  exhausted.runRetryTimer(); exhausted.render();
  await exhausted.finish({ error: 'service_unavailable' }, 503);
  tree = exhausted.render();
  assert.equal(exhausted.timers.size, 0, `${type}: no third automatic attempt`);
  const retryButton = walk(tree).find((node) => node.type === 'button' && node.props.children === 'cadastru.retrySearch');
  assert(retryButton, `${type}: exhausted retry offers a manual action`);
  exhausted.notifyAuth(); exhausted.render();
  assert.equal(exhausted.requests.length, 2);
  retryButton.props.onClick(); exhausted.render();
  assert.equal(exhausted.requests.length, 3);
  assert.equal(exhausted.requests[2].body.lookup_id, lookupId);
  await exhausted.finish(success);
  assert(walk(exhausted.render()).some((node) => node.props?.cadastral === success), `${type}: manual retry displays success`);

  for (const status of [400, 401, 403, 404, 422, 429]) {
    const rejected = await harness(pageFile, path, stored);
    rejected.render(); await rejected.finish({ error: 'not_found' }, status);
    tree = rejected.render();
    assert.equal(rejected.timers.size, 0, `${type}: HTTP ${status} does not retry automatically`);
    assert(!walk(tree).some((node) => node.props?.children === 'cadastru.retrySearch'));
  }
  for (const status of [408, 504]) {
    const timeout = await harness(pageFile, path, stored);
    timeout.render(); await timeout.finish({ error: 'timeout' }, status); timeout.render();
    assert.equal(timeout.timers.size, 1, `${type}: HTTP ${status} schedules recovery`);
    timeout.unmount();
    assert.equal(timeout.timers.size, 0, `${type}: leaving the page cancels the scheduled retry`);
  }
}

// Real form handlers: two intentional submissions of identical input get new IDs.
const form = await harness('src/components/CadastruSearchForm.js', '/ro/cadastru');
const submit = (label) => walk(form.render()).find((node) => node.type === 'button' && node.props.children === label).props.onClick();
const enterNumber = () => walk(form.render()).find((node) => node.type === 'input'
  && node.props.placeholder === 'form.cadastralPlaceholder').props.onChange({ target: { value: number } });
submit('cadastru.searchButton');
const first = new URL(form.browser.location.href).searchParams.get('lookup_id');
assert.equal(JSON.parse(form.storage.get(addressKey)).lookup_id, first);
form.remount(); submit('cadastru.searchButton');
assert.notEqual(new URL(form.browser.location.href).searchParams.get('lookup_id'), first);
form.remount(); enterNumber(); submit('cadastru.numberSearchButton');
const numberFirst = new URL(form.browser.location.href).searchParams.get('lookup_id');
assert(!form.storage.has(addressKey), 'number submission clears stale address request');
form.remount(); enterNumber(); submit('cadastru.numberSearchButton');
assert.notEqual(new URL(form.browser.location.href).searchParams.get('lookup_id'), numberFirst);
console.log('Search identity passed: submissions, OAuth reload, effect restarts, failure and in-flight token refresh, user changes, remounts, explicit corrections and address-to-number handoff.');

for (const type of ['address', 'number']) {
  const internal = await harness(pageFile, type === 'number'
    ? `/ro/cadastru/rezultat?source=number&cadastral_number=${number}`
    : '/ro/cadastru/rezultat?source=address&lookup=1',
    type === 'address' ? { [addressKey]: JSON.stringify(address) } : {});
  internal.login(); internal.render();
  await internal.finish({ error: 'internal_error' },500);
  internal.render(); internal.runRetryTimer(); internal.render();
  await internal.finish({ error: 'internal_error' },500);
  const content = JSON.stringify(internal.render());
  assert(content.includes('cadastru.internalError'),type);
  assert(!content.includes('cadastru.serviceUnavailable'),type);
}
console.log('Internal application errors use distinct copy after the bounded retry.');
