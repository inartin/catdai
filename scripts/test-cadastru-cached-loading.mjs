// Cached reads must not wait for property writes or repeat an existing unlock check.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { loadAppModule } from './lib/load-app-module.mjs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const number = '0100106.131.01.097';
const payload = { status: 'success', cadastral_number: number, apartment: { area_m2: 52 },
  map_location: { latitude: 47, longitude: 28 }, form_fields: { city: 'Chișinău' } };
const entry = { payload, fetchedAt: '2026-10-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' };
let credit = { allowed: true, reason: 'already_consumed' }, consumed = 0, writes = [];
let releaseCredit, releaseRead, hold = true;
const deferred = [];
const route = await loadAppModule('src/app/api/cadastral/route.js', {
  'next/server': { after: callback => deferred.push(callback), NextResponse: { json: (data, init) => Response.json(data, init) } },
  '@/lib/statistics-context': { withStatisticsContext: handler => handler },
  '@/lib/cadastru-outcome': { withCadastruOutcome: handler => handler },
  '@/lib/rate-limit': { rateLimit: () => ({ check: () => ({ allowed: true, remaining: 14 }) }) },
  '@/lib/access-tier': { resolveAccessTier: async () => ({ tier: 'free', user_id: 'test-user' }) },
  '@/lib/paid-feature-usage': {
    checkFeatureAccess: () => hold ? new Promise(resolve => { releaseCredit = () => resolve(credit); }) : Promise.resolve(credit),
    consumeFeatureCredit: async () => { consumed++; return { allowed: true, reason: 'already_consumed' }; },
    makePaidFeatureUsageKey: () => 'usage-key',
    buildFeatureCreditRequiredPayload: (_feature, reason) => ({ reason }),
  },
  '@/lib/cadastru-search-events': { logCadastruSearchEvent: async () => null },
  '@/lib/cadastru-records': {
    getCadastruRecordByNumber: () => hold ? new Promise(resolve => { releaseRead = () => resolve(entry); }) : Promise.resolve(entry),
    persistCadastruRecord: async (_payload, options) => { writes.push(options); },
  },
  '@/lib/cadastru-buildings': { getBuildingFallback: async () => null },
  '@/lib/cadastru-address-search': { fetchCadastruDetailData: async () => { throw new Error('Unexpected provider lookup'); } },
  '@/lib/cadastru-external-api': { fetchExternalCadastralData: async () => { throw new Error('Unexpected provider lookup'); } },
  '@/lib/cadastru-record-refresh': { scheduleCadastruNumberRefresh: () => {} },
});
const request = () => new Request('http://local/api/cadastral', { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cadastral_number: number }) });
const pending = route.POST(request());
await new Promise(setImmediate);
assert(releaseCredit && releaseRead, 'credit and cached property reads start concurrently');
releaseCredit(); releaseRead();
const response = await pending;
assert.equal(response.status, 200);
assert.equal((await response.json()).apartment.area_m2, 52);
assert.equal(consumed, 0, 'an existing unlock does not perform a second ledger read');
assert.equal(writes.length, 0, 'cached responses do not wait for property persistence');
assert.equal(deferred.length, 1);
await deferred.shift()();
assert.equal(writes.length, 1);
assert.equal(writes[0].usageOnly, true, 'only usage metadata is scheduled after the response');
hold = false;
credit = { allowed: false, reason: 'no_credit' };
const preview = await (await route.POST(request())).json();
assert.equal(preview.locked_sections.cadastru_details, true);
assert.equal(preview.map_location, undefined, 'cached previews still redact exact map data');
assert.equal(deferred.length, 0, 'locked previews do not update unlocked usage');
credit = { allowed: true, reason: 'has_credit' };
await route.POST(request());
assert.equal(consumed, 1, 'a new unlock still consumes its credit synchronously');

let collect = true, persist = true, rpcCalls = 0;
const storage = await loadAppModule('src/lib/cadastru-records.js', {
  '@/lib/statistics-context': { shouldCollectStatistics: () => collect },
  '@/lib/runtime-persistence': { shouldPersistRuntimeData: () => persist },
  '@/lib/supabase-admin': { supabaseAdmin: {
    async rpc(name, args) { rpcCalls++; assert.equal(name, 'record_cadastru_lookup_usage'); assert.equal(args.p_number, number); return { data: true, error: null }; },
    from() { throw new Error('Usage must not read or rewrite the property or its aliases'); },
  } },
  '@/lib/cache': { getSharedCache: async () => null, setSharedCache: async () => true },
});
await storage.persistCadastruRecord(payload, { usageOnly: true });
assert.equal(rpcCalls, 1);
collect = false;
await storage.persistCadastruRecord(payload, { usageOnly: true });
collect = true; persist = false;
await storage.persistCadastruRecord(payload, { usageOnly: true });
persist = true;
await storage.persistCadastruRecord(payload, { usageOnly: true, countLookup: false });
assert.equal(rpcCalls, 1, 'admin/development statistics and persistence guards remain effective');

const db = new PGlite();
try {
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(await fs.readFile('db/cadastru_records.sql', 'utf8'));
  await db.exec(await fs.readFile('supabase/migrations/20261030201034_cadastru_cached_lookup_usage.sql', 'utf8'));
  await db.query(`insert into cadastru_records(cadastral_number,raw_payload,payload_hash,last_official_fetch_at,next_refresh_after)
    values ($1,$2,'saved-hash','2026-10-01','2026-12-30')`, [number, payload]);
  const original = (await db.query('select raw_payload,payload_hash,last_official_fetch_at,next_refresh_after,data_updated_at from cadastru_records')).rows[0];
  await Promise.all(Array.from({ length: 25 }, () => db.query('select record_cadastru_lookup_usage($1)', [number.replaceAll('.', '')])));
  const saved = (await db.query('select raw_payload,payload_hash,last_official_fetch_at,next_refresh_after,data_updated_at,lookup_count,last_used_at from cadastru_records')).rows[0];
  const { lookup_count, last_used_at, ...snapshot } = saved;
  assert.equal(lookup_count, 26, 'usage increments atomically without lost updates');
  assert(last_used_at);
  assert.deepEqual(snapshot, original, 'usage does not renew or rewrite the official snapshot');
  assert.equal((await db.query("select record_cadastru_lookup_usage('missing') as found")).rows[0].found, false);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const { allowed } = (await db.query("select has_function_privilege($1,'public.record_cadastru_lookup_usage(text)','execute') as allowed", [role])).rows[0];
    assert.equal(allowed, role === 'service_role');
  }
} finally { await db.close(); }
console.log('Cached loading: parallel reads, reused unlock, deferred usage, preview masking, atomic counters and unchanged snapshots passed.');

for (const [path, storageModule, getter, formatter, key] of [
  ['nearby', 'cadastru-nearby-storage', 'getStoredNearby', 'nearbyFromStorage', 'nearby'],
  ['public-transport', 'cadastru-public-transport-storage', 'getStoredPublicTransport', 'publicTransportFromStorage', 'public_transport'],
  ['municipal-reports', 'cadastru-municipal-reports-storage', 'getStoredMunicipalReports', 'municipalReportsFromStorage', 'municipal_reports'],
]) {
  let permit, stored, completed = false;
  const secondary = await loadAppModule(`src/app/api/cadastru/${path}/route.js`, {
    'next/server': { after: () => { throw new Error('Fresh snapshots must not refresh'); }, NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/statistics-context': { withStatisticsContext: handler => handler },
    '@/lib/supabase-admin': { supabaseAdmin: { from: () => { throw new Error('Unexpected database read'); } } },
    '@/lib/rate-limit': { rateLimit: () => ({ check: () => ({ allowed: true }) }) },
    '@/lib/cadastru-map-access': { canReadCadastruMapData: () => new Promise(resolve => { permit = resolve; }) },
    '@/lib/cadastru-records': { getCadastruRecordByNumber: async () => ({ payload: { ...payload, request_address: 'Chișinău, strada Test 1' } }), getCadastruRecordByAddress: async () => null },
    '@/lib/cadastru-buildings': { getBuildingFallback: async () => null },
    '@/lib/cache': { getSharedCacheClient: async () => null, getSharedCache: async () => null, setSharedCache: async () => true },
    '@/lib/cadastru-external-api': { fetchExternalNearbyData: async () => { throw new Error('Unexpected provider'); }, fetchExternalPublicTransportData: async () => { throw new Error('Unexpected provider'); }, fetchExternalMunicipalReportsData: async () => { throw new Error('Unexpected provider'); } },
    [`@/lib/${storageModule}`]: { [getter]: () => new Promise(resolve => { stored = resolve; }),
      [formatter]: saved => saved.payload, storeNearby: async () => null, storePublicTransport: async () => null, storeMunicipalReports: async () => null },
  });
  const pendingResponse = secondary.POST(request()).then(response => { completed = true; return response; });
  await new Promise(setImmediate);
  assert(permit && stored, `${path} reads its snapshot alongside the access check`);
  stored({ expiresAt: '2099-01-01', payload: { location: payload.map_location, summary: { total: 0 } } });
  await new Promise(setImmediate);
  assert.equal(completed, false, `${path} cannot return before access is known`);
  permit(false);
  const data = await (await pendingResponse).json();
  assert.equal(data[key].location?.latitude, undefined, `${path} still redacts protected map latitude`);
  assert.equal(data[key].location?.longitude, undefined, `${path} still redacts protected map longitude`);
}
console.log('Secondary cached reads: concurrent access/storage, no premature response and protected map redaction passed.');

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const { code } = await transform(await fs.readFile('src/app/cadastru/rezultat/CadastruResultPage.js', 'utf8'), {
  filename: 'CadastruResultPage.js', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' },
});
const noop = () => null, jsx = (type, props) => ({ type, props });
const slots = [], requests = [], opens = [];
let cursor = 0, effects = [], authLoading = true, params;
const useState = initial => {
  const i = cursor++;
  if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
  return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
};
const react = { Suspense: noop, useState, useRef: value => useState(() => ({ current: value }))[0],
  useEffect(effect, deps) {
    const i = cursor++, prior = slots[i];
    if (prior && deps.every((value, j) => Object.is(value, prior.deps[j]))) return;
    prior?.cleanup?.(); slots[i] = { deps };
    effects.push(() => { slots[i].cleanup = effect(); });
  },
};
const mocks = {
  react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
  'next/navigation': { useRouter: () => ({}), useSearchParams: () => params },
  '@/context/LanguageContext': { useTranslation: () => ({ lang: 'ro', t: key => key }) },
  '@/context/AuthContext': { useAuth: () => ({ loading: authLoading, session: null, isAuthenticated: false, clearAuthError: noop }) },
  '@/lib/maib/products.mjs': { maibProduct: () => ({ amount_mdl: 25 }) },
  '@/lib/validation': { matchCity: noop, validateCadastralNumber: () => ({ valid: false }) },
  '@/lib/cadastru-supported-cities': { CADASTRU_SUPPORTED_CITIES: [] },
  '@/lib/cadastru-favorites': { getCadastruFavoritePath: noop, getSavedCadastruAddress: noop },
  '@/lib/cadastru-valuation-handoff': { buildFullAccessAddressResultParams: noop, resolveValuationDistrict: noop },
  '@/lib/cadastru-municipal-reports': { municipalReportsAvailableForCadastru: () => false, validMunicipalReportsResult: () => true },
  '@/lib/visitor-browser': { getDeviceId: noop },
  '@/lib/cadastru-lookup-tracking': { ensureCadastruLookupId: noop, getCadastruSearchSessionId: noop },
  '@/lib/cadastru-share-tracking': { recordCadastruShareOpen: slug => opens.push(slug) },
  '@/lib/cadastru-map': { cadastruMapLocation: noop },
  '@/lib/payment-urls.mjs': { featureCheckoutUrl: noop }, './loading': { default: noop },
};
const context = vm.createContext({ console, URL, URLSearchParams, AbortController, setTimeout: () => 1, clearTimeout: noop,
  process: { env: {} }, window: {}, navigator: {},
  localStorage: { removeItem: noop }, sessionStorage: { getItem: noop }, requestAnimationFrame: () => 1, cancelAnimationFrame: noop,
  fetch: url => { requests.push(url); return new Promise(() => {}); },
});
const page = new vm.SourceTextModule(code, { context });
await page.link(name => {
  const exports = mocks[name] || (name.startsWith('@/components/') ? { default: noop } : null);
  assert(exports, name);
  return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
});
await page.evaluate();
const find = (node, check) => !node || typeof node !== 'object' ? null : Array.isArray(node) ? node.map(value => find(value, check)).find(Boolean)
  : check(node) ? node : find(node.props?.children, check);
const render = props => {
  cursor = 0; effects = [];
  const component = page.namespace.default(props).props.children;
  const tree = component.type(component.props);
  effects.forEach(effect => effect());
  return tree;
};
for (const compact of [false, true]) {
  for (const slot of slots) slot?.cleanup?.();
  slots.length = 0; requests.length = 0; opens.length = 0; authLoading = true;
  const slug = 'c'.repeat(48);
  params = new URLSearchParams(compact ? {} : { share_slug: slug });
  const props = { ...(compact ? { shareSlug: slug } : {}), initialSharedReport: { slug, payload } };
  assert(find(render(props), node => node.props?.cadastral === payload), 'public snapshot is present before authentication and browser fetches');
  assert.equal(requests.length, 0, 'the browser does not fetch the supplied report again');
  assert.equal(opens.length, 0);
  authLoading = false;
  render(props); render(props);
  assert.deepEqual(opens, [slug], 'the browser still records one public open after auth settles');
}
for (const slot of slots) slot?.cleanup?.();
slots.length = 0; requests.length = 0;
params = new URLSearchParams({ share_slug: 'd'.repeat(48) });
render({ initialSharedReport: { slug: 'e'.repeat(48), payload } });
assert(requests.includes(`/api/cadastru/share/${'d'.repeat(48)}`), 'a different share cannot reuse the initial report');
console.log('Shared first render: server snapshot, slug binding, no duplicate fetch, no auth wait and unchanged opens passed.');
