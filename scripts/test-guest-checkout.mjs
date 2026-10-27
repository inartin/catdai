// pnpm exec node --experimental-vm-modules scripts/test-guest-checkout.mjs
// Isolated session, UI and server boundaries. Never contacts Supabase or a bank.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import * as guestCheckout from '../src/lib/guest-checkout.mjs';
import * as upgradeCookie from '../src/lib/guest-upgrade-cookie.mjs';
import { maibProduct } from '../src/lib/maib/products.mjs';
import * as purchase from '../src/lib/maib/purchase.mjs';
import * as paymentResult from '../src/lib/maib/result.mjs';
import { FEATURE_PURCHASE_CONTENT } from '../src/lib/feature-purchase-content.js';
const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const noop = () => {};
const jsx = (type, props) => ({ type, props });
const guestId = crypto.randomUUID(), accountId = crypto.randomUUID();
process.env.SUPABASE_SERVICE_KEY = 'isolated-test-secret';
const guestSession = { access_token: 'guest-token', user: { id: guestId, is_anonymous: true } };
const accountSession = { access_token: 'account-token', user: { id: accountId, email: 'buyer@example.com' } };

async function load(file, mocks, globals = {}) {
  const { code } = await transform(await fs.readFile(file,'utf8'), { filename:file,
    jsc:{ parser:{ syntax:'ecmascript',jsx:true }, transform:{ react:{runtime:'automatic'} } }, module:{type:'es6'} });
  const context = vm.createContext({ console, URL, URLSearchParams, Headers, Request, Response, AbortController, Buffer, Date, process, ...globals });
  const mod = new vm.SourceTextModule(code,{context});
  await mod.link(name => {
    const exports = name === 'react/jsx-runtime' ? { jsx, jsxs:jsx, Fragment:'Fragment' }
      : mocks[name] || (name.startsWith('@/components/') ? { default: name } : null);
    assert(exports,`Missing mock ${name}`);
    return new vm.SyntheticModule(Object.keys(exports),function(){ for(const [key,value] of Object.entries(exports)) this.setExport(key,value); },{context});
  });
  await mod.evaluate(); return mod.namespace;
}
function hooks() {
  const slots = []; let cursor = 0, effects = [];
  return {
    begin() { cursor=0; effects=[]; },
    async flush() { for(const effect of effects) effect(); await new Promise(setImmediate); },
    useState(initial) { const i=cursor++; if(!(i in slots)) slots[i]=typeof initial==='function'?initial():initial;
      return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}]; },
    useRef(initial) { const i=cursor++; return slots[i] ||= {current:initial}; },
    useEffect(fn,deps) { const i=cursor++; if(!slots[i] || deps.some((value,j)=>value!==slots[i][j])) {slots[i]=deps; effects.push(fn);} },
    useMemo: fn=>fn(), useCallback: fn=>fn, createContext:()=>({Provider:'AuthProvider'}), useContext:noop,
  };
}
function find(node,predicate) {
  if(!node || typeof node!=='object') return [];
  if(Array.isArray(node)) return node.flatMap(child=>find(child,predicate));
  return [...(predicate(node)?[node]:[]),...find(node.props?.children,predicate)];
}
for(const path of ['/evaluare?city=Chisinau','/ru/evaluare?type=rent','/anunt?listing_id=1','/calculator?city=Chisinau','/cadastru/rezultat?number=123']) {
  assert.equal(guestCheckout.allowsGuestCheckout({return_to:path}),true);
  assert.equal(guestCheckout.allowsGuestCheckout({return_to:path,checkout_source:'pricing'}),false);
}
for(const path of ['/pricing','/profile','https://evil.test/evaluare','//evil.test/evaluare','/\\evil.test/evaluare','/\n/evaluare',null]) {
  assert.equal(guestCheckout.allowsGuestCheckout({return_to:path}),false);
}
const proof = upgradeCookie.createGuestUpgradeCookie(guestId);
assert.equal(upgradeCookie.readGuestUpgradeCookie(proof),guestId);
assert.equal(upgradeCookie.readGuestUpgradeCookie(proof.replace(guestId,accountId)),null);
assert.equal(upgradeCookie.readGuestUpgradeCookie(`${proof}x`),null);
assert.equal(upgradeCookie.readGuestUpgradeCookie(proof,Date.now()+31*86400000),null);

// A verified anonymous session prepares an HttpOnly proof. A new/existing account
// must have that proof; an order ID or visitor/device ID cannot claim purchases.
let user = null, originAllowed = true, claims = [], registrations = [];
const nextJson = (body,options) => {
  const response = Response.json(body,options); response.savedCookies=[];
  response.cookies={set:(...args)=>response.savedCookies.push(args)}; return response;
};
const upgrade = await load('src/app/api/auth/guest-upgrade/route.js',{
  'next/server':{NextResponse:{json:nextJson}}, '@/lib/guest-upgrade-cookie.mjs':upgradeCookie,
  '@/lib/maib/http':{requestUser:async()=>user,sameOrigin:()=>originAllowed},
  '@/lib/rate-limit':{rateLimit:()=>({check:()=>({allowed:true})})},
  '@/lib/supabase-admin':{supabaseAdmin:{from:()=>({upsert:async row=>{registrations.push(row);return {};}}),
    rpc:async(name,args)=>{assert.equal(name,'claim_guest_checkout');claims.push(args);return {};}}},
});
const req = cookie => { const request=new Request('https://catdai.test/api/auth/guest-upgrade',{method:'POST'});
  request.cookies={get:()=>cookie?{value:cookie}:undefined}; return request; };
assert.equal((await upgrade.POST(req())).status,401);
user=guestSession.user; originAllowed=false;
assert.equal((await upgrade.POST(req())).status,403); assert.equal(registrations.length,0);
originAllowed=true;
const prepared=await upgrade.POST(req()); assert.equal(prepared.status,200);
assert.equal(prepared.savedCookies[0][2].httpOnly,true); assert.equal(prepared.savedCookies[0][2].secure,true);
assert.equal(registrations[0].guest_user_id,guestId);
user=accountSession.user;
await upgrade.POST(req()); assert.equal(claims.length,0);
assert.equal((await upgrade.POST(req(proof+'x'))).status,403); assert.equal(claims.length,0);
const linked=await upgrade.POST(req(proof));
assert.equal(linked.status,200); assert.equal(claims[0].p_guest_id,guestId); assert.equal(claims[0].p_user_id,accountId);
assert.equal(linked.savedCookies[0][2].maxAge,0);

// AuthContext restores the persistent guest session while keeping registered-only
// navigation separate. Google and Telegram both prepare the same ownership proof.
let currentSession = null, callback, authCalls=[], signedIn=0, claimFails=false, reloads=0, anonymousCalls=0;
const oauthRequests=[], authReturns=[];
const storage = new Map();
const browser = { location:{href:'https://catdai.test/evaluare?city=Chisinau',origin:'https://catdai.test',pathname:'/evaluare',search:'?city=Chisinau',hash:'',assign:url=>authCalls.push(url),replace:url=>authReturns.push(url)},
  history:{replaceState:noop},setInterval:()=>1,clearInterval:noop };
browser.location.reload=()=>{reloads++;};
const auth = {
  getSession:async()=>({data:{session:currentSession}}),
  onAuthStateChange:fn=>{callback=fn;return {data:{subscription:{unsubscribe:noop}}};},
  signInAnonymously:async()=>{anonymousCalls++;currentSession=guestSession;await callback('SIGNED_IN',currentSession);return {data:{session:currentSession}};},
  signInWithOAuth:async options=>{oauthRequests.push(options);authCalls.push('oauth');return {data:{url:'https://accounts.google.test/'}};},
  setSession:async()=>{currentSession=accountSession;await callback('SIGNED_IN',currentSession);return {error:null};},
};
async function authHarness() {
  const react=hooks();
  const authModule=await load('src/context/AuthContext.js',{
    react,'@/lib/visitor-browser':{getDeviceId:noop},'@/lib/supabase':{supabase:{auth}},
    '@/lib/tracking':{getActiveAdSource:()=>null,trackAdSourceEvent:()=>{signedIn++;}},
  },{window:browser,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    document:{addEventListener:noop,removeEventListener:noop},fetch:async(url,options)=>{
      if(url==='/api/auth/telegram') return Response.json({session:{access_token:'account-token',refresh_token:'refresh-token'}});
      authCalls.push(options.headers.Authorization);return Response.json({ok:!claimFails},{status:claimFails?503:200});}});
  const render=()=>{react.begin();return authModule.AuthProvider({children:null}).props.value;};
  render(); await react.flush(); return {react,render};
}
let app=await authHarness();
assert.equal(app.render().session,null);
const startup=app.render().continueAsGuest;
const sessions=await Promise.all([startup(),startup()]);
assert.equal(anonymousCalls,1,'simultaneous background startup and Pay share one anonymous sign-in');
assert.equal(sessions[0].session,guestSession); assert.equal(sessions[1].session,guestSession);
assert.equal(app.render().session.user.id,guestId); assert.equal(app.render().isGuest,true); assert.equal(app.render().isAuthenticated,false);
await app.react.flush(); assert.equal(signedIn,0,'guest creation is not reported as registration');
app=await authHarness(); assert.equal(app.render().session.user.id,guestId,'refresh restores the same guest identity');
assert.equal((await app.render().continueAsGuest()).session,guestSession);
assert.equal(anonymousCalls,1,'restored sessions do not create another anonymous user');
await app.render().signInWithGoogle();
assert(authCalls.indexOf('Bearer guest-token')<authCalls.indexOf('oauth'),'prepare proof before leaving for OAuth');
currentSession=accountSession;
claimFails=true;
await callback('SIGNED_IN',accountSession);
assert.equal(app.render().session.user.id,guestId,'failed transfer cannot spend another account credit on the same result');
assert.equal(app.render().guestUpgradeError,true);
claimFails=false;
await app.render().retryGuestUpgrade();
assert.equal(reloads,1,'a successful retry reloads results with the linked account');
await callback('SIGNED_IN',accountSession);
assert.equal(app.render().isAuthenticated,true); assert.equal(app.render().isGuest,false);
assert(authCalls.includes('Bearer account-token'),'claim purchases before exposing the registered session');
const normalAuthCalls=authCalls.length;
await authHarness();
assert.equal(authCalls.length,normalAuthCalls,'ordinary registered-session restores do not depend on guest APIs');

// Both login providers return to the entire checkout selection, including the nested property URL.
function setAuthLocation(path) {
  const url=new URL(path,'https://catdai.test');
  Object.assign(browser.location,{href:url.href,origin:url.origin,pathname:url.pathname,search:url.search,hash:url.hash});
}
const originalTelegramClient=process.env.NEXT_PUBLIC_TELEGRAM_LOGIN_CLIENT_ID;
process.env.NEXT_PUBLIC_TELEGRAM_LOGIN_CLIENT_ID='checkout-test';
browser.Telegram={Login:{auth:(_options,done)=>{setAuthLocation('/');done({id_token:'test-token'});}}};
for(const checkout of ['maib','paddle']) {
  for(const provider of ['Google','Telegram']) {
    const selection=new URLSearchParams({product_key:'cadastru_lookup_single',quantity:'3',lang:'ru',
      return_to:'/ru/cadastru/rezultat?source=address&city=Chișinău&street=Test&house_number=11'});
    const path=`/payment/${checkout}/checkout?${selection}`;
    const previousReturnCount=authReturns.length;
    currentSession=guestSession;storage.clear();setAuthLocation(path);
    app=await authHarness();
    await app.render()[`signInWith${provider}`]();
    if(provider==='Google') {
      assert.equal(oauthRequests.at(-1).options.redirectTo,`https://catdai.test${path}`);
      setAuthLocation('/');currentSession=accountSession;await callback('SIGNED_IN',accountSession);
    }
    assert.equal(authReturns.length,previousReturnCount+1,`${checkout}/${provider}: restore checkout after authentication`);
    assert.equal(authReturns.at(-1),path,`${checkout}/${provider}: preserve product, quantity, language and result destination`);
    assert.equal(app.render().isAuthenticated,true);
  }
}
if(originalTelegramClient===undefined) delete process.env.NEXT_PUBLIC_TELEGRAM_LOGIN_CLIENT_ID;
else process.env.NEXT_PUBLIC_TELEGRAM_LOGIN_CLIENT_ID=originalTelegramClient;

// Contextual checkout starts its guest session automatically; pricing requires a permanent account
// even if a guest session already exists. Only verified paid status auto-returns.
let guestSetups=0;
const unavailableGuest=async()=>{guestSetups++;return {error:Error('Anonymous sign-ins disabled')};};
let paymentAuth={session:null,user:null,loading:false,continueAsGuest:unavailableGuest}, status='pending', redirects=[], clearedRequests=[];
async function paymentHarness(query,result=false,provider='maib') {
  const react=hooks(); const timers=[], fetches=[]; const requestStorage=new Map();
  const language={t:key=>key,lang:'ro',setLang:noop};
  const mod=await load(provider==='paddle'?'src/app/payment/paddle/checkout/page.js':'src/components/MaibPaymentPage.js',{
    react,'next/link':{default:'Link'},'@/context/AuthContext':{useAuth:()=>paymentAuth},
    '@/context/LanguageContext':{useTranslation:()=>language},
    '@/lib/guest-checkout.mjs':guestCheckout,'@/lib/maib/products.mjs':{maibProduct},'@/lib/maib/purchase.mjs':purchase,
    '@/lib/maib/result.mjs':paymentResult,
    '@/lib/feature-purchase-content':{FEATURE_PURCHASE_CONTENT},'@/lib/tracking':{trackPaymentCheckoutEvent:noop},
    '@/lib/payment-urls.mjs':{paymentAppLink:path=>path,paymentSiteOrigin:()=> 'https://catdai.test'},
  },{window:{location:{search:query,replace:url=>redirects.push(url),assign:url=>redirects.push(url)}},crypto,
    sessionStorage:{getItem:key=>requestStorage.get(key),setItem:(key,value)=>requestStorage.set(key,value),removeItem:key=>clearedRequests.push(key)},setTimeout:fn=>{timers.push(fn);return 1;},clearTimeout:noop,
    fetch:async(url,options)=>{fetches.push({url,options});return Response.json(options?.method==='POST'?{order_id:'order',checkout:{url:'https://checkout-sandbox.maib.md/test'}}:{order_id:'order',product_key:'sale_estimate_single',status,grants:{sale_estimate:1},return_to:'/evaluare?city=Chisinau'});},
  });
  const render=()=>{react.begin();return mod.default({result});};
  render();await react.flush();const preparingTree=render();await react.flush();const tree=render();return {tree,preparingTree,timers,fetches,render};
}
const featureQuery='?product_key=sale_estimate_single&return_to=%2Fevaluare%3Fcity%3DChisinau';
let view=await paymentHarness(featureQuery);
assert.equal(find(view.tree,node=>node.type==='button'&&node.props.children==='payment.continueAsGuest').length,0);
assert.equal(find(view.preparingTree,node=>node.type==='input'&&node.props.id==='receipt-email').length,1,'email appears before guest-session initialization finishes');
assert.equal(find(view.preparingTree,node=>node.type==='button'&&node.props.type==='submit').length,1,'Pay is visible immediately');
assert.equal(view.fetches.length,0,'opening checkout never starts a payment');
assert.equal(find(view.tree,node=>node.type==='@/components/AuthOptions').length,0,'feature checkout keeps providers behind the optional sign-in button');
assert.equal(find(view.tree,node=>node.type==='@/components/CheckoutAccountPrompt').length,1,'signed-out feature checkout offers the compact account card');
assert.equal(find(view.tree,node=>node.props?.children==='payment.guestOrLogin').length,0,'feature checkout omits the alternative-login label');
view=await paymentHarness(featureQuery+'&checkout_source=pricing');
assert.equal(find(view.tree,node=>node.type==='button'&&node.props.children==='payment.continueAsGuest').length,0);
assert.equal(find(view.tree,node=>node.type==='@/components/AuthOptions').length,1,'pricing checkout retains login options');
for(const provider of ['maib','paddle']) {
  for(const returnTo of ['/cadastru/rezultat?number=123','/evaluare?city=Chisinau','/ru/evaluare?type=rent','/anunt?listing_id=1','/calculator?city=Chisinau']) {
    const query=`?product_key=sale_estimate_single&return_to=${encodeURIComponent(returnTo)}`;
    const before=guestSetups;
    const feature=await paymentHarness(query,false,provider);
    assert.equal(find(feature.tree,node=>node.type==='@/components/AuthOptions').length,0,`${provider}: feature checkout hides providers until requested`);
    assert.equal(find(feature.tree,node=>node.type==='@/components/CheckoutAccountPrompt').length,1,`${provider}: feature checkout offers optional sign-in`);
    assert.equal(find(feature.tree,node=>node.type==='button'&&node.props.children==='payment.continueAsGuest').length,0,`${provider}: no intermediate guest action`);
    assert.equal(guestSetups,before+1,`${provider}: start one guest session automatically`);
    if(provider==='maib') assert.equal(find(feature.tree,node=>node.type==='form').length,1,'failed guest startup keeps the form visible');
  }
  for(const query of ['?product_key=sale_estimate_single','?product_key=sale_estimate_single&return_to=https%3A%2F%2Fevil.test']) {
    const unknown=await paymentHarness(query,false,provider);
    assert.equal(find(unknown.tree,node=>node.type==='@/components/AuthOptions').length,0,`${provider}: missing context does not expose pricing login`);
  }
  const pricing=await paymentHarness('?product_key=sale_estimate_single&checkout_source=pricing',false,provider);
  assert.equal(find(pricing.tree,node=>node.type==='@/components/AuthOptions').length,1,`${provider}: pricing keeps its required login`);
  assert.equal(find(pricing.tree,node=>node.type==='@/components/CheckoutAccountPrompt').length,0,`${provider}: pricing does not promise optional login`);
  paymentAuth={...paymentAuth,session:accountSession,user:accountSession.user,isGuest:false};
  const registered=await paymentHarness(featureQuery,false,provider);
  assert.equal(find(registered.tree,node=>node.type==='@/components/CheckoutAccountPrompt').length,0,`${provider}: registered buyers do not see the sign-in card`);
  paymentAuth={...paymentAuth,session:null,user:null};
}
paymentAuth.loading=true;
view=await paymentHarness(featureQuery);
assert.equal(find(view.tree,node=>node.type==='form').length,1,'auth loading does not hide the feature payment form');
assert.equal(find(view.tree,node=>node.type==='input'&&node.props.id==='receipt-email')[0].props.disabled,false,'email is editable while auth restores');
paymentAuth.loading=false;
view=await paymentHarness(featureQuery);
find(view.tree,node=>node.type==='input'&&node.props.id==='receipt-email')[0].props.onChange({target:{value:'buyer@example.com'}});
find(view.tree,node=>node.type==='input'&&node.props.type==='checkbox')[0].props.onChange({target:{checked:true}});
await find(view.render(),node=>node.type==='form')[0].props.onSubmit({preventDefault:noop});
assert.equal(view.fetches.length,0,'failed session startup never sends an unauthenticated payment request');
assert.equal(find(view.render(),node=>node.type==='input'&&node.props.id==='receipt-email')[0].props.value,'buyer@example.com','a failed startup keeps the typed email');
let finishSignup;
const guestStartup=new Promise(resolve=>{finishSignup=resolve;});
paymentAuth.continueAsGuest=()=>guestStartup;
view=await paymentHarness(featureQuery);
find(view.tree,node=>node.type==='input'&&node.props.id==='receipt-email')[0].props.onChange({target:{value:'buyer@example.com'}});
find(view.tree,node=>node.type==='input'&&node.props.type==='checkbox')[0].props.onChange({target:{checked:true}});
const submitted=find(view.render(),node=>node.type==='form')[0].props.onSubmit({preventDefault:noop});
assert.equal(view.fetches.length,0,'Pay waits for the already-started guest session');
finishSignup({error:null,session:guestSession}); await submitted;
assert.equal(view.fetches.length,1);
assert.equal(view.fetches[0].options.headers.Authorization,'Bearer guest-token');
assert.equal(JSON.parse(view.fetches[0].options.body).receipt_email,'buyer@example.com');
redirects=[];
paymentAuth.continueAsGuest=unavailableGuest;
paymentAuth={...paymentAuth,session:guestSession,user:guestSession.user,isGuest:true};
view=await paymentHarness(featureQuery+'&checkout_source=pricing');
assert.equal(find(view.tree,node=>node.type==='form').length,0,'existing guest session cannot bypass pricing login');
assert.equal(find(view.tree,node=>node.type==='@/components/AuthOptions').length,1,'existing guests still see pricing login');
view=await paymentHarness(featureQuery);
assert.equal(find(view.tree,node=>node.type==='form').length,1);
assert.equal(find(view.tree,node=>node.type==='@/components/CheckoutAccountPrompt').length,1,'anonymous sessions still see the optional account card');
view=await paymentHarness('?order_id=order',true);
assert.equal(redirects.length,0,'pending or redirect parameters never grant access');
status='paid'; await view.timers[0]();
assert.deepEqual(redirects,['/evaluare?city=Chisinau']);
assert.equal(clearedRequests.at(-1),`catdai:maib:request:${guestId}:sale_estimate_single`,'clear paid request before redirect so a later purchase can create a new order');

// A paid PDF unlock can return full data only for the same authenticated owner,
// valuation criteria and sale/rent type. No additional evaluation credit is used.
const paidEvents=new Map();
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const usageKey=(feature,payload)=>`${feature}:${JSON.stringify(stable(payload))}`;
const pdf=await load('src/lib/pdf-report-access.js',{'@/lib/paid-feature-usage':{
  makePaidFeatureUsageKey:usageKey,getPaidFeatureUsageEvent:async({userId,idempotencyKey})=>paidEvents.get(`${userId}:${idempotencyKey}`),
}});
for(const estimateType of ['sale','rent']) {
  const input={city:'Chisinau',rooms_count:2,area_m2:50,floor:null,total_floors:null,renovation:null,bathrooms_count:null,balconies_count:null,
    ...(estimateType==='rent'?{districts:['Botanica'],building_types:['Secundar']}:{district:'Botanica',building_type:'Secundar'})};
  const params=Object.fromEntries(Object.entries(input).map(([key,value])=>[`p_${key}`,value]));
  const reportKey={input,estimate_type:estimateType,estimate_log_id:'old-log',options:{prices:true}};
  paidEvents.set(`${guestId}:${usageKey('pdf_report',pdf.stablePdfReportKey(reportKey))}`,{id:'paid-pdf'});
  assert.equal(await pdf.authorizedPdfEvaluation({userId:guestId,reportKey,estimateType,params}),true);
  assert.equal(await pdf.authorizedPdfEvaluation({userId:guestId,reportKey:{...reportKey,estimate_log_id:'new-log'},estimateType,params}),true);
  assert.equal(await pdf.authorizedPdfEvaluation({userId:accountId,reportKey,estimateType,params}),false);
  assert.equal(await pdf.authorizedPdfEvaluation({userId:guestId,reportKey,estimateType,params:{...params,p_city:'Balti'}}),false);
  assert.equal(await pdf.authorizedPdfEvaluation({userId:guestId,reportKey,estimateType:estimateType==='sale'?'rent':'sale',params}),false);
}
console.log('Guest checkout: sessions, refresh, contextual/pricing UI, verified payment return, signed account handoff and PDF ownership passed.');
