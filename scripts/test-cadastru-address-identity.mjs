import assert from 'node:assert/strict';
import test from 'node:test';
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-address-identity.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
const context = vm.createContext({ console, URL, URLSearchParams, AbortSignal, setTimeout, clearTimeout,
  fetch: (...args) => globalThis.fetch(...args) });
const modules = new Map();
async function moduleFor(file) {
  if (modules.has(file)) return modules.get(file);
  const source = await fs.readFile(file, 'utf8');
  const mod = file.endsWith('.json')
    ? new vm.SyntheticModule(['default'], function () { this.setExport('default', JSON.parse(source)); }, {context})
    : new vm.SourceTextModule(source, {context, identifier:file});
  modules.set(file,mod);
  return mod;
}
const resolver = await moduleFor(path.resolve('src/lib/cadastru-address-search.js'));
await resolver.link((name, parent) => moduleFor(name.startsWith('@/')
  ? path.resolve('src', name.slice(2) + '.js') : path.resolve(path.dirname(parent.identifier), name)));
await resolver.evaluate();
const {findCadastralByAddress} = resolver.namespace;


const requested = 'Chișinău, bd Decebal 65 ap 20';
const section = (number, address) => `<details><summary><strong>${number}</strong></summary><li>Adresa/locul amplasării: <strong>${address}</strong></li></details>`;
function upstreams(t, { wms = '', registryAddress = 'mun. Chișinău, bd. Decebal 65', label, number = '0100106.123.02.987' } = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const u = new URL(url); calls.push(u);
    if (u.hostname === 'nominatim.openstreetmap.org') return Response.json([{ lat:'47', lon:'28.8',
      display_name:'65, Bulevardul Decebal, Chișinău', address:{house_number:'65',road:'Bulevardul Decebal',city:'Chișinău'} }]);
    if (u.hostname === 'geodata.gov.md') {
      if (u.searchParams.get('request') === 'GetFeatureInfo') return Response.json({features: wms ? [{properties:{html:wms}}] : []});
      // This is the road parcel that the old fallback used to invent .01.020.
      return Response.json({features:[{properties:{codcadastral:'01001060480'},geometry:{type:'Polygon',coordinates:[[[28.7,46.9],[28.9,46.9],[28.9,47.1],[28.7,47.1],[28.7,46.9]]]}}]});
    }
    assert.equal(u.hostname,'www.cadastru.md');
    if (options.method !== 'POST') return new Response('<input name="p_instance" value="12345">');
    const body = new URLSearchParams(options.body);
    if (body.get('p_request') === 'APPLICATION_PROCESS=jQuery_Auto') return new Response(label !== undefined ? '0100106.123: mun. Chișinău, bd. Decebal 65' : '');
    if (body.get('p_request') === 'APPLICATION_PROCESS=GET_INFO_RBI') return new Response(`<div class="infoConstr">${registryAddress ? `Adresa: ${registryAddress}<br>` : ''}<a onclick="getDetailedInfo('${number}',3)"><i>${label}</i></a></div>`);
    throw new Error(`Unexpected request ${body}`);
  });
  return calls;
}
test('Decebal 65 ap 20: a geocoded point and road parcel cannot invent a cadastral identity', async t => {
  const calls = upstreams(t);
  await assert.rejects(findCadastralByAddress(requested), {code:'not_found'});
  assert(!calls.some(u => u.searchParams.get('request') === 'GetFeature'), 'no parcel/building suffix derivation lookup');
});
test('an exact official building without a verified apartment stays building-only', async t => {
  upstreams(t,{wms:section('01001060123.02','mun. Chișinău, bd. Decebal 65')});
  const result=await findCadastralByAddress(requested);
  assert.equal(result.apartment_unavailable,true);
  assert.equal(result.cadastral_number,undefined);
  assert.equal(result.raw_cadastral_number,undefined);
  assert.equal(result.building_cadastral_number,'01001060123.02');
  assert.equal(result.map_geometry,undefined);
});
test('registry unit label wins even when cadastral suffix differs', async t => {
  upstreams(t,{label:'20'});
  const result=await findCadastralByAddress(requested);
  assert.equal(result.cadastral_number,'0100106.123.02.987');
});
for (const scenario of [
  {label:'21',number:'0100106.123.02.020'},
  {label:'20',registryAddress:''},
  {label:'20',registryAddress:'mun. Chișinău, bd. Decebal 67'},
]) test(`registry rejects unverified unit ${JSON.stringify(scenario)}`,async t=>{
  upstreams(t,scenario);
  await assert.rejects(findCadastralByAddress(requested),{code:'not_found'});
});
test('WMS apartment address can verify a unit whose suffix differs',async t=>{
  upstreams(t,{wms:section('01001060123.02.987','mun. Chișinău, bd. Decebal 65, ap. 20')});
  const result=await findCadastralByAddress(requested);
  assert.equal(result.cadastral_number,'0100106.123.02.987');
});


for (const house of ['22/D', '22/d', '22 / d', '22']) {
  test(`local backup preserves the complete house suffix: ${house}`, async t => {
    t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
      const host = new URL(url).hostname;
      if (host === 'nominatim.openstreetmap.org') return Response.json([]);
      if (host === 'geodata.gov.md') return Response.json({ features: [] });
      assert.equal(host, 'www.cadastru.md');
      if (options.method !== 'POST') return new Response('<input name="p_instance" value="12345">');
      const body = new URLSearchParams(options.body);
      if (body.get('p_request') === 'APPLICATION_PROCESS=jQuery_Auto') return new Response(
        '0100118131: mun. Chișinău, str. Nuferilor 22\n0100118111: mun. Chișinău, str. Nuferilor 22/d');
      assert.equal(body.get('p_request'), 'APPLICATION_PROCESS=GET_INFO_RBI');
      const suffix = body.get('x01') === '01001180111' ? '/d' : '';
      const parcel = suffix ? '111' : '131';
      return new Response(`<div class="infoConstr">Adresa: mun. Chișinău, str. Nuferilor 22${suffix}<br><a onclick="getDetailedInfo('0100118.${parcel}.01.009',3)"><i>9</i></a></div>`);
    });
    const result = await findCadastralByAddress(`Chișinău, str Nuferilor ${house} ap 9`);
    assert.equal(result.cadastral_number, `0100118.${house.includes('/') ? '111' : '131'}.01.009`);
    assert.equal(result.parsed_input.houseNumber, house.includes('/') ? '22/D' : '22');
  });
}
