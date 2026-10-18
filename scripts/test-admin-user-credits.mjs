import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
let authorized=true, origin=true, failure=null, calls=[];
const id='12345678-1234-1234-1234-123456789abc';
const mocks={
  'next/server':{NextResponse:{json:Response.json}},
  '@/lib/admin-auth':{requireAdminApiAuth:()=>authorized?null:Response.json({}, {status:401})},
  '@/lib/maib/http':{UUID:/^[\da-f-]{36}$/i,sameOrigin:()=>origin},
  '@/lib/supabase-admin':{supabaseAdmin:{rpc:async(name,args)=>{calls.push({name,args});return {data:[{remaining_uses:7,total_granted:10,total_used:2}],error:failure};}}},
};
const context=vm.createContext({console:{error(){}},Response});
const mod=new vm.SourceTextModule(await fs.readFile('src/app/api/admin/users/[id]/credits/route.js','utf8'),{context});
await mod.link(name=>new vm.SyntheticModule(Object.keys(mocks[name]),function(){for(const [k,v] of Object.entries(mocks[name]))this.setExport(k,v);},{context}));
await mod.evaluate();
const patch=(body,userId=id)=>mod.namespace.PATCH({json:async()=>body},{params:Promise.resolve({id:userId})});
authorized=false;assert.equal((await patch({action:'add',amount:2})).status,401);
authorized=true;origin=false;assert.equal((await patch({action:'add',amount:2})).status,403);origin=true;
for(const body of [{action:'add',amount:0},{action:'remove',amount:-1},{action:'add',amount:1.5},{action:'add',amount:'2'},{action:'add',amount:1001},{action:'set',amount:2},null])assert.equal((await patch(body)).status,400);
assert.equal((await patch({action:'add',amount:2},'bad')).status,400);assert.equal(calls.length,0);
let response=await patch({action:'add',amount:4});assert.equal(response.status,200);
assert.equal(calls.at(-1).name,'adjust_user_credits');assert.equal(calls.at(-1).args.p_delta,4);assert.equal(calls.at(-1).args.p_user_id,id);
assert.deepEqual((await response.json()).sharedCredits,{remainingUses:7,totalGranted:10,totalUsed:2});
await patch({action:'remove',amount:3});assert.equal(calls.at(-1).args.p_delta,-3);
failure={message:'insufficient credits'};assert.equal((await patch({action:'remove',amount:10})).status,409);
failure={message:'database failed'};assert.equal((await patch({action:'add',amount:10})).status,500);
console.log('Admin shared-credit adjustment validation, authorization, origin, balance and error checks passed.');

// Render the actual control and exercise amount validation and both actions.
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const { transform,loadBindings }=require('next/dist/build/swc');
await loadBindings();
let slots=[],cursor=0,requests=[],updates=[];
const jsx=(type,props)=>({type,props});
const uiMocks={
  react:{useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return [slots[index],value=>{slots[index]=value;}];},useRef(initial){const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index];}},
  'react/jsx-runtime':{jsx,jsxs:jsx},
};
const uiContext=vm.createContext({fetch:async(url,options)=>{
  requests.push({url,body:JSON.parse(options.body)});
  return {ok:true,json:async()=>({sharedCredits:{remainingUses:9,totalUsed:2,totalGranted:11}})};
}});
const transformed=await transform(await fs.readFile('src/components/AdminUserCredits.js','utf8'),{
  filename:'AdminUserCredits.js',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'},
});
const ui=new vm.SourceTextModule(transformed.code,{context:uiContext});
await ui.link(name=>new vm.SyntheticModule(Object.keys(uiMocks[name]),function(){for(const [k,v] of Object.entries(uiMocks[name]))this.setExport(k,v);},{context:uiContext}));
await ui.evaluate();
function nodes(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(nodes);return [node,...nodes(node.props?.children)];}
const render=()=>{cursor=0;return nodes(ui.namespace.default({user:{id,sharedCredits:{remainingUses:5,totalUsed:2,totalGranted:7},freeMonthlyCredit:{remainingUses:0}},onUpdate:(...args)=>updates.push(args)}));};
let tree=render();
const button=(label)=>tree.find(node=>node.type==='button'&&node.props.children===label);
tree.find(node=>node.type==='input').props.onChange({target:{value:'6'}});tree=render();
assert.equal(button('Retrage').props.disabled,true);
tree.find(node=>node.type==='input').props.onChange({target:{value:'0'}});tree=render();
assert.equal(button('Adaugă').props.disabled,true);
tree.find(node=>node.type==='input').props.onChange({target:{value:'3'}});tree=render();
await button('Adaugă').props.onClick();
assert.deepEqual(requests.at(-1).body,{action:'add',amount:3});
assert.equal(updates.at(-1)[0],id);assert.equal(updates.at(-1)[1].remainingUses,9);
tree=render();await button('Retrage').props.onClick();
assert.deepEqual(requests.at(-1).body,{action:'remove',amount:3});
console.log('Admin credit control rendering, input validation, add/remove requests and balance updates passed.');
