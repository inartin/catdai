// Run from catdai with a supported Node runtime: pnpm exec node scripts/warm-address-catalogue.mjs
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require=createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(),process.env.NODE_ENV!=='production',{info(){},error(){}});
const {mergeHouseInventories}=await import('../src/lib/house-suggestion-cache.js');
const {getSharedCacheClient}=await import('../src/lib/cache.js');
const catalogue=JSON.parse(await readFile('src/lib/cadastru-streets/data/chisinau-addresses.json','utf8'));
const client=await getSharedCacheClient();
if(!client)throw Error('Shared cache is unavailable');
let count=0;
try {
 for(const row of catalogue.streets) {
  if(!row.numbers.length)continue;
  const fetchedAt=Date.parse(row.fetched_at);if(!Number.isFinite(fetchedAt))continue;
  const key=`catdai:house-suggestions:v1:${JSON.stringify([catalogue.city,row.road_type,row.street])}`;
  const previous=await client.get(key);
  const value=mergeHouseInventories(previous?JSON.parse(previous):null,{numbers:row.numbers,fetchedAt,attribution:catalogue.attribution,primary_source:row.primary_source,source_fetched_at:row.source_fetched_at});
  await client.set(key,JSON.stringify(value),{EX:365*86400});count++;
 }
 console.log(JSON.stringify({city:catalogue.city,cachedStreets:count}));
} finally {await client.quit();}
