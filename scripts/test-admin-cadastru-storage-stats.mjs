import assert from 'node:assert/strict';
import { loadAppModule } from './lib/load-app-module.mjs';
const { summarizeCadastruCities, summarizeCadastruStorage } = await import('../src/lib/admin-cadastru-storage-stats.js');
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
assert.equal(stats.fullData,1,'only full_data records count, not apartment-only or address references');
assert.equal(summarizeCadastruStorage({...source,records:[...source.records,
  {...source.records[1]},
  {cadastral_number:'0100106.131.01.061',result_type:'full_data',unit_list_entry:true},
  {cadastral_number:null,result_type:'full_data'},
]}).fullData,1,'full records deduplicate numbers and exclude reference-only or missing identities');
assert.deepEqual(stats.apartments,{total:3,linked:2,details:2,references:1,fresh:1});
assert.equal(stats.other,1);
assert.deepEqual(stats.coverage.nearby,{saved:1,fresh:1,total:1},'aliases count once and can supply a fresh snapshot');
assert.deepEqual(stats.coverage.cadastru,{saved:1,fresh:0,total:1});
assert.equal(stats.coverage.reports.saved,0,'partial responses are not a saved complete dataset');
assert.equal(stats.allCategories,0);
assert.equal(stats.collection.partial,1);
assert.equal(stats.byCity.reduce((sum,row)=>sum+row.buildings+row.apartments+row.other,0),stats.total);
assert.deepEqual(summarizeCadastruCities(source).byCity,stats.byCity,'city-only summary preserves deduplication and city grouping');
const { byCity, updatedAt: _updatedAt, ...overview } = stats;
const { updatedAt: _overviewUpdatedAt, ...withoutCities } = summarizeCadastruStorage(source,Date.now(),{includeCities:false});
assert.deepEqual(withoutCities,overview,'overview retains every upper statistic without city aggregation');
source.reports[0].incomplete=false;
assert.equal(summarizeCadastruStorage(source).allCategories,1);
const outside=summarizeCadastruStorage({...source,buildings:[{...source.buildings[0],lookup_input:{city:'Bălți'}}]});
assert.equal(outside.coverage.reports.total,0,'reports are only applicable to Chisinau buildings');
const empty=summarizeCadastruStorage({records:[],buildings:[],addresses:[],nearby:[],transport:[],reports:[]});
assert.equal(empty.total,0); assert.equal(empty.fullData,0); assert.deepEqual(empty.byCity,[]);

// Independent queues save secondary datasets before any building exists.
const independent = summarizeCadastruStorage({...source,
  transport: [...source.transport,
    {origin_key:'unlinked',expires_at:future},
    {origin_key:'unlinked',expires_at:future},
    {origin_key:'expired',expires_at:expired},
    {origin_key:'incomplete',expires_at:future,incomplete:true},
    {origin_key:'stale',expires_at:future,stale:true},
  ],
});
assert.deepEqual(independent.storedDatasets.transport,{saved:3,fresh:2},'all distinct saved addresses count, including unlinked and expired snapshots');
assert.deepEqual(independent.coverage.transport,{saved:1,fresh:1,total:1},'building coverage remains a separate measure');
assert.deepEqual(independent.storedDatasets.nearby,{saved:2,fresh:1},'distinct saved lookup addresses retain their individual snapshots');
assert.deepEqual(empty.storedDatasets.transport,{saved:0,fresh:0});
const noBuildings=summarizeCadastruStorage({...source,buildings:[],addresses:[]});
assert.equal(noBuildings.storedDatasets.transport.saved,1,'datasets remain visible with no cadastral buildings');
assert.equal(noBuildings.coverage.transport.total,0);

const regionalStats=summarizeCadastruStorage({records:[{cadastral_number:'0300206.46.01.016',city:'Bălți',result_type:'full_data'}],buildings:[],addresses:[],nearby:[],transport:[],reports:[]});
assert.equal(regionalStats.apartments.total,1,'regional unit identifiers with short parcel segments count as apartments');
assert.equal(regionalStats.byCity[0].apartments,1);

let reads=0,fail=false,rpcFail=false;
const selections=[];
const calls=[];
const tables={cadastru_public_transport:Array.from({length:1002},(_,i)=>({origin_key:`address${i}`,expires_at:future}))};
const inventory={total:100001,fullData:90000,buildings:0,apartments:{total:100000,linked:0,details:90000,references:10000,fresh:90000},other:1,linkedCities:{}};
const cityInventory=[{city:'Test',buildings:0,apartments:100000,other:1}];
const route=await loadAppModule('src/app/api/admin/cadastru-storage/route.js',{
  'next/server':{NextResponse:{json:data=>Response.json(data)}},
  '@/lib/admin-auth':{requireAdminApiAuth:req=>req.authorized?null:new Response(null,{status:401})},
  '@/lib/supabase-admin':{supabaseAdmin:{
    async rpc(name,args){reads++;calls.push({name,args:JSON.parse(JSON.stringify(args))});return {data:args.p_view==='cities'?{byCity:cityInventory}:{...inventory,...(args.p_view==='all'?{byCity:cityInventory}:{})},error:rpcFail?{message:'missing function'}:null};},
    from(table){assert.notEqual(table,'cadastru_records','property rows must be aggregated in Postgres');reads++;return {select(columns){selections.push({table,columns});return this;},order(){return this;},async range(from,to){return {data:(tables[table]||[]).slice(from,to+1),error:fail?{message:'offline'}:null};}};},
  }},
});
const request=(authorized=true,fresh=false,view='all')=>({authorized,nextUrl:new URL(`http://local/?fresh=${fresh?'1':'0'}&view=${view}`)});
assert.equal((await route.GET(request(false))).status,401);
assert.equal(reads,0,'authentication happens before all DB/cache access');
assert.equal((await (await route.GET(request())).json()).total,100001,'database aggregates are returned without downloading property rows');
assert.deepEqual(calls[0],{name:'admin_cadastru_inventory_stats',args:{p_view:'all'}});
const prior=reads;
await route.GET(request()); assert.equal(reads,prior,'five-minute cache retained');
const overviewData=await (await route.GET(request(true,false,'overview'))).json();
assert.equal(overviewData.total,100001);
assert.deepEqual(overviewData.storedDatasets.transport,{saved:1002,fresh:1002},'API counts every page of independent address snapshots');
assert.equal('byCity' in overviewData,false,'overview response excludes the deferred city table');
selections.length=0;
const cities=await (await route.GET(request(true,false,'cities'))).json();
assert.deepEqual(cities.byCity,cityInventory,'city-only request returns complete database aggregates');
assert.deepEqual(selections,[],'city request never downloads inventory or coverage rows');
assert.deepEqual(calls.at(-1),{name:'admin_cadastru_inventory_stats',args:{p_view:'cities'}});
const cachedReads=reads;
await route.GET(request(true,false,'overview'));
await route.GET(request(true,false,'cities'));
assert.equal(reads,cachedReads,'overview and cities retain independent cached responses');
assert.equal((await route.GET(request(false,false,'cities'))).status,401);
assert.equal(reads,cachedReads,'warm city cache still requires authentication');
fail=true;
assert.deepEqual(await (await route.GET(request(true,true))).json(),{available:false},'failed table reads never display false zeros');
fail=false;
rpcFail=true;
assert.deepEqual(await (await route.GET(request(true,true,'overview'))).json(),{available:false},'failed RPC cannot display false totals');
assert.deepEqual(await (await route.GET(request(true,true,'cities'))).json(),{available:false},'city failures cannot look like an empty inventory');
rpcFail=false;
const beforeFresh=reads;
await route.GET(request(true,true,'cities'));
assert(reads>beforeFresh,'hard refresh bypasses the city cache');
console.log('Admin storage overview: totals, coverage, freshness, alias deduplication, pagination, auth and cache passed.');

// Exercise the page's request lifecycle without a server or live database.
const { readFile } = await import('node:fs/promises');
const vm = await import('node:vm');
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const slots=[],effects=[],fetches=[];
let cursor=0,pendingCity=null;
const jsx=(type,props)=>({type,props});
const mocks={
  react:{
    Fragment:'fragment',
    useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;
      return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},
    useCallback(callback){return callback;},
    useEffect(effect){effects.push(effect);},
  },
  'react/jsx-runtime':{jsx,jsxs:jsx},
  '@/components/admin/AdminCadastruOfflineSearch':{default:()=>null},
  '@/components/admin/AdminCadastruAddressReuse':{default:()=>null},
  '@/components/admin/AdminCollectorStatus':{default:()=>null},
};
const uiContext=vm.createContext({Date,fetch:async url=>{
  fetches.push(url);
  if(url.includes('view=cities'))return new Promise(resolve=>{pendingCity=resolve;});
  return Response.json({...overview,updatedAt:new Date().toISOString()});
}});
const transformed=await transform(await readFile('src/app/admin/cadastru/page.js','utf8'),{
  filename:'page.js',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'},
});
const ui=new vm.SourceTextModule(transformed.code,{context:uiContext});
await ui.link(name=>new vm.SyntheticModule(Object.keys(mocks[name]),function(){
  for(const [key,value] of Object.entries(mocks[name]))this.setExport(key,value);
},{context:uiContext}));
await ui.evaluate();
const render=()=>{cursor=0;effects.length=0;return ui.namespace.default();};
const textOf=node=>node==null||typeof node==='boolean'?'':Array.isArray(node)?node.map(textOf).join(' ')
  :typeof node==='object'?textOf(node.props?.children):String(node);
const nodes=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];
const button=(tree,label)=>nodes(tree).find(node=>node.type==='button'&&textOf(node)===label);
const settle=()=>new Promise(setImmediate);
render();
effects[0]();
await settle();
let tree=render();
assert.deepEqual(fetches,['/api/admin/cadastru-storage?view=overview'],'entry loads only the upper overview');
assert(nodes(tree).some(node=>node.type===mocks['@/components/admin/AdminCollectorStatus'].default));
assert(button(tree,'Load cities'));
assert(textOf(tree).includes('address snapshots saved'));
assert(textOf(tree).includes('Apartment-building coverage'));
assert(!nodes(tree).some(node=>node.type==='table'),'city table is deferred');
button(tree,'Hard refresh').props.onClick();
await settle();
tree=render();
assert.equal(fetches.at(-1),'/api/admin/cadastru-storage?view=overview&fresh=1');
assert(!fetches.some(url=>url.includes('view=cities')),'hard refresh never activates an unopened city card');
button(tree,'Load cities').props.onClick();
tree=render();
assert(button(tree,'Loading cities…').props.disabled,'city load button disables while pending');
assert(button(tree,'Refreshing…').props.disabled,'hard refresh cannot overlap a city load');
assert(textOf(tree).includes('Stored data coverage'),'upper overview stays visible during the city request');
pendingCity(new Response(null,{status:503}));
await settle();
tree=render();
assert(button(tree,'Retry'),'city request failure offers retry');
assert(textOf(tree).includes('temporarily unavailable'));
assert(!nodes(tree).some(node=>node.type==='table'),'failed request does not display false empty totals');
button(tree,'Retry').props.onClick();
assert.equal(fetches.at(-1),'/api/admin/cadastru-storage?view=cities&fresh=1','retry bypasses cached failures');
pendingCity(Response.json({available:true,byCity}));
await settle();
tree=render();
assert(nodes(tree).some(node=>node.type==='table'),'city table appears after its explicit request');
assert(textOf(tree).includes('Chișinău'));
const cityRow=nodes(tree).find(node=>node.type==='tr'&&textOf(node).includes('Chișinău'));
cityRow.props.onClick();
tree=render();
assert(nodes(tree).some(node=>node.type===mocks['@/components/admin/AdminCadastruAddressReuse'].default&&node.props.city==='Chișinău'),'city expansion still mounts its address details on demand');
button(tree,'Hard refresh').props.onClick();
assert.deepEqual(fetches.slice(-2),[
  '/api/admin/cadastru-storage?view=overview&fresh=1',
  '/api/admin/cadastru-storage?view=cities&fresh=1',
],'hard refresh reloads both views after cities have been requested');
tree=render();
assert(nodes(tree).some(node=>node.type==='table'),'city rows remain visible while refreshing');
pendingCity(Response.json({available:true,byCity:[]}));
await settle();
tree=render();
assert(textOf(tree).includes('No cadastru data stored yet.'),'successful empty response displays the empty state');
console.log('Admin storage UI: overview-only entry, explicit city loading, loading state, retry, expansion and conditional hard refresh passed.');
