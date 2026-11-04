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
