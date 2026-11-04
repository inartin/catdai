// pnpm exec node --experimental-vm-modules scripts/test-address-preloading.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const context = vm.createContext({ console, URL, URLSearchParams, Response, AbortSignal });
const modules = new Map();
async function load(file) {
  if (modules.has(file)) return modules.get(file);
  let result;
  if (file === 'next/server' || file === 'node:crypto') {
    const values = file === 'next/server' ? { NextResponse: { json: Response.json } } : { createHash };
    result = new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value);
    }, { context, identifier: file });
  } else {
    const source = await fs.readFile(file, 'utf8');
    result = file.endsWith('.json')
      ? new vm.SyntheticModule(['default'], function () { this.setExport('default', JSON.parse(source)); }, { context, identifier: file })
      : new vm.SourceTextModule(source, { context, identifier: file });
  }
  modules.set(file, result);
  return result;
}
async function linker(spec, parent) {
  if (spec === 'next/server' || spec === 'node:crypto') return load(spec);
  let file = spec.startsWith('@/') ? path.resolve('src', spec.slice(2)) : path.resolve(path.dirname(parent.identifier), spec);
  if (!path.extname(file)) file += '.js';
  return load(file);
}
const route = await load(path.resolve('src/app/api/cadastru/address-catalogue/route.js'));
await route.link(linker); await route.evaluate();
const request = (city, headers = {}) => new Request(`https://test/api/cadastru/address-catalogue?${new URLSearchParams({ city })}`, { headers });
assert.equal((await route.namespace.GET(request('Not a locality'))).status, 400);
const response = await route.namespace.GET(request('Chișinău'));
assert.equal(response.status, 200);
assert.match(response.headers.get('cache-control'), /public.*max-age=300/);
const data = await response.json();
assert.equal((await route.namespace.GET(request('Chișinău', { 'if-none-match': response.headers.get('etag') }))).status, 304);
const orhei = await (await route.namespace.GET(request('Orhei'))).json();
assert(orhei.streets.length > 0); assert.equal(Object.keys(orhei.houses).length, 0);
console.log(`Catalogue route: locality validation, public caching and ETag revalidation passed (${gzipSync(JSON.stringify(data)).length} compressed bytes for Chișinău).`);

const clientModule = await load(path.resolve('src/lib/cadastru-address-suggestions-client.js'));
await clientModule.link(linker); await clientModule.evaluate();
const createClient = clientModule.namespace.createAddressSuggestionClient;
const saved = new Map();
const storage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) };
let time = Date.parse('2026-11-04T20:00:00Z'), mode = 'success', finishHouses;
const calls = [];
const fetcher = async (url, options) => {
  calls.push({ url, options });
  if (mode === 'offline') throw Error('offline');
  const params = new URL(url, 'https://test').searchParams;
  if (url.startsWith('/api/cadastru/address-catalogue?')) {
    if (mode === 'wrong-city') return Response.json({ ...data, city: 'Wrong locality' });
    if (mode === 'unchanged') return new Response(null, { status: 304 });
    return Response.json(params.get('city') === 'Chișinău' ? data : orhei);
  }
  if (params.get('houses') === '1') return new Promise(resolve => { finishHouses = resolve; });
  return Response.json({ streets: [{ street: 'Provider Street', road_type: 'strada', label: 'Strada Provider Street' }] });
};
const options = { fetcher, getStorage: () => storage, now: () => time };
const client = createClient(options);
assert.equal(client.getCatalogue('Chișinău'), null);
await Promise.all([client.preloadCatalogue('Chișinău'), client.preloadCatalogue('Chișinău')]);
assert.equal(calls.length, 1, 'simultaneous catalogue loads share one fetch');
assert(client.getStreetOptions('Chișinău', 'Дачия').length > 0, 'saved Cyrillic aliases filter locally');
const dacia = client.getStreetOptions('Chișinău', 'Dacia').find(row => row.street === 'Dacia' && row.road_type === 'bulevard');
assert(dacia);
await client.fetchStreetOptions('Chișinău', 'Dacia');
const known = await client.loadHouseNumbers('Chișinău', dacia);
assert(known.numbers.length > 0); assert.equal(calls.length, 1, 'saved street and house lists need no typing-time requests');
assert.equal(client.getHouseNumbers('Orhei', dacia), undefined, 'house lists cannot cross localities');
assert.equal(client.getHouseNumbers('Chișinău', { ...dacia, road_type: 'strada' }), undefined, 'house lists cannot cross road types');

await client.preloadCatalogue('Orhei');
assert(client.getStreetOptions('Orhei', 'Vasile Lupu').length > 0, 'nationwide streets preload by locality');
const unlisted = { street: 'Provider Street', road_type: 'strada' };
const beforeProvider = calls.length;
await client.fetchStreetOptions('Orhei', unlisted.street);
await client.fetchStreetOptions('Orhei', unlisted.street);
assert.equal(calls.length, beforeProvider + 1, 'missing streets use and then reuse the browser query cache');
const first = client.loadHouseNumbers('Orhei', unlisted);
const second = client.loadHouseNumbers('Orhei', unlisted);
assert.equal(calls.length, beforeProvider + 2, 'highlight and selection share one house fetch');
await client.loadHouseNumbers('Orhei', { street: 'Another Street', road_type: 'strada' }, { prefetch: true });
assert.equal(calls.length, beforeProvider + 2, 'rapid hovering cannot flood the provider queue');
finishHouses(Response.json({ numbers: ['10', '10/A'], attribution: '© map.md' }));
await Promise.all([first, second]);
assert.equal(client.getHouseNumbers('Orhei', unlisted).numbers.join(','), '10,10/A');

const restored = createClient(options);
const beforeRestore = calls.length;
assert(restored.getStreetOptions('Chișinău', 'Dacia').length > 0);
assert(restored.getStreetOptions('Orhei', unlisted.street).length > 0);
assert.equal(restored.getHouseNumbers('Orhei', unlisted).numbers.join(','), '10,10/A');
await restored.preloadCatalogue('Chișinău'); await restored.loadHouseNumbers('Orhei', unlisted);
assert.equal(calls.length, beforeRestore, 'catalogues, provider streets and houses survive a page reload');

time += 6 * 60000; mode = 'unchanged';
await restored.preloadCatalogue('Chișinău');
assert.equal(calls.at(-1).options.headers['If-None-Match'], `"${data.version}"`);
assert(restored.getStreetOptions('Chișinău', 'Dacia').length > 0);
time += 6 * 60000; mode = 'wrong-city';
await restored.preloadCatalogue('Chișinău');
assert.equal(restored.getCatalogue('Chișinău').city, 'Chișinău', 'wrong-locality responses cannot replace a saved catalogue');
mode = 'offline';
assert.equal(await restored.preloadCatalogue('Cahul'), null, 'failed first downloads permit the ordinary API fallback');
time += 31 * 86400000;
assert.equal((await restored.loadHouseNumbers('Orhei', unlisted)).numbers.join(','), '10,10/A', 'failed stale refreshes retain useful houses');
const afterFailure = calls.length;
await restored.loadHouseNumbers('Orhei', unlisted);
assert.equal(calls.length, afterFailure, 'failed refreshes do not hammer the API');

mode = 'success'; time = Date.parse('2026-11-04T20:00:00Z');
const blockedStorage = createClient({ ...options, getStorage: () => { throw Error('storage blocked'); } });
await blockedStorage.preloadCatalogue('Chișinău');
assert(blockedStorage.getStreetOptions('Chișinău', 'Dacia').length > 0, 'blocked browser storage still permits memory caching');
console.log('Browser cache: local matching, fallback reuse, shared prefetch, persistence, source isolation, refresh and outage retention passed.');
