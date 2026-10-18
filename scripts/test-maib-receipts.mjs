// No real emails, bank requests or Supabase connections.
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { receiptConfig, buildReceipt, retryableReceiptError, deliverReceipts } from '../src/lib/maib/receipts.mjs';
import { receiptEmail, maibProductTitle } from '../src/lib/maib/purchase.mjs';
import { MERCHANT } from '../src/lib/merchant.mjs';
const config = receiptConfig({ MAIB_SMTP_HOST: 'smtp.example.com', MAIB_SMTP_USER: 'user', MAIB_SMTP_PASSWORD: 'test', MAIB_RECEIPT_FROM: 'receipts@example.com', MAIB_MERCHANT_NAME: 'Test Merchant SRL' });
assert.equal(config.transport.requireTLS,true);assert.equal(config.transport.port,587);
assert.equal(receiptConfig({}),null);
assert.ok(!Object.hasOwn(config,'merchant'),'legacy merchant override is ignored for email branding');
for(const invalid of ['telegram-123@auth.catdai.md','test\r\nBcc: a@example.com','a(comment)@example.com','a..b@example.com','a@example.com,b@example.com']) assert.equal(receiptEmail(invalid),null);
assert.equal(receiptEmail(' buyer+receipt@example.com '),'buyer+receipt@example.com');
const order={id:'00000000-0000-0000-0000-000000000001',environment:'sandbox',language:'ro',product_key:'standard_pack',product_title:maibProductTitle('standard_pack','ro'),amount_minor:9900,currency_code:'MDL',paid_at:'2026-10-05T10:00:00Z',receipt_email:'buyer@example.com',grants:{sale_estimate:2,pdf_report:2},refunded_minor:0};
const savedUrlEnv={NODE_ENV:process.env.NODE_ENV,MAIB_PUBLIC_URL:process.env.MAIB_PUBLIC_URL};
for(const mode of ['development','production']) for(const language of ['ro','ru']) {
  process.env.NODE_ENV=mode;
  process.env.MAIB_PUBLIC_URL='https://catdai.md';
  const expectedOrigin=mode==='development'?'https://dev.catdai.md':'https://catdai.md';
  const receipt=buildReceipt({...order,language,product_title:maibProductTitle('standard_pack',language)});
  assert.equal(receipt.subject,`${language==='ro'?'Confirmarea plății':'Подтверждение оплаты'} — CatDai — ${order.id}`);
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
  assert.ok(receipt.text.includes(language==='ro'?'Cantitate: 1':'Количество: 1'));
  assert.ok(receipt.text.includes(language==='ro'?'Mod de test':'Тестовый режим'));
  assert.ok(receipt.text.includes(language==='ro'?'Creditele sunt adăugate':'После проверки подтверждения maib использования добавляются'));
  assert.ok(!receipt.text.includes(language==='ro'?'Sumă rambursată:':'Возвращённая сумма:'));
  const stream=nodemailer.createTransport({streamTransport:true,buffer:true});
  const rendered=await stream.sendMail({from:{name:'CatDai',address:config.from},to:order.receipt_email,...receipt});
  assert.match(rendered.message.toString(),/^From: CatDai <receipts@example\.com>$/m);
  assert.ok(rendered.message.length>100);assert.ok(rendered.envelope.to.includes(order.receipt_email));stream.close();
}
for(const language of ['ro','ru']) {
  const receipt=buildReceipt({...order,environment:'production',language,refunded_minor:2500});
  assert.ok(!receipt.text.includes(language==='ro'?'Mod de test':'Тестовый режим'));
  assert.ok(receipt.text.includes(language==='ro'?'Sumă rambursată: 25.00 MDL':'Возвращённая сумма: 25.00 MDL'));
  const bulkReceipt=buildReceipt({...order,language,product_key:'cadastru_lookup_single',product_title:maibProductTitle('cadastru_lookup_single',language,4),amount_minor:9400,grants:{cadastru_lookup:4}});
  assert.ok(bulkReceipt.text.includes(language==='ro'?'Cantitate: 4':'Количество: 4'));
  assert.match(bulkReceipt.text,/94[.,]00 MDL/);
  assert.ok(bulkReceipt.text.includes('× 4'));
  const tierReceipt=buildReceipt({...order,language,product_key:'cadastru_lookup_single',product_title:maibProductTitle('cadastru_lookup_single',language,10),amount_minor:16900,grants:{cadastru_lookup:10}});
  assert.ok(tierReceipt.text.includes(language==='ro'?'Cantitate: 10':'Количество: 10'));
  assert.match(tierReceipt.text,/169[.,]00 MDL/);
}
for(const [key,value] of Object.entries(savedUrlEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
assert.throws(()=>buildReceipt({...order,paid_at:null}));
assert.equal(retryableReceiptError({command:'DATA',code:'ETIMEDOUT'}),false);
assert.equal(retryableReceiptError({command:'AUTH',code:'EAUTH'}),true);
assert.equal(retryableReceiptError({command:'DATA',responseCode:550}),true);

let state, sends, dbCalls, deliveryError, saveError;
function reset() { state={order_id:order.id,status:'pending',attempts:0};sends=0;dbCalls=0;deliveryError=null;saveError=false; }
const db={
  async rpc(){dbCalls++;if(state.status!=='pending')return {data:[]};state.status='sending';state.attempts++;state.lease_token='claim-token';return {data:[{...state}]};},
  from(table){let update;const filters=[];const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},single(){return query;},update(value){update=value;return query;},then(resolve,reject){dbCalls++;if(table==='maib_payment_orders')return Promise.resolve({data:order}).then(resolve,reject);if(saveError)return Promise.resolve({error:Error('DB unavailable after SMTP')}).then(resolve,reject);if(update&&filters.every(([k,v])=>state[k]===v))Object.assign(state,update);return Promise.resolve({data:null}).then(resolve,reject);}};return query;},
};
const createTransport=()=>({async sendMail(mail){sends++;assert.deepEqual(mail.from,{name:'CatDai',address:config.from});assert.ok(!mail.text.includes(MERCHANT.legalName));assert.ok(!mail.text.includes('Test Merchant SRL'));assert.equal(mail.to,order.receipt_email);assert.equal(mail.messageId,`<maib-${order.id}@catdai.md>`);if(deliveryError)throw deliveryError;return {accepted:[order.receipt_email]};},close(){}});
reset();assert.equal(await deliverReceipts(db,'sandbox',{config:null,createTransport}),0);assert.equal(dbCalls,0,'missing config does not claim receipts');
reset();assert.equal(await deliverReceipts(db,'sandbox',{config,createTransport}),1);assert.equal(state.status,'sent');assert.ok(state.sent_at);
await deliverReceipts(db,'sandbox',{config,createTransport});assert.equal(sends,1,'sent receipt is not sent twice');
reset();deliveryError=Object.assign(Error('auth'),{command:'AUTH'});await deliverReceipts(db,'sandbox',{config,createTransport});assert.equal(state.status,'failed');assert.ok(Date.parse(state.next_attempt_at)>Date.now());
reset();deliveryError=Object.assign(Error('timeout after DATA'),{command:'DATA'});await deliverReceipts(db,'sandbox',{config,createTransport});assert.equal(state.status,'unknown');await deliverReceipts(db,'sandbox',{config,createTransport});assert.equal(sends,1,'uncertain submission is not retried');
reset();saveError=true;await assert.rejects(deliverReceipts(db,'sandbox',{config,createTransport}));assert.equal(state.status,'sending');assert.equal(sends,1,'failed outcome persistence retains uncertainty');
console.log('MAIB receipt configuration, RO/RU MIME, retry and duplicate-delivery checks passed.');
