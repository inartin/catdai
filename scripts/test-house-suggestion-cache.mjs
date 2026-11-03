import assert from 'node:assert/strict';
import { createHouseSuggestionCache, mergeHouseInventories } from '../src/lib/house-suggestion-cache.js';
let time=0,calls=0,failed=false,empty=false;
const entries=new Map(),deferred=[];
const input={city:'Chișinău',road_type:'strada',street:'Test'};
const read=async key => entries.has(key)?{value:entries.get(key)}:null;
const cache=createHouseSuggestionCache({read,write:async(key,value)=>entries.set(key,value),now:()=>time,
 fetchNumbers:async()=>{calls++;await Promise.resolve();if(failed)throw Error();return {numbers:empty?[]:['45/A','45A']};}});
const defer=fn=>deferred.push(fn);
await Promise.all([cache(input,defer),cache(input,defer)]);
assert.equal(calls,1);
assert.deepEqual((await cache(input,defer)).numbers,['45/A','45A']);
time=31*86400000;failed=true;
assert.deepEqual((await cache(input,defer)).numbers,['45/A','45A']);
await deferred.shift()();assert.equal(calls,2);
await cache(input,defer);await deferred.shift()();assert.equal(calls,2);
time+=301000;failed=false;empty=true;
await cache(input,defer);await deferred.shift()();
assert.deepEqual((await cache(input,defer)).numbers,['45/A','45A']);
assert.equal([...entries.values()][0].fetchedAt,0);
assert.deepEqual((await cache({...input,road_type:'bulevard'},defer)).numbers,[]);
console.log('House suggestion cache: coalescing, freshness, failure/empty preservation, cooldown and type isolation passed.');

let providerCalls=0;const seedDefers=[];const baseline={numbers:['45/A','45A'],attribution:'test',fetchedAt:1000};
const seeded=createHouseSuggestionCache({read:async()=>null,write:async()=>{},seed:()=>baseline,now:()=>1000,
 fetchNumbers:async()=>{providerCalls++;throw Error('provider offline');}});
assert.deepEqual((await seeded(input,fn=>seedDefers.push(fn))).numbers,baseline.numbers);
assert.equal(providerCalls,0);assert.equal(seedDefers.length,0,'fresh prefetched numbers need no provider');
const staleSeed=createHouseSuggestionCache({read:async()=>null,write:async()=>{},seed:()=>baseline,now:()=>1000+91*86400000,
 fetchNumbers:async()=>{providerCalls++;throw Error('provider offline');}});
const saved=await staleSeed(input,fn=>seedDefers.push(fn));assert.deepEqual(saved.numbers,baseline.numbers);assert.equal(saved.stale,true);
await seedDefers.shift()();assert.equal(providerCalls,1);
assert.deepEqual((await staleSeed(input,()=>{})).numbers,baseline.numbers,'outages cannot discard the disk baseline');
console.log('Prefetched inventory: immediate response without Redis/provider, stale refresh and outage retention passed.');

const provider={numbers:['1','3'],primary_source:'mapmd',attribution:'© map.md',fetchedAt:1000,source_fetched_at:{mapmd:new Date(1000).toISOString()}};
const osm={numbers:['2','3'],primary_source:'osm',attribution:'© OpenStreetMap contributors',fetchedAt:2000,source_fetched_at:{osm:new Date(2000).toISOString()}};
const mixed=mergeHouseInventories(osm,provider);
assert.equal(mixed.primary_source,'mapmd');assert.equal(mixed.fetchedAt,1000);
assert.deepEqual(mixed.numbers,['1','2','3']);assert.equal(Object.keys(mixed.source_fetched_at).length,2);
let stored;
const refreshBoth=createHouseSuggestionCache({read:async()=>null,write:async(_key,value)=>stored=value,seed:()=>osm,now:()=>2000+31*86400000,fetchNumbers:async()=>({numbers:['4'],attribution:'© map.md'})});
const jobs=[];await refreshBoth(input,fn=>jobs.push(fn));await jobs.shift()();
assert.deepEqual(stored.numbers,['2','3','4']);assert.equal(stored.primary_source,'mapmd');assert(stored.source_fetched_at.osm);assert(stored.source_fetched_at.mapmd);
console.log('Source priority: map.md wins over newer OSM metadata; refresh retains both source dates and extra house numbers.');
