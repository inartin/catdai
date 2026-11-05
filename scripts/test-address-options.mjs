import vm from 'node:vm';import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve('src/lib');const context=vm.createContext({console});const modules=new Map();
async function load(file){if(modules.has(file))return modules.get(file);let source=await fs.readFile(file,'utf8');let m;
if(file.endsWith('.json'))m=new vm.SyntheticModule(['default'],function(){this.setExport('default',JSON.parse(source));},{context,identifier:file});
else m=new vm.SourceTextModule(source,{context,identifier:file});modules.set(file,m);return m;}
const linker=async(spec,parent)=>{let target=path.resolve(path.dirname(parent.identifier),spec);if(!path.extname(target))target+='.js';return load(target);};
const m=await load(root+'/cadastru-address-options.js');await m.link(linker);await m.evaluate();const search=m.namespace.streetOptions;
assert(search('Chișinău','strada dacia').some(s=>s.street==='Dacia'&&s.road_type==='bulevard'));
assert(search('Chișinău','Dacia 15/1').some(s=>s.house_number==='15/1'));
assert(search('Chișinău','31 August 1989').some(s=>s.street==='31 August 1989'&&!s.house_number));
assert.equal(search('Nonexistent','Dacia').length,0);
console.log('Street options: locality scope, prefix cleanup, pasted house and numbered street preservation passed.');

const createLookup=m.namespace.createStreetOptionLookup;
const cache=new Map();let calls=0,mode='success';
const read=async key=>cache.has(key)?{value:cache.get(key)}:null;
const write=async (key,value,ttl)=>{cache.set(key,value);assert(ttl>0);};
const fetchStreets=async ({city,query})=>{calls++;await Promise.resolve();
 if(mode==='failure')throw Error('unavailable');
 if(mode==='wrong-city')return {city:'Ungheni',streets:[{street:'Luceafărul',road_type:'strada'}]};
 if(mode==='empty')return {city,streets:[]};
 return {city,streets:[{street:'Luceafărul',road_type:'strada'}, {street:'Luceafărul',road_type:'invalid'}]};};
const lookup=createLookup({read,write,fetchStreets});
assert.equal(search('Stăuceni','luceafarul').length,0,'this street is absent from the OSM catalogue');
const [missing,same]=await Promise.all([lookup('Stăuceni','luceafarul'),lookup('Stăuceni','luceafarul')]);
assert.equal(calls,1);assert.equal(missing[0].street,'Luceafărul');assert.equal(same.length,1);assert.equal(missing[0].road_type,'strada');
await lookup('Stăuceni','luceafarul');assert.equal(calls,1,'shared cache avoids repeat provider calls');
await lookup('Chișinău','Dacia');assert.equal(calls,1,'existing catalogue streets stay local');
cache.clear();mode='wrong-city';assert.equal((await lookup('Stăuceni','luceafarul')).length,0);assert.equal(cache.size,0);
mode='failure';assert.equal((await lookup('Stăuceni','luceafarul')).length,0);assert.equal(cache.size,0,'outages are never cached');
mode='empty';assert.equal((await lookup('Stăuceni','missing-street')).length,0);assert.equal(cache.size,1);
console.log('Street fallback: missing OSM street, type/locality validation, cache coalescing and outage handling passed.');

const prefetched=await load(root+'/prefetched-house-numbers.js');await prefetched.evaluate();
const getNumbers=prefetched.namespace.getPrefetchedHouseNumbers;
const dacia=getNumbers({city:'Chișinău',road_type:'bulevard',street:'Dacia'});
assert(dacia?.numbers.length>0);assert(Number.isFinite(dacia.fetchedAt));
assert.equal(getNumbers({city:'Stăuceni',road_type:'bulevard',street:'Dacia'}),null);
assert.equal(getNumbers({city:'Chișinău',road_type:'strada',street:'Dacia'}),null);
assert.equal(search('Chișinău','Dacia').filter(row=>row.street==='Dacia'&&row.road_type==='bulevard').length,1,'prefetched and dictionary rows must deduplicate');
console.log('Prefetched catalogue: locality/type isolation, house inventory and street deduplication passed.');

const matching=await load(root+'/cadastru-street-matching.js');
const getCatalogue=m.namespace.getAddressCatalogue;
const catalogue=getCatalogue('Chișinău');
for(const query of ['strada dacia','Dacia 15/1','31 August 1989','Киевская улица','Cuza-Vodă','șos. Hîncești']) {
 assert.deepEqual(matching.namespace.matchStreetOptions(catalogue.streets,query),search('Chișinău',query),'browser and server suggestions must match');
}
const catalogueDacia=catalogue.houses[matching.namespace.houseSuggestionKey({street:'Dacia',road_type:'bulevard'})];
assert.deepEqual(catalogueDacia.numbers,dacia.numbers);
const orhei=getCatalogue('Orhei');assert(orhei.streets.length>0);assert.equal(Object.keys(orhei.houses).length,0);
assert.equal(getCatalogue('Nonexistent').streets.length,0);
assert(orhei.streets.every(row=>!row.numbers&&!row.cadastral_number),'catalogues contain suggestion fields only');
console.log('Browser catalogues: matching parity, saved house numbers, nationwide streets and locality isolation passed.');

const resolveTyped=m.namespace.resolveTypedStreet;
const autofilled=resolveTyped('Decebal',search('Chișinău','Decebal'));
assert.equal(autofilled.status,'exact');assert.equal(autofilled.address.road_type,'bulevard');assert.equal(autofilled.address.street,'Decebal');
const unlisted=resolveTyped('Strada Completely Unknown',[]);assert.equal(unlisted.status,'unresolved');assert.equal(unlisted.address.street,'Completely Unknown');assert.equal(unlisted.address.road_type,'strada');
assert.equal(resolveTyped('șos. Unknown Road',[]).address.road_type,'sos');
assert.equal(resolveTyped('Unknown Road bd.',[]).address.road_type,'bulevard');
const ambiguous=[{street:'Example',road_type:'strada',rank:0},{street:'Example',road_type:'str-la',rank:0}];
assert.equal(resolveTyped('Example',ambiguous).status,'ambiguous');
assert.equal(resolveTyped('str-la Example',ambiguous).address.road_type,'str-la');
assert.equal(resolveTyped('str. Decebal',search('Chișinău','Decebal')).address.road_type,'strada','an explicit type is never silently changed');
assert.equal(resolveTyped('Decebal 63',search('Chișinău','Decebal 63')).address.street,'Decebal 63','embedded numbers remain available for server conflict validation');
const numbered=resolveTyped('31 August 1989',search('Chișinău','31 August 1989'));assert(numbered.status==='ambiguous'?numbered.choices.every(row=>row.street==='31 August 1989'):numbered.address.street==='31 August 1989','numbered street names remain complete even when the road type is ambiguous');
assert.equal(resolveTyped('Deceb',search('Chișinău','Deceb')).status,'unresolved','a partial name must not silently select the first suggestion');
console.log('Manual street resolution: browser history input, unlisted streets, explicit types, ambiguity and house-conflict preservation passed.');

// Suggestions tolerate partial initials and spelling without resolving a property.
const match = matching.namespace.matchStreetOptions;
const normalize = matching.namespace.normalizeStreetQuery;
const entry = (street, extra = {}) => ({ street, road_type: 'strada', label: `Strada ${street}`,
  normalizedNames: [normalize(street)], ...extra });
const nameFixtures = [entry('Mihai Eminescu'), entry('Nikolai Zelinski'), entry('George Coșbuc'),
  entry('Ion Luca Caragiale', { normalizedNames: ['ion luca caragiale', 'ион лука караджале'] })];
for (const [queries, canonical] of [
  [['M. E', 'M. Eminescu', 'M. Eminsecu', 'M. Eminse'], 'Mihai Eminescu'],
  [['N. Z', 'N. Zelins', 'N. Zelinschi', 'Nikolai Zelinschi'], 'Nikolai Zelinski'],
  [['G. Cosbcu'], 'George Coșbuc'],
  [['I.L. Caragaile', 'И. Л. Караджлае'], 'Ion Luca Caragiale'],
]) {
  for (const query of queries) {
    const options = match(nameFixtures, query);
    assert(options.some(option => option.street === canonical), `${query} suggests ${canonical} without a dedicated alias`);
    assert.equal(resolveTyped(query, options).status, 'unresolved', 'approximate suggestions require a choice');
  }
}
for (const query of ['X. Zelinschi', 'M. Eq', 'Eminescu M.', 'M. Qwerty']) {
  assert.equal(match(nameFixtures, query).length, 0, query);
}
const competing = match([entry('Mihai Eminescu'), entry('Mihail Eminescu')], 'M. Eminescu');
assert.equal(competing.length, 2, 'initials must retain competing full names');
const differentTypes = match([entry('Mihai Eminescu'), entry('Mihai Eminescu',
  { road_type: 'str-la', label: 'Stradela Mihai Eminescu' })], 'M. Eminescu');
assert.equal(differentTypes.length, 2, 'road types remain distinct choices');
const duplicated = match([
  entry('Nikolai Zelinski', { normalizedNames: ['nikolai zelinski', 'n zelinschi'] }),
  entry('Nikolai Zelinski', { source: 'mapmd', label: 'Strada Nicolae Zelinski' }),
], 'N. Zelinschi');
assert.equal(duplicated.length, 1);
assert.equal(duplicated[0].rank, 0, 'a duplicate fuzzy match must not replace an exact alias rank');
assert.equal(duplicated[0].source, 'mapmd');
assert.equal(duplicated[0].label, 'Strada Nicolae Zelinski', 'map.md retains display priority');
const ranked = match([entry('Mihai Eminescu'), entry('M. Eminsecu')], 'M. Eminsecu');
assert.equal(ranked[0].street, 'M. Eminsecu', 'literal matches rank before fuzzy matches');
const numberedFixtures = [entry('31 August 1989')];
assert.equal(match(numberedFixtures, '31 Augst 1989')[0].street, '31 August 1989');
assert.equal(match(numberedFixtures, '31 Augst 1988').length, 0, 'a different street year cannot become a pasted house');
assert.equal(match(numberedFixtures, '31 August 1989')[0].house_number, undefined);
assert.equal(match(numberedFixtures, '31 Augst 1989 22/D')[0].house_number, '22/D');
assert.equal(match(nameFixtures, 'M. Eminsecu 22/D')[0].house_number, '22/D');
for (const [query, canonical] of [['M. Eminescu', 'Mihai Eminescu'], ['N. Zelinschi', 'Nikolai Zelinski'],
  ['M. Eminsecu', 'Mihai Eminescu']]) {
  assert(search('Chișinău', query).some(option => option.street === canonical), query);
  assert.deepEqual(match(catalogue.streets, query), search('Chișinău', query), 'browser and server share tolerant matching');
  assert.equal(search('Nonexistent', query).length, 0, 'suggestions stay in the selected locality');
}
console.log('Tolerant autocomplete: partial initials, RO/RU typos, explicit choices, ambiguity, ranking, deduplication, exact street numbers, pasted suffixes and browser/server parity passed.');
