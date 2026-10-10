import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { maibProduct, maibOrderQuantity, MAX_SINGLE_QUANTITY } from '../src/lib/maib/products.mjs';
import { MAIB_TERMS_VERSION, receiptEmail, maibProductTitle } from '../src/lib/maib/purchase.mjs';
import * as client from '../src/lib/maib/client.mjs';
import { getPaymentProvider } from '../src/lib/payment-provider.js';
import { encodePaymentCursor, decodePaymentCursor } from '../src/lib/payment-history.js';
import { paymentSiteOrigin, paymentAppLink } from '../src/lib/payment-urls.mjs';
import { getPaddleCheckoutUrl, normalizePaddleLang, buildPaddleCustomerSnapshot, extractPaddleTransactionSummary } from '../src/lib/paddle.js';
process.env.MAIB_ENVIRONMENT='sandbox';
process.env.MAIB_SIGNATURE_KEY='test-signature-key';
process.env.MAIB_CLIENT_ID='test-client'; process.env.MAIB_CLIENT_SECRET='test-secret';
assert.equal(getPaymentProvider(),'maib');
process.env.PAYMENT_PROVIDER='paddle'; assert.equal(getPaymentProvider(),'paddle'); delete process.env.PAYMENT_PROVIDER;
for (const [key,amount,uses] of [['standard_pack',99,2],['pro_pack',199,10],['extra_pack',499,50],['sale_estimate_single',25,1],['rent_estimate_single',25,1],['listing_analysis_single',25,1],['cadastru_lookup_single',25,1],['yield_calculator_single',25,1],['pdf_report_single',25,1]]) {
  const p=maibProduct(key);assert.equal(p.amount_minor,amount*100);assert.equal(p.billingMode,'one_time');
  assert.deepEqual(Object.values(p.grants),Array(key.endsWith('_pack')?6:1).fill(uses));
}
for (const [key, amount, grants] of [
  ['cadastru_lookup_5', 99, { cadastru_lookup: 5 }],
  ['cadastru_lookup_20', 299, { cadastru_lookup: 20 }],
  ['property_combo_1', 59, { cadastru_lookup: 1, sale_estimate: 1, pdf_report: 1 }],
]) {
  const product = maibProduct(key);
  assert.equal(product.amount_minor, amount * 100);
  assert.deepEqual(product.grants, grants);
  for (const lang of ['ro', 'ru']) assert.ok(maibProductTitle(key, lang));
}
for (const [key, count, amount] of [['all_features_5', 5, 99], ['all_features_20', 20, 299]]) {
  const product = maibProduct(key);
  assert.equal(product.amount_minor, amount * 100);
  assert.deepEqual(product.grants, { sale_estimate: count, rent_estimate: count, listing_analysis: count, cadastru_lookup: count, yield_calculator: count, pdf_report: count });
  for (const lang of ['ro', 'ru']) assert.ok(maibProductTitle(key, lang));
}
for(const key of ['__proto__','constructor','',null,{}]) assert.equal(maibProduct(key),null);
for (const key of ['sale_estimate_single','rent_estimate_single','listing_analysis_single','cadastru_lookup_single','yield_calculator_single','pdf_report_single']) {
  for (const [quantity, amount, percent] of [[1,25,0],[2,45,10],[3,65,13],[4,77,23],[5,89,29],[6,105,30],[7,121,31],[8,137,32],[9,153,32],[10,169,32],[11,179,35],[19,259,45],[20,269,46],[21,282.45,46],[25,336.25,46],[100,1345,46]]) {
    const product = maibProduct(key, quantity);
    assert.equal(product.amount_minor, Math.round(amount * 100));
    assert.equal(product.discount_mdl, Math.round((quantity * 25 - amount) * 100) / 100);
    assert.equal(product.discount_percent, percent);
    assert.deepEqual(Object.values(product.grants), [quantity]);
    assert.equal(maibOrderQuantity({ product_key: key, grants: product.grants }), quantity);
  }
}
for (const quantity of [null,0,-1,1.5,'4',NaN,Infinity,MAX_SINGLE_QUANTITY + 1]) assert.equal(maibProduct('cadastru_lookup_single',quantity),null);
assert.equal(maibProduct('all_features_5',2),null,'pack quantity cannot be multiplied with the individual discount');
assert.equal(maibOrderQuantity({product_key:'all_features_5',grants:maibProduct('all_features_5').grants}),1);
for(const path of ['https://evil.test','//evil.test','/\\evil.test','/\n/evil.test']) assert.equal(client.safeReturnTo(path),'/profile');
assert.equal(client.safeReturnTo('/evaluare?test=1#result'),'/evaluare?test=1#result');
assert.equal(client.minorUnits(50.61),5061);
for(const value of [-1,NaN,Infinity,1.001,'20']) assert.throws(()=>client.minorUnits(value));
assert.throws(()=>client.validateCheckoutUrl('https://maib.md.evil.test/checkout'));
const raw='{"orderId":"example"}';const now=Date.now();const timestamp=String(now);
const signature=crypto.createHmac('sha256',process.env.MAIB_SIGNATURE_KEY).update(`${raw}.${timestamp}`).digest('base64');
const headers=new Headers({'X-Signature':`sha256=${signature}`,'X-Signature-Timestamp':timestamp});
assert.equal(client.validSignature(raw,headers,now),true);
assert.equal(client.validSignature(`${raw} `,headers,now),false);
assert.equal(client.validSignature(raw,headers,now+300001),false);
assert.equal(client.validSignature(raw,new Headers({'X-Signature':'sha256=short','X-Signature-Timestamp':timestamp}),now),false);
const id=crypto.randomUUID();const paymentId=crypto.randomUUID();
const order={id,environment:'sandbox',amount_minor:9900,currency_code:'MDL',payment_id:paymentId};
const payment={orderId:id,paymentId,amount:99,currency:'MDL'};
client.validatePayment(order,payment);
for(const change of [{orderId:crypto.randomUUID()},{paymentId:crypto.randomUUID()},{amount:100},{currency:'EUR'}]) assert.throws(()=>client.validatePayment(order,{...payment,...change}));
assert.throws(()=>client.validatePayment({...order,environment:'production'},payment));
const cursor={created_at:'2026-10-02T10:00:00.123456+00:00',id,provider:'maib'};
assert.equal(decodePaymentCursor(encodePaymentCursor(cursor)).at,cursor.created_at,'cursor retains microseconds');
assert.throws(()=>decodePaymentCursor(Buffer.from(JSON.stringify({at:'bad),id.eq.x',id,provider:'maib'})).toString('base64url')));
let authCalls=0, apiCalls=0;
const realFetch=globalThis.fetch;
globalThis.fetch=async (url,options)=>{
  if(url.endsWith('/v2/auth/token')) {authCalls++;assert.equal(JSON.parse(options.body).clientSecret,'test-secret');return Response.json({ok:true,result:{accessToken:`token${authCalls}`,tokenType:'Bearer',expiresIn:300}});}
  assert.equal(options.headers['Content-Type'],undefined,'GET requests have no body content type (MAIB rejects it)');
  apiCalls++; if(apiCalls===1)return Response.json({ok:false},{status:401});
  return Response.json({ok:true,result:{id:'verified'}});
};
assert.equal((await client.maibRequest('/v2/checkouts/test')).id,'verified');
assert.equal(authCalls,2,'one token refresh on explicit 401');
await Promise.all([client.maibRequest('/v2/checkouts/test'),client.maibRequest('/v2/checkouts/test')]);assert.equal(authCalls,2,'token cached');
globalThis.fetch=async()=>Response.json({ok:false,errors:[]},{status:200});
await assert.rejects(client.maibRequest('/v2/checkouts/test'));
globalThis.fetch=async()=>{throw new TypeError('network timeout');};
await assert.rejects(client.maibRequest('/v2/checkouts',{method:'POST',body:{}}),e=>!e.definitive);
globalThis.fetch=realFetch;

// Route boundary checks run with explicit mocks; no network or real database calls.
async function loadRoute(file,mocks) {
  const context=vm.createContext({console:{error(){}},Response,Request,Headers,URL,URLSearchParams,Date,Buffer,process});
  const routeModule=new vm.SourceTextModule(await fs.readFile(file,'utf8'),{context});
  await routeModule.link(name=>{assert.ok(mocks[name],`Missing mock ${name}`); const exports=mocks[name];return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value);},{context});});
  await routeModule.evaluate();return routeModule.namespace;
}
const next={'next/server':{NextResponse:{json:Response.json}}};
const savedUrlEnv = Object.fromEntries(['NODE_ENV','MAIB_PUBLIC_URL','PADDLE_CHECKOUT_URL'].map(key => [key,process.env[key]]));
const http = await loadRoute('src/lib/maib/http.js', {
  ...next, '@/lib/supabase-admin':{supabaseAdmin:{}}, '@/lib/payment-urls.mjs':{paymentSiteOrigin},
});
process.env.NODE_ENV='development';
process.env.MAIB_PUBLIC_URL='https://catdai.md';
process.env.PADDLE_CHECKOUT_URL='https://catdai.md/payment/paddle/checkout?existing=1';
assert.equal(http.paymentOrigin(),'https://dev.catdai.md','development overrides production MAIB URLs');
assert.equal(paymentSiteOrigin('http://localhost:3000'),'https://dev.catdai.md');
assert.equal(paymentAppLink('/profile?tab=transactions'),'https://dev.catdai.md/profile?tab=transactions');
assert.equal(getPaddleCheckoutUrl(),'https://dev.catdai.md/payment/paddle/checkout?existing=1');
delete process.env.PADDLE_CHECKOUT_URL;
assert.equal(getPaddleCheckoutUrl(),'https://dev.catdai.md/payment/paddle/checkout');
process.env.NODE_ENV='production';
assert.equal(http.paymentOrigin(),'https://catdai.md');
process.env.MAIB_PUBLIC_URL='https://payments.catdai.md/base';
assert.equal(http.paymentOrigin(),'https://payments.catdai.md','production keeps configured origin');
assert.equal(paymentAppLink('/profile?tab=transactions'),'/profile?tab=transactions');
assert.equal(getPaddleCheckoutUrl(),null);
process.env.MAIB_PUBLIC_URL='http://untrusted.test';
assert.throws(()=>http.paymentOrigin(),/HTTPS/);
for (const [key,value] of Object.entries(savedUrlEnv)) { if(value===undefined)delete process.env[key];else process.env[key]=value; }
const uuid=/^[\da-f]{8}-[\da-f-]{27}$/i;
let user=null, lookupCount=0, queryUser=null;
const status=await loadRoute('src/app/api/payments/maib/status/route.js',{
  ...next,'@/lib/rate-limit':{rateLimit:()=>({check:()=>({allowed:true})})},
  '@/lib/maib/http':{requestUser:async()=>user,UUID:uuid,paymentError:()=>Response.json({},{status:502})},
  '@/lib/maib/service.mjs':{getOrder:async (key,owner)=>{lookupCount++;queryUser=owner;return null;},publicOrder:x=>x,reconcileOrder:async()=>{throw Error('Unexpected reconciliation');}},
});
const req=new Request(`https://catdai.test/api/payments/maib/status?order_id=${id}`);
assert.equal((await status.GET(req)).status,401);assert.equal(lookupCount,0);
user={id:'authenticated-user'};assert.equal((await status.GET(req)).status,404);assert.equal(queryUser,user.id,'status scopes to authenticated owner');
let allowed=false,origin=false,refundCalls=0;
const refund=await loadRoute('src/app/api/admin/payments/maib/[id]/refund/route.js',{
  ...next,'@/lib/admin-auth':{requireAdminApiAuth:()=>allowed?null:Response.json({},{status:401})},
  '@/lib/maib/http':{UUID:uuid,sameOrigin:()=>origin,paymentError:()=>Response.json({},{status:502})},
  '@/lib/supabase-admin':{supabaseAdmin:{}},
  '@/lib/maib/service.mjs':{checked:async q=>q,getOrder:async()=>order,publicOrder:x=>x,reconcileOrder:async x=>x,requestFullRefund:async()=>{refundCalls++;return {status:'Created'};}},
});
const refundRequest=(body={reason:'Test'})=>new Request('https://catdai.test/api/admin/refund',{method:'POST',body:JSON.stringify(body)});
assert.equal((await refund.POST(refundRequest(),{params:{id}})).status,401);
allowed=true;assert.equal((await refund.POST(refundRequest(),{params:{id}})).status,403);
origin=true;assert.equal((await refund.POST(refundRequest({reason:''}),{params:{id}})).status,400);
assert.equal(refundCalls,0);assert.equal((await refund.POST(refundRequest(),{params:{id}})).status,202);assert.equal(refundCalls,1);
console.log('MAIB client, product, signature, pagination and route boundary checks passed.');

// Refund lifecycle: current payment status and refund status may arrive separately.
let storedOrder, attempts, bankRefundStatus, moneyCalls, completionCalls, refundFailure;
const checkoutId=crypto.randomUUID(), refundId=crypto.randomUUID();
function resetRefundState(status='Requested') {
  storedOrder={...order,checkout_id:checkoutId,status:'paid',refunded_minor:0,paid_at:new Date().toISOString()};
  attempts=status?[{id:crypto.randomUUID(),order_id:id,refund_id:refundId,status,amount_minor:9900}]:[];
  moneyCalls=0;completionCalls=0;refundFailure=null;bankRefundStatus=status;
}
const activeRefunds=['submitting','unknown','Created','Requested','Manual'];
const fakeDb={
  from(table) {
    let update=null, single=false;const filters=[];
    const query={select(){return query;},eq(k,v){filters.push(row=>row[k]===v);return query;},in(k,v){filters.push(row=>v.includes(row[k]));return query;},or(){return query;},update(value){update=value;return query;},maybeSingle(){single=true;return query;},single(){single=true;return query;},
      then(resolve,reject){try{const rows=(table==='maib_payment_orders'?[storedOrder]:attempts).filter(row=>filters.every(f=>f(row)));if(update)for(const row of rows)Object.assign(row,update);return Promise.resolve({data:single?rows[0]||null:rows.map(row=>({...row})),error:null}).then(resolve,reject);}catch(e){return Promise.reject(e).then(resolve,reject);}}};return query;
  },
  async rpc(name,args) {
    if(name==='reserve_maib_refund') {
      if(attempts.some(a=>activeRefunds.includes(a.status)))return {error:Error('Duplicate reservation')};
      const attempt={id:crypto.randomUUID(),order_id:id,status:'submitting',amount_minor:args.p_amount_minor};attempts.push(attempt);return {data:attempt.id};
    }
    if(args.p_status==='refunded') {completionCalls++;storedOrder.status='refunded';storedOrder.refunded_minor=9900;for(const a of attempts)if(activeRefunds.includes(a.status))a.status='Accepted';}
    return {data:null};
  },
};
const service=await loadRoute('src/lib/maib/service.mjs',{
  '../supabase-admin.js':{supabaseAdmin:fakeDb},
  './products.mjs':{maibOrderQuantity},
  './client.mjs':{...client,maibRequest:async(path,options)=>{
    if(path===`/v2/checkouts/${checkoutId}`)return {id:checkoutId,order:{id},currency:'MDL',amount:99,url:`https://checkout-sandbox.maib.md/${checkoutId}`,payment:{paymentId}};
    if(path===`/v2/payments/${paymentId}`)return {...payment,status:'Executed',refundedAmount:0,isRefundable:true,refundableAmount:99,requestedRefundAmount:0};
    if(path===`/v2/payments/refunds/${refundId}`)return {id:refundId,paymentId,currency:'MDL',amount:99,status:bankRefundStatus};
    if(path===`/v2/payments/${paymentId}/refund`) {moneyCalls++;assert.equal(options.body.amount,99);if(refundFailure)throw refundFailure;return {refundId,status:'Created'};}
    throw Error(`Unexpected bank call ${path}`);
  }},
});
for(const state of ['Created','Requested','Rejected','Manual','Accepted']) {
  resetRefundState();bankRefundStatus=state;
  await service.reconcileOrder({...storedOrder});
  assert.equal(attempts[0].status,state);
  assert.equal(completionCalls,state==='Accepted'?1:0,`${state} refund credit revocation`);
}
resetRefundState(null);refundFailure=new TypeError('timeout');
assert.equal((await service.requestFullRefund({...storedOrder},'Test timeout')).status,'unknown');
await assert.rejects(service.requestFullRefund({...storedOrder},'Do not retry'));
assert.equal(moneyCalls,1,'uncertain submission never sends a second refund');
resetRefundState(null);refundFailure=Object.assign(Error('Rejected'),{definitive:true});
await assert.rejects(service.requestFullRefund({...storedOrder},'Definite rejection'));assert.equal(attempts[0].status,'Rejected');
refundFailure=null;assert.equal((await service.requestFullRefund({...storedOrder},'Intentional retry')).status,'Created');
console.log('MAIB pending, accepted, rejected, manual and uncertain-refund checks passed.');

// Shared entry points retain product/language/return path when switching providers.
let redirectedTo;
const entry=await loadRoute('src/app/payment/checkout/page.js',{
  'next/navigation':{redirect:value=>{redirectedTo=value;}},'@/lib/payment-provider':{getPaymentProvider},
  '@/lib/payment-urls.mjs':{paymentAppLink},
});
for(const mode of ['development','production']) for(const provider of ['maib','paddle']) {
  process.env.NODE_ENV=mode;
  process.env.PAYMENT_PROVIDER=provider;
  await entry.default({searchParams:Promise.resolve({product_key:'extra_pack',quantity:'4',lang:'ru',return_to:'/evaluare?a=1',injected:'discard'})});
  const parsed=new URL(redirectedTo,'https://catdai.test');
  assert.equal(parsed.pathname,`/payment/${provider}/checkout`);
  assert.equal(parsed.origin,mode==='development'?'https://dev.catdai.md':'https://catdai.test');
  assert.equal(parsed.searchParams.get('lang'),'ru');assert.equal(parsed.searchParams.get('product_key'),'extra_pack');
  assert.equal(parsed.searchParams.get('quantity'),'4');
  assert.equal(parsed.searchParams.get('return_to'),'/evaluare?a=1');assert.equal(parsed.searchParams.has('injected'),false);
}
delete process.env.PAYMENT_PROVIDER;
let insertSnapshot, existingSnapshot=null, createUser=null, bankCreates=0, bankPayload, expectedBankAmount=99;
const createDb={from(){let single=false;const query={select(){return query;},eq(){return query;},in(){return query;},update(){return query;},insert(row){insertSnapshot={...row,id,created_at:new Date().toISOString(),status:'pending'};return query;},maybeSingle(){return Promise.resolve({data:existingSnapshot});},single(){single=true;return query;},then(resolve,reject){return Promise.resolve({data:single?insertSnapshot:null}).then(resolve,reject);}};return query;}};
const create=await loadRoute('src/app/api/payments/maib/create/route.js',{
  ...next,'@/lib/supabase-admin':{supabaseAdmin:createDb},'@/lib/rate-limit':{rateLimit:()=>({check:()=>({allowed:true})})},
  '@/lib/payment-provider':{getPaymentProvider},'@/lib/maib/products.mjs':{maibProduct,maibOrderQuantity},
  '@/lib/maib/purchase.mjs':{MAIB_TERMS_VERSION,receiptEmail,maibProductTitle},
  '@/lib/maib/client.mjs':{...client,maibRequest:async(path,{body})=>{bankPayload=body;bankCreates++;assert.equal(body.amount,expectedBankAmount);assert.equal(body.currency,'MDL');return {checkoutId,checkoutUrl:`https://checkout-sandbox.maib.md/${checkoutId}`};}},
  '@/lib/maib/service.mjs':{checked:async query=>(await query).data,publicOrder:x=>x},
  '@/lib/maib/http':{UUID:uuid,requestUser:async()=>createUser,paymentOrigin:http.paymentOrigin,paymentError:()=>Response.json({},{status:502})},
});
const createRequest=(payload)=>new Request('https://catdai.test/api/payments/maib/create',{method:'POST',body:JSON.stringify(payload)});
assert.equal((await create.POST(createRequest({}))).status,401);
createUser={id:crypto.randomUUID()};
assert.equal((await create.POST(createRequest({product_key:'invalid',request_key:id}))).status,400);
assert.equal((await create.POST(createRequest({product_key:'standard_pack',request_key:'bad'}))).status,400);
assert.equal(bankCreates,0);
const purchaseBody={product_key:'standard_pack',request_key:id,terms_accepted:true,terms_version:MAIB_TERMS_VERSION,receipt_email:'buyer@example.com'};
for(const invalid of [{terms_accepted:false},{terms_accepted:'true'},{terms_version:'old'},{receipt_email:''},{receipt_email:'telegram-123@auth.catdai.md'},{receipt_email:'a@example.com\r\nBcc: other@example.com'}]) {
  assert.equal((await create.POST(createRequest({...purchaseBody,...invalid}))).status,400);
}
assert.equal(bankCreates,0,'invalid consent or email never contacts the bank');
assert.equal((await create.POST(createRequest({...purchaseBody,amount_minor:1,grants:{sale_estimate:999},return_to:'//evil.test',lang:'ru'}))).status,200);
assert.equal(insertSnapshot.amount_minor,9900);assert.equal(insertSnapshot.return_to,'/profile');assert.equal(insertSnapshot.language,'ru');
assert.deepEqual(insertSnapshot.grants,maibProduct('standard_pack').grants);
assert.equal(insertSnapshot.receipt_email,'buyer@example.com');
assert.equal(insertSnapshot.terms_version,MAIB_TERMS_VERSION);assert.ok(Date.parse(insertSnapshot.terms_accepted_at));
assert.equal(insertSnapshot.product_title,maibProductTitle('standard_pack','ru'));
const publicSnapshot=service.publicOrder({...insertSnapshot,paid_at:'2026-10-05T12:00:00Z'});
assert.equal(publicSnapshot.paid_at,'2026-10-05T12:00:00Z');assert.equal(publicSnapshot.quantity,1);
assert.deepEqual(publicSnapshot.grants,insertSnapshot.grants);assert.equal(publicSnapshot.receipt_email,undefined);
for (const mode of ['development','production']) {
  process.env.NODE_ENV=mode;
  process.env.MAIB_PUBLIC_URL='https://catdai.md';
  assert.equal((await create.POST(createRequest(purchaseBody))).status,200);
  const expectedOrigin=mode==='development'?'https://dev.catdai.md':'https://catdai.md';
  assert.equal(bankPayload.callbackUrl,`${expectedOrigin}/api/maib/callback`);
  assert.equal(bankPayload.successUrl,`${expectedOrigin}/payment/maib/success?order_id=${id}&lang=ro`);
  assert.equal(bankPayload.failUrl,bankPayload.successUrl);
}
expectedBankAmount=59;
assert.equal((await create.POST(createRequest({...purchaseBody,product_key:'property_combo_1',request_key:crypto.randomUUID()}))).status,200);
assert.equal(insertSnapshot.amount_minor,5900);
assert.deepEqual(insertSnapshot.grants,{cadastru_lookup:1,sale_estimate:1,pdf_report:1});
assert.equal(insertSnapshot.product_title,maibProductTitle('property_combo_1','ro'));
for (const key of ['all_features_5', 'all_features_20', 'pdf_report_single']) {
  const product = maibProduct(key);
  expectedBankAmount = product.amount_mdl;
  assert.equal((await create.POST(createRequest({...purchaseBody, product_key:key, request_key:crypto.randomUUID(), grants:{pdf_report:999}, amount_minor:1}))).status,200);
  assert.equal(insertSnapshot.amount_minor, product.amount_minor);
  assert.deepEqual(insertSnapshot.grants, product.grants, 'checkout snapshots server grants for the selected offer');
}
const bulkBody={...purchaseBody,product_key:'cadastru_lookup_single',quantity:4,request_key:crypto.randomUUID(),amount_minor:1,grants:{cadastru_lookup:999}};
expectedBankAmount=77;
assert.equal((await create.POST(createRequest(bulkBody))).status,200);
assert.equal(insertSnapshot.amount_minor,7700);
assert.deepEqual(insertSnapshot.grants,{cadastru_lookup:4});
assert.equal(insertSnapshot.product_title,maibProductTitle('cadastru_lookup_single','ro',4));
assert.equal(service.publicOrder(insertSnapshot).quantity,4);
assert.equal(bankPayload.orderInfo.items[0].amount,77,'bank receives the discounted bundle total');
assert.equal(bankPayload.orderInfo.items[0].quantity,1,'non-uniform unit pricing is submitted as one bundle');
for (const quantity of [null,0,-1,1.5,'4',MAX_SINGLE_QUANTITY + 1]) {
  assert.equal((await create.POST(createRequest({...bulkBody,quantity}))).status,400);
}
assert.equal((await create.POST(createRequest({...purchaseBody,quantity:4}))).status,400,'individual quantities cannot multiply packs');
existingSnapshot={...insertSnapshot,amount_minor:9400};
const bankCreatesBeforeReplay=bankCreates;
const replayResponse=await create.POST(createRequest(bulkBody));
assert.equal(replayResponse.status,200);
assert.equal((await replayResponse.json()).amount_minor,9400,'existing orders retain their original price after a pricing change');
assert.equal(bankCreates,bankCreatesBeforeReplay,'identical bulk request reuses its order');
assert.equal((await create.POST(createRequest({...bulkBody,quantity:3}))).status,409,'a reused request key cannot change quantity');
existingSnapshot=null;
for (const [quantity, amount] of [[1,25],[3,65],[5,89],[10,169],[20,269],[21,282.45],[25,336.25],[100,1345]]) {
  expectedBankAmount=amount;
  assert.equal((await create.POST(createRequest({...bulkBody,quantity,request_key:crypto.randomUUID()}))).status,200);
  assert.equal(insertSnapshot.amount_minor,Math.round(amount * 100),'checkout uses the server price tier');
  assert.deepEqual(insertSnapshot.grants,{cadastru_lookup:quantity});
  assert.equal(service.publicOrder(insertSnapshot).quantity,quantity);
}
let freeDbCalls=0;
const freeUsage=await loadRoute('src/lib/free-monthly-feature-usage.js',{
  'node:crypto':{default:crypto},
  '@/lib/supabase-admin':{supabaseAdmin:{from(){freeDbCalls++;throw Error('Unexpected free usage query');}}},
  '@/lib/runtime-persistence':{shouldPersistRuntimeData:()=>false},
});
assert.equal(freeUsage.getFreeMonthlyFeatureLimit('cadastru_lookup'),1);
assert.equal(freeUsage.getFreeMonthlyFeatureLimit('sale_estimate'),1);
assert.equal((await freeUsage.checkFreeMonthlyFeatureUsage({userId:id,featureKey:'cadastru_lookup',idempotencyKey:'one'})).allowed,true);
assert.equal((await freeUsage.consumeFreeMonthlyFeatureUsage({userId:id,featureKey:'cadastru_lookup',idempotencyKey:'one'})).allowed,true);
assert.equal((await freeUsage.checkFreeMonthlyFeatureUsage({userId:id,featureKey:'sale_estimate',idempotencyKey:'one'})).allowed,true);
assert.equal(freeDbCalls,0,'development mode does not persist free usage');
let freeUses=1, paidUses=2, paidConsumptionCalls=0;
const paidEvents=new Map();
const freeEvents=new Set();
const paidFeature=await loadRoute('src/lib/paid-feature-usage.js',{
  'node:crypto':{default:crypto},
  '@/lib/supabase-admin':{supabaseAdmin:{
    from(table){const filters=new Map();const query={select(){return query;},eq(key,value){filters.set(key,value);return query;},async maybeSingle(){
      if(table==='user_feature_usage_events')return {data:paidEvents.get(filters.get('idempotency_key'))||null,error:null};
      if(table==='user_feature_credit_balances')return {data:{remaining_uses:paidUses,total_granted:2,total_used:2-paidUses},error:null};
      throw Error(`Unexpected table ${table}`);
    }};return query;},
    async rpc(name,args){assert.equal(name,'consume_user_feature_credit');paidConsumptionCalls++;
      const existing=paidEvents.get(args.p_idempotency_key);
      if(existing)return {data:{allowed:true,reason:'already_consumed',source:existing.source,usage_event_id:existing.id,remaining_uses:paidUses},error:null};
      if(paidUses===0)return {data:{allowed:false,reason:'no_credit',remaining_uses:0},error:null};
      paidUses--;const event={id:crypto.randomUUID(),source:'paid_credit'};paidEvents.set(args.p_idempotency_key,event);
      return {data:{allowed:true,reason:'consumed',source:event.source,usage_event_id:event.id,remaining_uses:paidUses},error:null};
    },
  }},
  '@/lib/free-monthly-feature-usage':{
    makeMonthlyFeatureUsageKey:(feature,{idempotencyKey})=>`${feature}:${idempotencyKey}`,
    checkFreeMonthlyFeatureUsage:async({idempotencyKey})=>freeEvents.has(idempotencyKey)?{allowed:true,reason:'already_consumed',source:'free_monthly'}:freeUses>0?{allowed:true,reason:'has_free_credit',remaining_uses:freeUses}:{allowed:false,reason:'free_monthly_limit_reached',remaining_uses:0},
    consumeFreeMonthlyFeatureUsage:async({idempotencyKey})=>{
      if(freeEvents.has(idempotencyKey))return {allowed:true,reason:'already_consumed',source:'free_monthly',remaining_uses:freeUses};
      if(freeUses===0)return {allowed:false,reason:'free_monthly_limit_reached',remaining_uses:0};
      freeEvents.add(idempotencyKey);freeUses--;return {allowed:true,reason:'consumed',source:'free_monthly',remaining_uses:freeUses};
    },
  },
  '@/lib/runtime-persistence':{shouldPersistRuntimeData:()=>true},
  '@/lib/payment-products':{getFeaturePurchaseOffer:()=>({}),isKnownPaymentFeature:()=>true},
});
const featureRequest=key=>({userId:id,featureKey:'sale_estimate',idempotencyKey:key});
assert.equal((await paidFeature.checkFeatureAccess(featureRequest('first'))).reason,'has_free_credit','buyers keep their monthly free use');
assert.equal((await paidFeature.consumeFeatureCredit(featureRequest('first'))).source,'free_monthly');
assert.equal((await paidFeature.consumeFeatureCredit(featureRequest('first'))).reason,'already_consumed','reloading a free result does not spend a paid credit');
assert.equal(paidUses,2,'the monthly use is spent before paid credits');
assert.equal((await paidFeature.checkFeatureAccess(featureRequest('second'))).reason,'has_credit');
assert.equal((await paidFeature.consumeFeatureCredit(featureRequest('second'))).source,'paid_credit');
assert.equal((await paidFeature.consumeFeatureCredit(featureRequest('second'))).reason,'already_consumed');
assert.equal(paidUses,1,'reloading a paid result does not spend another credit');
assert.equal(paidConsumptionCalls,1,'paid idempotency is checked before free usage');
freeUses=1;paidUses=0;freeEvents.clear();
assert.equal((await paidFeature.consumeFeatureCredit(featureRequest('third'))).source,'free_monthly','past purchases do not suppress next month\'s free use');
let reportedFreeEvents=[];
const profileCredits=await loadRoute('src/app/api/profile/credits/route.js',{
  ...next,
  '@/lib/access-tier':{resolveAccessTier:async()=>({user_id:id})},
  '@/lib/free-monthly-feature-usage':{
    FREE_MONTHLY_FEATURE_KEYS:freeUsage.FREE_MONTHLY_FEATURE_KEYS,
    getFreeMonthlyFeatureLimit:freeUsage.getFreeMonthlyFeatureLimit,
    getFreeMonthlyFeatureUsageWindow:freeUsage.getFreeMonthlyFeatureUsageWindow,
  },
  '@/lib/payment-products':{PAYMENT_FEATURE_KEYS:['sale_estimate','cadastru_lookup']},
  '@/lib/supabase-admin':{supabaseAdmin:{from(table){const query={select(){return query;},eq(){return query;},in(){return query;},gte(){return query;},lt(){return query;},then(resolve,reject){
    const data=table==='user_feature_credit_balances'?[{feature_key:'sale_estimate',remaining_uses:2,total_granted:2,total_used:0}]:reportedFreeEvents;
    return Promise.resolve({data,error:null}).then(resolve,reject);
  }};return query;}}},
});
const profilePayload=await (await profileCredits.GET(new Request('https://catdai.test/api/profile/credits'))).json();
const saleFree=profilePayload.freeMonthlyCredits.find(row=>row.featureKey==='sale_estimate');
assert.equal(saleFree.remainingUses,1,'a paid buyer still sees the monthly free use');
assert.equal(saleFree.eligible,true);
assert.equal(profilePayload.freeMonthlyCredits.find(row=>row.featureKey==='cadastru_lookup').totalGranted,1);
reportedFreeEvents=[{feature_key:'sale_estimate'}];
const usedProfilePayload=await (await profileCredits.GET(new Request('https://catdai.test/api/profile/credits'))).json();
assert.equal(usedProfilePayload.freeMonthlyCredits.find(row=>row.featureKey==='sale_estimate').remainingUses,0,'free usage is counted independently of paid credits');
for (const [key,value] of Object.entries(savedUrlEnv)) { if(value===undefined)delete process.env[key];else process.env[key]=value; }
process.env.PAYMENT_PROVIDER='paddle';assert.equal((await create.POST(createRequest({}))).status,409);delete process.env.PAYMENT_PROVIDER;
for(const lang of ['ro','ru']) {
  const messages=JSON.parse(await fs.readFile(`src/locales/${lang}.json`,'utf8'));
  for(const key of ['maib.hosted','maib.oneTime','maib.extraMobileDesc','maib.sandbox','payment.currencyNote.maib','payment.currencyNote.paddle'])assert.ok(messages[key],`${lang}: ${key}`);
}
console.log('MAIB checkout input, login boundary, RO/RU and provider rollback checks passed.');

// Paddle rollback checkout must also stay on the development merchant domain.
const paddleProduct={key:'standard_pack',priceReference:'pri_test',priceId:'pri_test',billingMode:'one_time'};
const paddleDb={auth:{getUser:async()=>({data:{user:{id,email:'buyer@example.com'}}})},from(){const query={insert(){return query;},select(){return query;},single:async()=>({data:{id}}),update(){return query;},eq:async()=>({error:null})};return query;}};
const paddleCreate=await loadRoute('src/app/api/payments/paddle/create/route.js',{
  ...next, '@/lib/payment-provider':{getPaymentProvider}, '@/lib/payment-urls.mjs':{paymentSiteOrigin},
  '@/lib/supabase-admin':{supabaseAdmin:paddleDb}, '@/lib/rate-limit':{rateLimit:()=>({check:()=>({allowed:true})})},
  '@/lib/paddle-products':{getPaddleProduct:()=>paddleProduct,isValidPaddlePriceId:()=>true,resolvePaddleCatalogPrice:async product=>product},
  '@/lib/paddle':{getPaddleCheckoutUrl,normalizePaddleLang,buildPaddleCustomerSnapshot,extractPaddleTransactionSummary,
    createPaddleTransaction:async()=>({raw:{},transaction:{id:'txn_test',items:[{price:{id:'pri_test'}}],checkout:{url:'https://catdai.md/payment/paddle/checkout?_ptxn=txn_test'}}})},
});
process.env.PAYMENT_PROVIDER='paddle';
for (const mode of ['development','production']) {
  process.env.NODE_ENV=mode;
  process.env.PADDLE_CHECKOUT_URL='https://catdai.md/payment/paddle/checkout?existing=1';
  const response=await paddleCreate.POST(new Request('http://localhost:3000/api/payments/paddle/create',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({product_key:'standard_pack',lang:'ru',return_to:'/evaluare?foo=1'})}));
  assert.equal(response.status,200);
  const checkout=new URL((await response.json()).checkout.url);
  assert.equal(checkout.origin,mode==='development'?'https://dev.catdai.md':'https://catdai.md');
  assert.equal(checkout.searchParams.get('order_id'),id);
  assert.equal(checkout.searchParams.get('_ptxn'),'txn_test');
  assert.equal(checkout.searchParams.get('lang'),'ru');
  assert.equal(checkout.searchParams.get('return_to'),'/evaluare?foo=1');
  assert.equal(checkout.searchParams.get('existing'),'1');
}
delete process.env.PAYMENT_PROVIDER;
for (const [key,value] of Object.entries(savedUrlEnv)) { if(value===undefined)delete process.env[key];else process.env[key]=value; }
console.log('Development/production payment origins, MAIB callback/return URLs and Paddle checkout URLs passed.');
