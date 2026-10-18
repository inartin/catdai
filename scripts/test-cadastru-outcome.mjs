import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const events = [];
const context = vm.createContext({ console: { error() {} } });
const mocks = {
  'next/server': { NextResponse: { json: (body, options) => ({ status: options.status, body }) } },
  '@/lib/cadastru-search-events': { logCadastruSearchEvent: async (_, type, options) => events.push({ type, ...options }) },
  '@/lib/cadastru-supported-cities': { resolveCadastruSupportedCity: value => value },
  '@/lib/validation': { validateCadastralNumber: value => ({ value: value === '1014203418' ? '1014203.418' : value }) },
};
const module = new vm.SourceTextModule(await fs.readFile('src/lib/cadastru-outcome.js','utf8'), { context });
await module.link(id => new vm.SyntheticModule(Object.keys(mocks[id]), function() {
  for (const [key,value] of Object.entries(mocks[id])) this.setExport(key,value);
}, { context }));
await module.evaluate();
const wrap = module.namespace.withCadastruOutcome;
const body = { search_context: 'cadastru', city: 'Chișinău', road_type: 'bulevard', street: 'Decebal', house_number: '63', apartment_number: '059', lookup_id: 'test' };
const request = value => ({ clone: () => ({ json: async () => value }) });
const failed = await wrap(async () => { throw new Error('private database error'); })(request(body));
assert.equal(failed.status,500);
assert.equal(failed.body.error,'internal_error');
assert.equal(JSON.stringify(failed).includes('private database'),false);
assert.equal(events[0].resultType,'error');
assert.equal(events[0].searchAddress,'Chișinău, bd Decebal 63 ap 59');
assert.equal(events[0].lookupId,'test');
const upstream = { status: 503, body: { error: 'service_unavailable' } };
assert.equal(await wrap(async () => upstream)(request(body)),upstream);
assert.equal(events.length,2);
for (const status of [200,400,401,404,422,429]) await wrap(async () => ({ status }))(request(body));
assert.equal(events.length,2);
await wrap(async () => upstream)(request({ ...body, search_context: undefined }));
assert.equal(events.length,2);
await wrap(async () => upstream)(request({ search_context: 'cadastru', cadastral_number: '1014203418' }));
assert.equal(events[2].type,'number');
assert.equal(events[2].cadastralNumber,'1014203.418');
console.log('Cadastru outcomes: cached authorization errors, upstream failures, privacy, status filtering and query identity passed.');
