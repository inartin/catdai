import assert from 'node:assert/strict';
import { loadAppModule } from './lib/load-app-module.mjs';
const { summarizeCadastruStorage } = await import('../src/lib/admin-cadastru-storage-stats.js');
const building = '0100106.131.01';
const future = '2099-01-01T00:00:00Z', expired = '2000-01-01T00:00:00Z';
const source = {
  records: [
    { cadastral_number: building, city: 'Chișinău' }, // Registry duplicate of the shared building.
    { cadastral_number: `${building}.059`, city: 'Chișinău', shared_building_number: building, result_type:'full_data', next_refresh_after:future },
    { cadastral_number: `${building}.060`, city: 'Chișinău', shared_building_number: building, unit_list_entry:true },
    { cadastral_number: '0100106.132.01.001', city:'Bălți', result_type:'apartment_only' },
    { cadastral_number: '0100106.131', city:null },
  ],
  buildings:[{cadastral_number:building,lookup_input:{city:'Chișinău'},expires_at:expired,collection_snapshot:{usable:false}}],
  addresses:[{building_number:building,origin_key:'one'},{building_number:building,origin_key:'alias'}],
  nearby:[{origin_key:'one',expires_at:expired},{origin_key:'alias',expires_at:future}],
  transport:[{origin_key:'one',expires_at:future}], reports:[{origin_key:'one',expires_at:future,incomplete:true}],
};
let stats=summarizeCadastruStorage(source);
assert.equal(stats.total,5,'shared building registry rows are not counted twice');
assert.equal(stats.buildings,1);
assert.deepEqual(stats.apartments,{total:3,linked:2,details:2,references:1,fresh:1});
assert.equal(stats.other,1);
assert.deepEqual(stats.coverage.nearby,{saved:1,fresh:1,total:1},'aliases count once and can supply a fresh snapshot');
assert.deepEqual(stats.coverage.cadastru,{saved:1,fresh:0,total:1});
assert.equal(stats.coverage.reports.saved,0,'partial responses are not a saved complete dataset');
assert.equal(stats.allCategories,0);
assert.equal(stats.collection.partial,1);
assert.equal(stats.byCity.reduce((sum,row)=>sum+row.buildings+row.apartments+row.other,0),stats.total);
source.reports[0].incomplete=false;
assert.equal(summarizeCadastruStorage(source).allCategories,1);
const outside=summarizeCadastruStorage({...source,buildings:[{...source.buildings[0],lookup_input:{city:'Bălți'}}]});
assert.equal(outside.coverage.reports.total,0,'reports are only applicable to Chisinau buildings');
const empty=summarizeCadastruStorage({records:[],buildings:[],addresses:[],nearby:[],transport:[],reports:[]});
assert.equal(empty.total,0); assert.deepEqual(empty.byCity,[]);

let reads=0,fail=false;
const tables={cadastru_records:Array.from({length:1001},(_,i)=>({cadastral_number:`p${i}`,city:'Test'}))};
const route=await loadAppModule('src/app/api/admin/cadastru-storage/route.js',{
  'next/server':{NextResponse:{json:data=>Response.json(data)}},
  '@/lib/admin-auth':{requireAdminApiAuth:req=>req.authorized?null:new Response(null,{status:401})},
  '@/lib/supabase-admin':{supabaseAdmin:{from(table){ reads++;return {select(){return this;},order(){return this;},async range(from,to){return {data:(tables[table]||[]).slice(from,to+1),error:fail?{message:'offline'}:null};}};}}},
});
const request=(authorized=true,fresh=false)=>({authorized,nextUrl:new URL(`http://local/?fresh=${fresh?'1':'0'}`)});
assert.equal((await route.GET(request(false))).status,401);
assert.equal(reads,0,'authentication happens before all DB/cache access');
assert.equal((await (await route.GET(request())).json()).total,1001,'all pages counted');
const prior=reads;
await route.GET(request()); assert.equal(reads,prior,'five-minute cache retained');
fail=true;
assert.deepEqual(await (await route.GET(request(true,true))).json(),{available:false},'failed table reads never display false zeros');
console.log('Admin storage overview: totals, coverage, freshness, alias deduplication, pagination, auth and cache passed.');
