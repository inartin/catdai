// No real emails, bank requests or Supabase connections.
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { receiptConfig, buildReceipt, retryableReceiptError, deliverReceipts } from '../src/lib/maib/receipts.mjs';
import { receiptEmail, maibProductTitle } from '../src/lib/maib/purchase.mjs';
import { MERCHANT } from '../src/lib/merchant.mjs';
import { getCadastruSharePath } from '../src/lib/cadastru-share-url.js';
const config = receiptConfig({ MAIB_SMTP_HOST: 'smtp.example.com', MAIB_SMTP_USER: 'user', MAIB_SMTP_PASSWORD: 'test', MAIB_RECEIPT_FROM: 'receipts@example.com', MAIB_MERCHANT_NAME: 'Test Merchant SRL' });
assert.equal(config.transport.requireTLS,true);assert.equal(config.transport.port,587);
assert.equal(receiptConfig({}),null);
assert.ok(!Object.hasOwn(config,'merchant'),'legacy merchant override is ignored for email branding');
for(const invalid of ['telegram-123@auth.catdai.md','test\r\nBcc: a@example.com','a(comment)@example.com','a..b@example.com','a@example.com,b@example.com']) assert.equal(receiptEmail(invalid),null);
assert.equal(receiptEmail(' buyer+receipt@example.com '),'buyer+receipt@example.com');
const order={id:'00000000-0000-0000-0000-000000000001',environment:'sandbox',language:'ro',product_key:'standard_pack',product_title:maibProductTitle('standard_pack','ro'),amount_minor:9900,currency_code:'MDL',paid_at:'2026-10-05T10:00:00Z',receipt_email:'buyer@example.com',grants:{sale_estimate:2,pdf_report:2},refunded_minor:0};
const languages={
  ro:{subject:'Confirmarea plății - CatDai',quantity:'Cantitate',sandbox:'Mod de test',delivery:'Creditele sunt adăugate',refund:'Sumă rambursată'},
  ru:{subject:'Подтверждение оплаты - CatDai',quantity:'Количество',sandbox:'Тестовый режим',delivery:'После проверки подтверждения maib использования добавляются',refund:'Возвращённая сумма'},
  en:{subject:'Payment confirmation - CatDai',quantity:'Quantity',sandbox:'Test mode',delivery:'Credits are added',refund:'Refunded amount'},
};
const savedUrlEnv={NODE_ENV:process.env.NODE_ENV,MAIB_PUBLIC_URL:process.env.MAIB_PUBLIC_URL};
for(const mode of ['development','production']) for(const [language,copy] of Object.entries(languages)) {
  process.env.NODE_ENV=mode;
  process.env.MAIB_PUBLIC_URL='https://catdai.md';
  const expectedOrigin=mode==='development'?'https://dev.catdai.md':'https://catdai.md';
  const localizedOrder={...order,language,product_title:maibProductTitle('standard_pack',language)};
  const receipt=buildReceipt(localizedOrder);
  assert.equal(receipt.subject,copy.subject);
  assert.ok(!receipt.subject.includes(order.id),'order number stays out of the subject');
  assert.deepEqual(receipt,buildReceipt({...localizedOrder,environment:'production'}),'sandbox uses the exact live receipt content');
  assert.doesNotMatch(`${receipt.subject}\n${receipt.text}`,/[\u2013\u2014]/u,'receipts use normal dashes');
  for(const required of [order.id,'CatDai','99','MDL','2026','Europe/Chisinau',expectedOrigin]) assert.ok(receipt.text.includes(required),required);
  assert.ok(!receipt.text.includes('{merchant}'));
  assert.ok(!receipt.text.includes(MERCHANT.legalName));
  assert.ok(!/Comerciant:|Продавец:/.test(receipt.text));
  const urls=receipt.text.match(/https:\/\/\S+/g);
  assert.equal(urls.length,2);
  assert.ok(urls.every(url=>new URL(url).origin===expectedOrigin),'all receipt links use the payment origin');
  const returnUrl=new URL(urls[1]);
  assert.equal(returnUrl.searchParams.get('order_id'),order.id);
  assert.equal(returnUrl.searchParams.get('lang'),language);
  assert.ok(receipt.text.includes(`${copy.quantity}: 1`));
  assert.ok(!receipt.text.includes(copy.sandbox));
  assert.ok(receipt.text.includes(copy.delivery));
  assert.ok(!receipt.text.includes(`${copy.refund}:`));
  const stream=nodemailer.createTransport({streamTransport:true,buffer:true});
  const rendered=await stream.sendMail({from:{name:'CatDai',address:config.from},to:order.receipt_email,...receipt});
  assert.match(rendered.message.toString(),/^From: CatDai <receipts@example\.com>$/m);
  assert.ok(rendered.message.length>100);assert.ok(rendered.envelope.to.includes(order.receipt_email));stream.close();
}
for(const [language,copy] of Object.entries(languages)) {
  const receipt=buildReceipt({...order,environment:'production',language,refunded_minor:2500});
  assert.ok(!receipt.text.includes(copy.sandbox));
  assert.ok(receipt.text.includes(`${copy.refund}: 25.00 MDL`));
  const bulkReceipt=buildReceipt({...order,language,product_key:'cadastru_lookup_single',product_title:maibProductTitle('cadastru_lookup_single',language,4),amount_minor:9400,grants:{cadastru_lookup:4}});
  assert.ok(bulkReceipt.text.includes(`${copy.quantity}: 4`));
  assert.match(bulkReceipt.text,/94[.,]00 MDL/);
  assert.ok(bulkReceipt.text.includes('× 4'));
  const tierReceipt=buildReceipt({...order,language,product_key:'cadastru_lookup_single',product_title:maibProductTitle('cadastru_lookup_single',language,10),amount_minor:16900,grants:{cadastru_lookup:10}});
  assert.ok(tierReceipt.text.includes(`${copy.quantity}: 10`));
  assert.match(tierReceipt.text,/169[.,]00 MDL/);
}
for(const [key,value] of Object.entries(savedUrlEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
const reportSlug='ab'.repeat(24);
for (const language of ['ro','ru','en']) for (const search_type of ['address','number']) {
  const search_label=search_type==='address'?'Chișinău, bd Decebal 22/A ap 20':'0100106.131.01.020';
  const reportPath=await getCadastruSharePath(reportSlug,language);
  const receipt=buildReceipt({...order,language,product_title:maibProductTitle('cadastru_lookup_single',language),
    cadastru_delivery:{search_type,search_label}},reportPath);
  assert.ok(receipt.text.includes(search_label));
  assert.ok(receipt.text.includes(reportPath));
  assert.ok(receipt.text.includes(order.id));
  assert.doesNotMatch(receipt.text,/\{\w+\}|share_slug|order_id=/,'result email has a public report link, without unresolved copy or a login-only order link');
  assert.doesNotMatch(`${receipt.subject}\n${receipt.text}`,/[\u2013\u2014]/u);
  assert.ok(receipt.text.length<900,'result email remains concise');
  const stream=nodemailer.createTransport({streamTransport:true,buffer:true});
  const mime=await stream.sendMail({from:{name:'CatDai',address:config.from},to:order.receipt_email,...receipt});
  assert.ok(mime.envelope.to.includes(order.receipt_email));
  stream.close();
}
assert.throws(()=>buildReceipt({...order,paid_at:null}));
assert.equal(retryableReceiptError({command:'DATA',code:'ETIMEDOUT'}),false);
assert.equal(retryableReceiptError({command:'AUTH',code:'EAUTH'}),true);
assert.equal(retryableReceiptError({command:'DATA',responseCode:550}),true);

let state, sends, dbCalls, deliveryError, saveError, reportError, published;
function reset() { state={order_id:order.id,status:'pending',attempts:0};sends=0;dbCalls=0;deliveryError=null;saveError=false;reportError=null;published=0;delete order.cadastru_delivery; }
const db={
  async rpc(name,args){dbCalls++;if(name==='publish_maib_cadastru_result'){published++;assert.equal(args.p_order_id,order.id);assert.match(args.p_slug,/^[a-f0-9]{48}$/);return reportError?{error:reportError}:{data:reportSlug};}if(state.status!=='pending')return {data:[]};state.status='sending';state.attempts++;state.lease_token='claim-token';return {data:[{...state}]};},
  from(table){let update;const filters=[];const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},single(){return query;},update(value){update=value;return query;},then(resolve,reject){dbCalls++;if(table==='maib_payment_orders')return Promise.resolve({data:order}).then(resolve,reject);if(saveError)return Promise.resolve({error:Error('DB unavailable after SMTP')}).then(resolve,reject);if(update&&filters.every(([k,v])=>state[k]===v))Object.assign(state,update);return Promise.resolve({data:null}).then(resolve,reject);}};return query;},
};
const createTransport=()=>({async sendMail(mail){sends++;assert.deepEqual(mail.from,{name:'CatDai',address:config.from});assert.ok(!mail.text.includes(MERCHANT.legalName));assert.ok(!mail.text.includes('Test Merchant SRL'));assert.equal(mail.to,order.receipt_email);assert.equal(mail.messageId,`<maib-${order.id}@catdai.md>`);if(order.cadastru_delivery){assert.ok(mail.text.includes('/ro/c/'));assert.ok(mail.text.includes(order.cadastru_delivery.search_label));}if(deliveryError)throw deliveryError;return {accepted:[order.receipt_email]};},close(){}});
reset();assert.equal(await deliverReceipts(db,'sandbox',{config:null,createTransport}),0);assert.equal(dbCalls,0,'missing config does not claim receipts');
reset();assert.equal(await deliverReceipts(db,'sandbox',{config,createTransport}),1);assert.equal(state.status,'sent');assert.ok(state.sent_at);
await deliverReceipts(db,'sandbox',{config,createTransport});assert.equal(sends,1,'sent receipt is not sent twice');
reset();deliveryError=Object.assign(Error('auth'),{command:'AUTH'});await deliverReceipts(db,'sandbox',{config,createTransport});assert.equal(state.status,'failed');assert.ok(Date.parse(state.next_attempt_at)>Date.now());
reset();deliveryError=Object.assign(Error('timeout after DATA'),{command:'DATA'});await deliverReceipts(db,'sandbox',{config,createTransport});assert.equal(state.status,'unknown');await deliverReceipts(db,'sandbox',{config,createTransport});assert.equal(sends,1,'uncertain submission is not retried');
reset();saveError=true;await assert.rejects(deliverReceipts(db,'sandbox',{config,createTransport}));assert.equal(state.status,'sending');assert.equal(sends,1,'failed outcome persistence retains uncertainty');
reset();order.cadastru_delivery={search_type:'number',search_label:'0100106.131.01.020'};
assert.equal(await deliverReceipts(db,'sandbox',{config,createTransport}),1);assert.equal(published,1);
await deliverReceipts(db,'sandbox',{config,createTransport});assert.equal(sends,1,'paid result email is sent once');
reset();order.cadastru_delivery={search_type:'address',search_label:'Chișinău, bd Decebal 22/A'};
reportError=Error('database unavailable');
await deliverReceipts(db,'sandbox',{config,createTransport});assert.equal(state.status,'failed');assert.equal(sends,0,'publication errors retry before contacting SMTP');
reportError=null;state.status='pending';
await deliverReceipts(db,'sandbox',{config,createTransport});assert.equal(state.status,'sent');assert.equal(sends,1);
console.log('MAIB receipt configuration, RO/RU/EN live-content parity, MIME, retry and duplicate-delivery checks passed.');
