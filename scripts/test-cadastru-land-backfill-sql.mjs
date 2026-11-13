import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const root = new URL('../', import.meta.url);
const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role;');
for (const file of ['db/cadastru_records.sql','db/cadastru_address_aliases.sql','supabase/migrations/20261013155148_cadastru_shared_buildings.sql']) {
 await db.exec(await fs.readFile(new URL(file,root),'utf8'));
}
await db.exec(await fs.readFile(new URL('supabase/migrations/20261101163643_collector_land_classification_backfill.sql',root),'utf8'));
const number='3153208.081';
const land={cadastral_number:number,use_mode:'  ',destination:'Existing',notes:'Keep',map_geometry:{type:'Polygon',coordinates:[]}};
const payload={lands:[land,{cadastral_number:'3153208.082'}],buildings:[{cadastral_number:`${number}.01`}],partial:true};
await db.query('insert into cadastru_records(cadastral_number,raw_payload,lookup_count,last_official_fetch_at,next_refresh_after,payload_hash) values ($1,$2,7,$3,$4,$5)',[number,{...land,...payload},'2026-01-01','2026-04-01','old']);
await db.query('insert into cadastru_address_aliases(address_key,raw_payload,fetched_at,expires_at) values ($1,$2,$3,$4)',['test',payload,'2026-01-01','2026-04-01']);
await db.query('insert into cadastru_buildings(cadastral_number,raw_payload,fetched_at,expires_at) values ($1,$2,$3,$4)',[`${number}.01`,payload,'2026-01-01','2026-04-01']);
const call=async(table,key,fields={use_mode:'Orchard',destination:'Agricol'})=>(await db.query('select backfill_cadastru_land_classification($1,$2,$3,$4) result',[table,key,number,fields])).rows[0].result;
for (const [table,key,column] of [['cadastru_records',number,'cadastral_number'],['cadastru_address_aliases','test','address_key'],['cadastru_buildings',`${number}.01`,'cadastral_number']]) {
 const before=(await db.query(`select * from ${table} where ${column}=$1`,[key])).rows[0];
 const result=await call(table,key);
 assert.equal(result.changed,true);
 assert.equal(result.payload.lands[0].use_mode,'Orchard');
 assert.equal(result.payload.lands[0].destination,'Existing');
 assert.deepEqual(result.payload.lands[0].map_geometry,land.map_geometry);
 assert.deepEqual(result.payload.lands[1],payload.lands[1]);
 assert.deepEqual(result.payload.buildings,payload.buildings);
 const after=(await db.query(`select * from ${table} where ${column}=$1`,[key])).rows[0];
 for (const field of Object.keys(before).filter(k=>!['raw_payload','updated_at','payload_hash'].includes(k))) assert.deepEqual(after[field],before[field],field);
 if(table==='cadastru_records') {assert.equal(after.payload_hash,null);assert.equal(after.raw_payload.use_mode,'Orchard');}
 assert.equal((await call(table,key)).changed,false,'replay is idempotent');
}
assert.equal((await call('cadastru_records','missing')).changed,false);
await assert.rejects(call('listing','test'),/Invalid land/);
for(const role of ['anon','authenticated']) assert.equal((await db.query(`select has_function_privilege('${role}','public.backfill_cadastru_land_classification(text,text,text,jsonb)','execute') allowed`)).rows[0].allowed,false);
assert.equal((await db.query("select prosecdef from pg_proc where proname='backfill_cadastru_land_classification'")).rows[0].prosecdef,false);
await db.exec(await fs.readFile(new URL('supabase/migrations/20261112184637_collector_land_evaluation_refresh.sql',root),'utf8'));
const refresh=async(table,key,before,after)=>(await db.query(
 'select merge_cadastru_land_refresh($1,$2,$3,$4) result',[table,key,before,after])).rows[0].result;
for(const [table,key,column] of [['cadastru_records',number,'cadastral_number'],['cadastru_address_aliases','test','address_key'],['cadastru_buildings',`${number}.01`,'cadastral_number']]) {
 const before=(await db.query(`select * from ${table} where ${column}=$1`,[key])).rows[0];
 const updated={...before.raw_payload,lands:before.raw_payload.lands.map((item,index)=>index?item:{...item,slope:'Plana'})};
 assert.equal(await refresh(table,key,before.raw_payload,updated),true);
 assert.equal(await refresh(table,key,before.raw_payload,{discarded:true}),false,'a stale write cannot replace a newer payload');
 const after=(await db.query(`select * from ${table} where ${column}=$1`,[key])).rows[0];
 assert.deepEqual(after.raw_payload,updated);
 for(const field of Object.keys(before).filter(k=>!['raw_payload','updated_at','payload_hash'].includes(k))) assert.deepEqual(after[field],before[field],field);
}
await assert.rejects(refresh('listing','test',{},{}),/Invalid cadastral land refresh/);
for(const [role,allowed] of [['anon',false],['authenticated',false],['service_role',true]]) {
 const {rows}=await db.query("select has_function_privilege($1,'public.merge_cadastru_land_refresh(text,text,jsonb,jsonb)','execute') allowed",[role]);
 assert.equal(rows[0].allowed,allowed,role);
}
assert.equal((await db.query("select prosecdef from pg_proc where proname='merge_cadastru_land_refresh'")).rows[0].prosecdef,false);
console.log('Land refresh SQL passed: row preservation, concurrent writes and service-only permissions.');
await db.close();
