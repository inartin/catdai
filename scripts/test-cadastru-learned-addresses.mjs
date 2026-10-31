import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role;');
await db.exec(await fs.readFile('supabase/migrations/20261031163911_cadastru_learned_addresses.sql','utf8'));
for(const role of ['anon','authenticated']) {
  const {rows:[row]}=await db.query(`select has_table_privilege($1,'cadastru_learned_addresses','select') as r, has_table_privilege($1,'cadastru_learned_addresses','insert') as w, has_function_privilege($1,'learn_cadastru_address(text,jsonb,jsonb,text)','execute') as f`,[role]);
  assert.deepEqual(row,{r:false,w:false,f:false});
}
assert.equal((await db.query("select relrowsecurity from pg_class where relname='cadastru_learned_addresses'")).rows[0].relrowsecurity,true);
const supabaseAdmin={
  async rpc(name,args) { assert.equal(name,'learn_cadastru_address'); await db.query('select learn_cadastru_address($1,$2,$3,$4)',[args.p_key,args.p_original,args.p_target,args.p_identity]); return {error:null}; },
  from(table) {
    assert.equal(table,'cadastru_learned_addresses');
    let values=[],filters=[],update;
    const q={select(){return q;},eq(k,v){assert(['address_key','disabled'].includes(k)); values.push(v);filters.push(`${k}=$${values.length}`);return q;},limit(){return q;},update(v){update=v;return q;},
      async then(resolve,reject){try{ const result=await db.query(`${update?'update':'select * from'} cadastru_learned_addresses ${update?'set disabled=true':''} where ${filters.join(' and ')} ${update?'returning *':''}`,values);resolve({data:result.rows,error:null}); }catch(e){reject(e);} }};
    return q;
  }
};
const original={city:'Sireți',road_type:'bulevard',street:'Stefan cel mare',house_number:'122',search_context:'cadastru'};
const corrected={city:'Sireți',road_type:'strada',street:'Ștefan cel Mare și Sfânt',house_number:'122'};
const payload={source:'geodata_wfs',lands:[{cadastral_number:'8037216.008',address:'sat. Sireți, str. Ștefan cel Mare și Sfânt 122'}],buildings:[{cadastral_number:'8037216.008.01'}]};
let calls=[], mode='suggest', stored=null, credits=0;
const mocks={
 'node:crypto':{default:crypto},
 '@/lib/supabase-admin':{supabaseAdmin},
 '@/lib/runtime-persistence':{shouldPersistRuntimeData:()=>true},
 '@/lib/statistics-context':{withStatisticsContext:f=>f,shouldCollectStatistics:()=>false},
 '@/lib/cadastru-outcome':{withCadastruOutcome:f=>f},
 '@/lib/cadastru-lookup-tracking':{getCadastruLookupTracking:()=>({})},
 '@/lib/cadastru-paid-history':{cadastruPaidHistoryMetadata:()=>({})},
 'next/server':{NextResponse:{json:Response.json}},
 '@/lib/rate-limit':{rateLimit:()=>({check:()=>({allowed:true,remaining:9})})},
 '@/lib/cadastru-external-api':{fetchExternalCadastruAddressData:async body=>{
   calls.push(body);
   if(mode==='fail' || (mode==='suggest'&&body.road_type==='bulevard')) throw Object.assign(new Error('confirm'),{code:mode==='fail'?'service_unavailable':'address_confirmation_required',status:mode==='fail'?503:422,fallbackEligible:true,addressSuggestions:[corrected]});
   if(mode==='conflict' && body.road_type==='strada') return {...payload,lands:[{cadastral_number:'8037216.009'}]};
   return mode==='auto' ? {...payload, parsed_input:{city:'Sireți',roadType:'Strada',streetName:corrected.street,houseNumber:'122',apartment:null}} : payload;
 }},
 '@/lib/cadastru-address-search':{findCadastralByAddress:()=>{throw Error('local disabled');},getVerifiedAddressAlternative:()=>null},
 '@/lib/cadastru-buildings':{getBuildingFallback:()=>null},
 '@/lib/cadastru-preview':{buildCadastruPreviewPayload:p=>p},
 '@/lib/cadastru-search-events':{logCadastruSearchEvent:()=>null},
 '@/lib/cadastru-records':{getCadastruRecordByAddress:async()=>stored,persistCadastruAddressResult:async p=>p},
 '@/lib/cadastru-record-refresh':{scheduleCadastruNumberRefresh:()=>{}},
 '@/lib/cadastru-cache':{cadastruNeedsRefresh:()=>false,withCadastruFreshness:e=>e.payload},
 '@/lib/cadastru-refresh':{scheduleCadastruRefresh:()=>{},isUsableCadastruRefresh:()=>false},
 '@/lib/access-tier':{resolveAccessTier:async()=>({user_id:'test'})},
 '@/lib/paid-feature-usage':{checkFeatureAccess:async()=>({allowed:true}),consumeFeatureCredit:async()=>{credits++;return {allowed:true};},makePaidFeatureUsageKey:()=> 'test'},
};
const context=vm.createContext({console,Date,URL,Request,Response,Headers,Buffer,process:{env:{NODE_ENV:'production',CADASTRU_EXTERNAL_API_SECRET:'test-secret'}}});
const modules=new Map();
async function get(id){
 if(modules.has(id))return modules.get(id);
 let m;
 if(mocks[id])m=new vm.SyntheticModule(Object.keys(mocks[id]),function(){for(const[k,v]of Object.entries(mocks[id]))this.setExport(k,v);},{context});
 else {const file=id.startsWith('@/')?`src/${id.slice(2)}.js`:id; const s=await fs.readFile(file,'utf8');m=file.endsWith('.json')?new vm.SyntheticModule(['default'],function(){this.setExport('default',JSON.parse(s));},{context}):new vm.SourceTextModule(s,{context,identifier:file});}
 modules.set(id,m);return m;
}
const route=await get('src/app/api/cadastru/address/route.js');
await route.link((id,parent)=>get(id.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier),id)):id));await route.evaluate();
const learned=modules.get('@/lib/cadastru-learned-addresses').namespace;
const recovery=modules.get('@/lib/cadastru-suggestion-recovery').namespace;
const request=async body=>{const response=await route.namespace.POST(new Request('https://catdai.test/api/cadastru/address',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()};};
let result=await request(original);assert.equal(result.status,422);assert.deepEqual(result.body.address_suggestions,[corrected]);
const token=result.body.suggestion_recovery_token;assert(token);
assert.equal(await learned.getLearnedAddress(original),null,'suggestions alone never learn');
assert.equal(recovery.readSuggestionRecoveryToken(token+'x',learned.learnedAddress(corrected)),null);
assert.equal(recovery.readSuggestionRecoveryToken(token,learned.learnedAddress({...corrected,house_number:'123'})),null);
result=await request({...corrected,search_context:'cadastru',suggestion_recovery_token:token});assert.equal(result.status,200);
assert(await learned.getLearnedAddress(original));assert.equal(credits,1);
calls=[];result=await request(original);assert.equal(result.status,200);assert.equal(calls.length,1);assert.equal(calls[0].road_type,'strada');assert.equal(result.body.request_address,'Sireți, bd Stefan cel mare 122');assert.equal(result.body.street_resolution.status,'learned');
assert.equal(await learned.getLearnedAddress({...original,house_number:'122/A'}),null);
assert.equal(await learned.getLearnedAddress({...original,apartment_number:'2'}),null);
assert.equal(await learned.getLearnedAddress({...original,city:'Bălți'}),null);
stored={payload};calls=[];result=await request(original);assert.equal(result.status,200);assert.equal(calls.length,0,'learned target reuses canonical snapshot');stored=null;
mode='fail';calls=[];result=await request({...original,skip_cache:true});assert.equal(result.status,503);assert.deepEqual(calls.map(c=>c.road_type),['strada','bulevard']);assert(await learned.getLearnedAddress(original),'outage retains hint');
mode='conflict';calls=[];result=await request(original);assert.equal(result.status,200);assert.deepEqual(calls.map(c=>c.road_type),['strada','bulevard']);assert.equal(await learned.getLearnedAddress(original),null,'conflict disables hint');
const source=learned.learnedAddress(original),target=learned.learnedAddress(corrected);
await learned.learnConfirmedAddress({address:source},target,payload);assert.equal(await learned.getLearnedAddress(original),null,'disabled hints cannot be revived by replay');
await db.exec('truncate cadastru_learned_addresses');
await learned.learnConfirmedAddress({address:source},target,{...payload,registry_unavailable:true});assert.equal(await learned.getLearnedAddress(original),null);
await learned.learnConfirmedAddress({address:{...source,apartmentNumber:'2'}},target,payload);assert.equal((await db.query('select count(*)::int n from cadastru_learned_addresses')).rows[0].n,0);
await Promise.all([learned.learnConfirmedAddress({address:source},target,payload),learned.learnConfirmedAddress({address:source},target,{...payload,lands:[{cadastral_number:'8037216.009'}]})]);
assert.equal(await learned.getLearnedAddress(original),null,'atomic conflicting observations disable learning');
await db.exec('truncate cadastru_learned_addresses');
mode='auto';result=await request(original);assert.equal(result.status,200);assert(await learned.getLearnedAddress(original),'successful worker resolution learns without telemetry or a correction token');
await db.exec("update cadastru_learned_addresses set verified_at=now()-interval '181 days'");
assert.equal(await learned.getLearnedAddress(original),null,'old hint expires');
await db.exec('begin; set local role service_role;');
await db.query('select learn_cadastru_address($1,$2,$3,$4)',['service-test',source,target,'8037216.008']);
await db.exec('rollback');
console.log('Learned addresses: SQL permissions/RLS, signed confirmation, cache reuse, exact scope, retry ordering, outage retention and atomic conflicts passed.');
await db.close();
