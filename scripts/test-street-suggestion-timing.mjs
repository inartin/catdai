// pnpm exec node --experimental-vm-modules scripts/test-street-suggestion-timing.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {transform,loadBindings}=require('next/dist/build/swc');await loadBindings();
const {code}=await transform(await fs.readFile('src/components/CadastruAddressPicker.js','utf8'),{
 filename:'CadastruAddressPicker.js',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'},
});
const hooks=[],timers=new Map(),requests=[];let cursor=0,dirty=true,tree,clock=0,timerId=0,effects=[];
const useState=initial=>{const i=cursor++;hooks[i]??={value:typeof initial==='function'?initial():initial};return [hooks[i].value,next=>{const value=typeof next==='function'?next(hooks[i].value):next;if(!Object.is(value,hooks[i].value)){hooks[i].value=value;dirty=true;}}];};
const useRef=initial=>{const i=cursor++;hooks[i]??={current:initial};return hooks[i];};
const useEffect=(fn,deps)=>{const i=cursor++,previous=hooks[i];if(!previous||deps.some((v,j)=>!Object.is(v,previous.deps[j]))){hooks[i]={deps,cleanup:previous?.cleanup};effects.push(()=>{hooks[i].cleanup?.();hooks[i].cleanup=fn();});}};
const jsx=(type,props)=>({type,props});
const context=vm.createContext({URLSearchParams,AbortController,console,
 Date:class extends Date{static now(){return clock;}},document:{getElementById:()=>null},
 setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,at:clock+delay});return timerId;},clearTimeout:id=>timers.delete(id),
 fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,signal:options.signal,resolve,reject})),
});
const m=new vm.SourceTextModule(code,{context});
await m.link(name=>{const values=name==='react'?{useState,useEffect,useRef}:{jsx,jsxs:jsx,Fragment:'fragment'};return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v);},{context});});await m.evaluate();
let value={city:'Chișinău',street:'',roadType:'strada',houseNumber:'',apartmentNumber:''};
const onChange=next=>{value=next;dirty=true;};const onReady=()=>{};
function flush(){let rounds=0;while(dirty){assert(++rounds<20,'effects must settle');dirty=false;cursor=0;effects=[];tree=m.namespace.default({value,onChange,onReady,lang:'ro',t:k=>k});for(const effect of effects)effect();}}
const walk=n=>Array.isArray(n)?n.flatMap(walk):n&&typeof n==='object'?[n,...walk(n.props?.children)]:[];
const field=()=>walk(tree).find(n=>n.props?.id==='address-street');
const options=()=>walk(tree).filter(n=>n.props?.role==='option');
const type=text=>{field().props.onChange({target:{value:text}});flush();};
async function settle(){for(let i=0;i<8;i++)await Promise.resolve();flush();}
async function advance(ms){clock+=ms;for(const [id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);void timer.fn();}await settle();}
const dacia={street:'Dacia',road_type:'bulevard',label:'Bulevardul Dacia'};
const darwin={street:'Charles Darwin',road_type:'strada',label:'Strada Charles Darwin'};
flush();type('da');await advance(79);assert.equal(requests.length,0);await advance(1);assert.equal(requests.length,1);
requests[0].resolve(Response.json({streets:[dacia,darwin]}));await settle();assert.equal(options().length,2);
type('dac');assert.equal(options().length,2,'typing retains the current dropdown');await advance(80);assert.equal(requests.length,2);
type('daci');assert.equal(requests[1].signal.aborted,true,'superseded requests abort immediately');assert.equal(options().length,2);
await advance(80);assert.equal(requests.length,3);
requests[1].resolve(Response.json({streets:[{street:'Wrong old response',road_type:'strada',label:'Wrong old response'}]}));await settle();assert.equal(options().length,2,'late old responses cannot replace current suggestions');
requests[2].resolve(Response.json({streets:[dacia]}));await settle();assert.equal(options().length,1);
type('da');assert.equal(options().length,2,'backspacing restores cached options immediately');await advance(100);assert.equal(requests.length,3,'cached queries need no request');
type('zz');assert.equal(options().length,2);await advance(80);requests[3].resolve(Response.json({streets:[]}));await settle();assert.equal(options().length,0,'a completed empty response hides the dropdown');
type('da');assert.equal(options().length,2);value={...value,city:'Stăuceni'};dirty=true;flush();assert.equal(options().length,0,'a locality change clears the old city results');
await advance(80);assert.equal(new URL(requests[4].url,'http://test').searchParams.get('city'),'Stăuceni');requests[4].reject(Error('offline'));await settle();assert.equal(options().length,0);
value={...value,city:'Chișinău'};dirty=true;flush();assert.equal(options().length,2,'cache remains locality scoped');
type('dacia');await advance(80);requests[5].reject(Error('offline'));await settle();assert.equal(options().length,2,'transient failures preserve prior suggestions');
type('');assert.equal(options().length,0,'clearing input clears the dropdown immediately');
console.log('Street suggestion timing: 80 ms debounce, retained results, immediate cached backspace, stale-response rejection, empty results and locality isolation passed.');
