// Isolated English UI, metadata, payment and migration checks; no external writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-english.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import * as language from '../src/lib/language.js';
import { cadastruValueLabel } from '../src/lib/cadastru-value-labels.js';
import { featureResultPath, allowsGuestCheckout } from '../src/lib/guest-checkout.mjs';
import { maibProductTitle, purchaseMessages } from '../src/lib/maib/purchase.mjs';
import * as resultHelpers from '../src/lib/maib/result.mjs';
import { buildReceipt } from '../src/lib/maib/receipts.mjs';
import { paymentAppLink, featureCheckoutUrl } from '../src/lib/payment-urls.mjs';
const copy = Object.fromEntries(await Promise.all(['ro','ru','en'].map(async lang =>
  [lang, JSON.parse(await fs.readFile(`src/locales/${lang}.json`, 'utf8'))])));
const required = /^(cadastru\.|payment\.|maib\.|form\.cadastral|profile\.paymentProduct\.)/;
for (const [key, value] of Object.entries(copy.ro)) {
  if (!required.test(key)) continue;
  assert(copy.en[key], `Missing English copy: ${key}`);
  assert.deepEqual([...String(copy.en[key]).matchAll(/\{\w+\}/g)].map(x=>x[0]).sort(),
    [...String(value).matchAll(/\{\w+\}/g)].map(x=>x[0]).sort(), `Placeholders: ${key}`);
}
const t = (key, vars = {}) => {
  assert(copy.en[key], `English UI must not fall back to Romanian: ${key}`);
  return Object.entries(vars).reduce((text,[name,value])=>text.replaceAll(`{${name}}`,String(value)), copy.en[key]);
};
assert.equal(language.normalizeLanguage(undefined), 'ro');
assert.equal(language.normalizeLanguage('de'), 'ro');
assert.deepEqual(purchaseMessages('en'), copy.en);
for (const count of [1,2,20]) assert.equal(maibProductTitle('cadastru_lookup_single','en',count,'pricing'), `${count} ${count===1?'use':'uses'}`);
assert.equal(maibProductTitle('cadastru_lookup_single','en'), 'Cadastral data');
const destination='/en/cadastru/rezultat?cadastral_number=0100106.131.01.097&source=number#details';
assert.equal(featureResultPath(destination), destination);
assert(allowsGuestCheckout({return_to:destination}));
assert(!allowsGuestCheckout({return_to:`https://evil.test${destination}`}));
const checkout=new URL(featureCheckoutUrl('cadastru_lookup_single','en',`https://catdai.md${destination}`));
assert.equal(checkout.searchParams.get('lang'),'en');
assert.equal(checkout.searchParams.get('return_to'),destination.split('#')[0]);
assert.equal(resultHelpers.maibResultContext({return_to:destination,grants:{cadastru_lookup:1}}).autoReturnTo,destination);
const retry=new URL(resultHelpers.maibRetryUrl({status:'failed',product_key:'cadastru_lookup_single',return_to:destination,grants:{cadastru_lookup:1}},'en'),'https://catdai.md');
assert.equal(retry.searchParams.get('lang'),'en');
assert.equal(retry.searchParams.get('return_to'),destination);
const receipt=buildReceipt({id:'test',language:'en',receipt_email:'buyer@example.test',paid_at:'2026-10-30T10:00:00Z',product_title:'Cadastral data',product_key:'cadastru_lookup_single',amount_minor:1500,currency_code:'MDL',grants:{cadastru_lookup:1}});
assert.match(receipt.subject,/Payment confirmation/);assert.match(receipt.text,/October/);assert.match(receipt.text,/lang=en/);
assert.equal(cadastruValueLabel('Da','water','en'),'Yes');
assert.equal(cadastruValueLabel('Bloc cu apartamente','classifier','en'),'Apartment building');
assert.equal(cadastruValueLabel('Cărămidă','wall_material','en'),'Brick');
assert.equal(cadastruValueLabel('Da','water','ro'),'Da');
assert.equal(cadastruValueLabel('Official legal text','restrictions','en'),'Official legal text');

const require=createRequire(import.meta.url);
const {transform,loadBindings}=require('next/dist/build/swc');await loadBindings();
let urlLang='en',cookieLang='ru';
const mocks={react:React,'react/jsx-runtime':jsxRuntime,
  'next/headers':{headers:async()=>new Headers(urlLang?{'x-catdai-lang':urlLang}:{}),cookies:async()=>({get:()=>({value:cookieLang})})},
  'next/link':{default:({children,...props})=>React.createElement('a',props,children)},
  '@/context/LanguageContext':{useTranslation:()=>({lang:'en',t}),LanguageProvider:({children})=>children},
  '@/lib/language':language,
  '@/lib/cadastru-value-labels':{cadastruValueLabel},
  '@/lib/maib/purchase.mjs':{maibProductTitle,MAIB_FEATURE_LABELS:{cadastru_lookup:'pricing.featureCadastru'}},
  '@/lib/maib/result.mjs':resultHelpers,'@/lib/payment-urls.mjs':{paymentAppLink},
  ...Object.fromEntries(Object.entries(copy).map(([lang,values])=>[`@/locales/${lang}.json`,{default:values}]))};
async function load(file){
 const {code}=await transform(await fs.readFile(file,'utf8'),{filename:file,jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'automatic'}}},module:{type:'es6'}});
 const context=vm.createContext({Headers,Intl,console});const mod=new vm.SourceTextModule(code,{context});
 await mod.link(name=>{const values=mocks[name]||(name.startsWith('@/components/')?{default:()=>null}:null);assert(values,`Unexpected import ${name}`);
 return new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v);},{context});});
 await mod.evaluate();return mod.namespace;
}
const layout=await load('src/app/cadastru/layout.js');
const resultLayout=await load('src/app/cadastru/rezultat/layout.js');
for(const lang of ['ro','ru','en']){
 urlLang=lang;cookieLang=lang==='ro'?'en':'ro';
 const meta=await layout.generateMetadata();assert.equal(meta.title,copy[lang]['cadastru.metaTitle']);
 assert.equal(meta.alternates.canonical,`/${lang}/cadastru`);assert.equal(meta.openGraph.locale,language.OG_LOCALES[lang]);
 assert.deepEqual(JSON.parse(JSON.stringify(meta.alternates.languages)),language.cadastruLanguageAlternates());
 assert.equal(meta.robots,undefined);
 const result=await resultLayout.generateMetadata();assert.equal(result.robots.index,false);
 assert.equal(result.title,`${copy[lang]['cadastru.resultPageTitle']} | Catdai`);
}
urlLang='';cookieLang='';assert.equal((await layout.generateMetadata()).alternates.canonical,'/ro/cadastru');
assert.equal((await layout.generateMetadata()).robots.index,false);
const card=(await load('src/components/CadastralDataCard.js')).default;
const property={cadastral_number:'0100106.131.01.097',apartment:{address:'Chișinău, str. Test 1',area_m2:52,floor:2,ownership_type:'Privată',toilet:'Da'},building:{classifier:'Bloc cu apartamente',total_floors:5,wall_material:'Cărămidă',water:'Da'},full_access:true};
const html=renderToStaticMarkup(React.createElement(card,{cadastral:property}));
for(const text of ['Cadastral data','Apartment','Building information','Apartment building','Private','Brick','Yes','Chișinău, str. Test 1','0100106.131.01.097'])assert(html.includes(text),text);
const resultCard=(await load('src/components/MaibPaymentResultCard.js')).default;
for(const status of ['paid','pending','failed','canceled','expired','refunded','partially_refunded']){
 for(const count of [1,2]){
 const markup=renderToStaticMarkup(React.createElement(resultCard,{lang:'en',t,order:{order_id:'test',product_key:'cadastru_lookup_single',product_title:'Cadastral data',amount_minor:1500,currency_code:'MDL',status,quantity:count,grants:{cadastru_lookup:count},return_to:destination,paid_at:status==='paid'?'2026-10-30T10:00:00Z':null},onRefresh:()=>{}}));
 assert(markup.includes('Order details'));if(status==='paid')assert(markup.includes(`You purchased ${count} cadastral data unlock${count===1?'':'s'}.`));
 }
}

const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
await db.exec('create schema auth; create table auth.users(id uuid primary key);');
const schema=(await fs.readFile('db/maib_payments.sql','utf8')).match(/create table if not exists public\.maib_payment_orders[\s\S]+?\n\);/)[0].replace("('ro','ru','en')","('ro','ru')");
await db.exec(schema);
const insert=lang=>db.query(`insert into maib_payment_orders(environment,request_key,product_key,amount_minor,grants${lang?',language':''}) values('sandbox',gen_random_uuid(),'cadastru_lookup_single',1500,'{"cadastru_lookup":1}'${lang?',$1':''}) returning language`,lang?[lang]:[]);
assert.equal((await insert()).rows[0].language,'ro');await assert.rejects(insert('en'),/check constraint/);
const migration=await fs.readFile('supabase/migrations/20261030152614_english_maib_payment_language.sql','utf8');
await db.exec(migration);await db.exec(migration);
for(const lang of ['ro','ru','en'])assert.equal((await insert(lang)).rows[0].language,lang);
assert.equal((await insert()).rows[0].language,'ro');await assert.rejects(insert('de'),/check constraint/);
assert.equal((await db.query('select language from maib_payment_orders order by created_at limit 1')).rows[0].language,'ro');await db.close();
console.log('English checks passed: translations, placeholders, metadata, result cards, checkout/return/retry links, receipts and repeatable MAIB language migration.');
