// pnpm exec node --experimental-vm-modules scripts/test-cadastru-manual-entry.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {transform,loadBindings}=require('next/dist/build/swc');await loadBindings();
const {code}=await transform(await fs.readFile('src/components/CadastruSearchForm.js','utf8'),{filename:'CadastruSearchForm.js',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'}});
const walk=n=>Array.isArray(n)?n.flatMap(walk):n&&typeof n==='object'?[n,...walk(n.props?.children)]:[];
async function form({responder,draft}={}) {
 const slots=[],refs=[],mountEffects=[],navigations=[],requests=[],storage=new Map();let cursor=0,refCursor=0;
 const useState=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];};
 const Picker=()=>null,Loading=()=>null;
 const mocks={react:{useState,useRef:v=>{const i=refCursor++;refs[i]??={current:v};return refs[i];},useEffect:fn=>mountEffects.push(fn)},
 'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
 'next/navigation':{useRouter:()=>({push:url=>navigations.push(url)}),useSearchParams:()=>new URLSearchParams('skipcache=true')},
 '@/components/CadastruAddressPicker':{default:Picker},'@/components/CadastruLocalityInput':{default:()=>null},
 '@/components/AuthRequiredModal':{default:()=>null},'@/components/CadastralQuickSearchCard':{default:()=>null},'@/components/CadastruResultLoading':{default:Loading},
 '@/context/LanguageContext':{useTranslation:()=>({lang:'ro',t:key=>key})},'@/context/AuthContext':{useAuth:()=>({isAuthenticated:true,loading:false,clearAuthError(){}})},
 '@/lib/cadastru-supported-cities':{CADASTRU_SUPPORTED_CITIES:['Chișinău','Stăuceni']},
 };
 const context=vm.createContext({URLSearchParams,AbortController,AbortSignal,crypto,console,
 window:{localStorage:{getItem:()=>draft?JSON.stringify({addressForm:draft}):null,setItem(){}},sessionStorage:{setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}},
 fetch:async(url,options)=>{requests.push({url,signal:options.signal});return responder?responder(url,options):Response.json({status:'unresolved',address:{street:'Unknown',road_type:'strada'}});},
 });
 context.localStorage=context.window.localStorage;context.sessionStorage=context.window.sessionStorage;
 const parser=new vm.SourceTextModule(await fs.readFile('src/lib/cadastru-street-input.js','utf8'),{context});await parser.link(()=>{throw Error('Parser must remain client-safe');});
 const m=new vm.SourceTextModule(code,{context});await m.link(name=>{if(name==='@/lib/cadastru-street-input')return parser;const values=mocks[name];assert(values,name);return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate();
 const render=()=>{cursor=0;refCursor=0;return m.namespace.default({allowAnonymousSearch:true});};
 render();const cleanups=mountEffects.splice(0).map(fn=>fn()).filter(fn=>typeof fn==='function');
 const picker=()=>walk(render()).find(n=>n.type===Picker);
 const button=()=>walk(render()).find(n=>n.type==='button'&&n.props.children==='cadastru.searchButton');
 const fill=values=>{const p=picker();p.props.onChange({...p.props.value,...values});};
 return {fill,picker,button,requests,navigations,storage,unmount:()=>cleanups.forEach(fn=>fn()),params:()=>new URL(navigations.at(-1),'http://test').searchParams};
}
const browser=await form({responder:async()=>Response.json({status:'exact',address:{street:'Decebal',road_type:'bulevard'}})});
browser.fill({street:'Decebal',houseNumber:'63',apartmentNumber:'59'});
assert.equal(browser.button().props.disabled,false,'browser autofill must not require selecting our suggestion');
await browser.button().props.onClick();assert.equal(browser.params().get('road_type'),'bulevard');assert.equal(browser.params().get('street'),'Decebal');assert.equal(browser.params().get('house_number'),'63');assert.equal(browser.params().get('apartment_number'),'59');assert.equal(browser.params().get('skipcache'),'true');
const unknown=await form({responder:async()=>{throw Error('autocomplete offline');}});
unknown.fill({street:'șos. Unlisted Road',houseNumber:'45A',apartmentNumber:'2'});assert.equal(unknown.button().props.disabled,false);await unknown.button().props.onClick();assert.equal(unknown.params().get('street'),'Unlisted Road');assert.equal(unknown.params().get('road_type'),'sos');assert.equal(unknown.params().get('house_number'),'45A');
const draft=await form({draft:{city:'Chișinău',street:'Decebal',roadType:'strada',houseNumber:'63',apartmentNumber:'59'},responder:async()=>Response.json({status:'exact',address:{street:'Decebal',road_type:'bulevard'}})});
assert.equal(draft.button().props.disabled,false,'restored drafts must submit without selecting again');await draft.button().props.onClick();assert.equal(draft.params().get('road_type'),'bulevard');
const choices=[{street:'Uzinelor',road_type:'strada',label:'Strada Uzinelor'},{street:'Uzinelor',road_type:'str-la',label:'Stradela Uzinelor'}];
const ambiguous=await form({responder:async()=>Response.json({status:'ambiguous',choices})});
ambiguous.fill({street:'uzinelor',houseNumber:'22/D',apartmentNumber:'9'});
assert.equal(ambiguous.button().props.disabled,false,'manual search does not require selecting a street');
await ambiguous.button().props.onClick();
assert.equal(ambiguous.navigations.length,1,'ambiguous suggestions must not return the user to the form');
assert.equal(ambiguous.params().get('street'),'uzinelor','keep the typed street instead of selecting a suggestion');
assert.equal(ambiguous.params().get('road_type'),'strada');
assert.equal(ambiguous.params().get('house_number'),'22/D');
assert.equal(ambiguous.params().get('apartment_number'),'9');
const selected=await form();selected.fill({street:'Uzinelor',roadType:'str-la',houseNumber:'22/D',apartmentNumber:'9'});
selected.picker().props.onReady(true);await selected.button().props.onClick();
assert.equal(selected.requests.length,0,'selected streets keep the direct search path');
assert.equal(selected.params().get('road_type'),'str-la');
assert.equal(selected.params().get('apartment_number'),'9');
const unavailable=await form({responder:async()=>Response.json({error:'service_unavailable'},{status:503})});
unavailable.fill({street:'uzinelor',houseNumber:'15'});unavailable.picker().props.onReady(false);
assert.equal(unavailable.button().props.disabled,false,'failed suggestions must not disable a filled manual address');
await unavailable.button().props.onClick();assert.equal(unavailable.params().get('street'),'uzinelor');
const blank=await form();assert.equal(blank.button().props.disabled,true);await blank.button().props.onClick();assert.equal(blank.requests.length,0);
let finish;const cancelled=await form({responder:()=>new Promise(resolve=>finish=resolve)});cancelled.fill({street:'Decebal',houseNumber:'63'});const pending=cancelled.button().props.onClick();cancelled.unmount();finish(Response.json({status:'exact',address:{street:'Decebal',road_type:'bulevard'}}));await pending;assert.equal(cancelled.navigations.length,0,'late resolution cannot navigate after leaving the form');
console.log('Manual address search: browser autofill, restored drafts, unlisted streets/outages, explicit road type, non-blocking ambiguity, selected fast path, required fields and cancellation passed.');
