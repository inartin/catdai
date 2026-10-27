// pnpm exec node --experimental-vm-modules scripts/test-pdf-authorization.mjs
// Isolated checks: no network, servers, or database writes.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { maibProduct } from '../src/lib/maib/products.mjs';
import { FEATURE_PURCHASE_CONTENT } from '../src/lib/feature-purchase-content.js';
const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const noop = () => null;
const jsx = (type, props) => ({ type, props });
async function load(file, mocks, globals = {}, suffix = '') {
  const { code } = await transform(`${await fs.readFile(file, 'utf8')}\n${suffix}`, {
    filename: file, jsc: { parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' },
  });
  const context = vm.createContext({ console, ...globals });
  const mod = new vm.SourceTextModule(code, { context });
  await mod.link(name => {
    const exports = name === 'react/jsx-runtime' ? { jsx, jsxs: jsx, Fragment: 'Fragment' } : mocks[name];
    assert(exports, `Unexpected import ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await mod.evaluate();
  return mod.namespace;
}

// Exercise the real feature-access orchestration with isolated credit ledgers.
let freeUses = 1, pdfCredits = 0, paidCalls = 0;
const freeEvents = new Set(), paidEvents = new Map();
const payment = await load('src/lib/paid-feature-usage.js', {
  'node:crypto': { default: crypto },
  '@/lib/runtime-persistence': { shouldPersistRuntimeData: () => true },
  '@/lib/payment-products': { isKnownPaymentFeature: key => key === 'pdf_report',
    getFeaturePurchaseOffer: () => ({ product_key: 'pdf_report_single', price_mdl: 15 }) },
  '@/lib/free-monthly-feature-usage': {
    makeMonthlyFeatureUsageKey: (key, payload) => `${key}:${payload.idempotencyKey}`,
    checkFreeMonthlyFeatureUsage: noop,
    consumeFreeMonthlyFeatureUsage: async ({ featureKey, idempotencyKey }) => {
      assert.equal(featureKey, 'pdf_report');
      if (freeEvents.has(idempotencyKey)) return { allowed: true, reason: 'already_consumed' };
      if (!freeUses) return { allowed: false, reason: 'free_monthly_limit_reached' };
      freeEvents.add(idempotencyKey); freeUses--;
      return { allowed: true, source: 'free_monthly' };
    },
  },
  '@/lib/supabase-admin': { supabaseAdmin: {
    from() { let key; const query = { select() { return query; },
      eq(field, value) { if (field === 'idempotency_key') key = value; return query; },
      maybeSingle: async () => ({ data: paidEvents.get(key) || null }) }; return query; },
    async rpc(name, args) {
      assert.equal(name, 'consume_user_credit');
      assert.equal(args.p_feature_key, 'pdf_report'); paidCalls++;
      if (!pdfCredits) return { data: { allowed: false, reason: 'no_credit' } };
      pdfCredits--; paidEvents.set(args.p_idempotency_key, { id: 'pdf-use', source: 'maib' });
      return { data: { allowed: true, remaining_uses: pdfCredits } };
    },
  } },
});
let loggedIn = true;
const pdfAccess = await load('src/lib/pdf-report-access.js', { '@/lib/paid-feature-usage': payment });
const route = await load('src/app/api/pdf-generation-authorizations/route.js', {
  '@/lib/pdf-report-access': pdfAccess,
  'next/server': { NextResponse: { json: (payload, options) => Response.json(payload, options) } },
  '@/lib/access-tier': { resolveAccessTier: async () => ({ user_id: loggedIn ? 'user' : null }) },
  '@/lib/paid-feature-usage': payment,
  '@/lib/rate-limit': { rateLimit: () => ({ check: () => ({ allowed: true }) }) },
});
const request = key => ({ headers: new Headers(), json: async () => ({ report_key: { report: key } }) });
assert.equal((await route.POST(request('first'))).status, 200, 'first PDF uses monthly allowance');
assert.equal(freeUses, 0); assert.equal(paidCalls, 0);
assert.equal((await route.POST(request('first'))).status, 200, 'same free report can be downloaded again');
let denied = await route.POST(request('second'));
assert.equal(denied.status, 402);
assert.equal((await denied.json()).purchase.product_key, 'pdf_report_single');
pdfCredits = 1;
assert.equal((await route.POST(request('second'))).status, 200, 'a new PDF uses a separate PDF credit');
assert.equal(pdfCredits, 0);
const callsAfterPurchase = paidCalls;
assert.equal((await route.POST(request('second'))).status, 200);
assert.equal(paidCalls, callsAfterPurchase, 'repeat paid download does not consume another credit');
assert.equal((await route.POST(request('third'))).status, 402);
loggedIn = false;
assert.equal((await route.POST(request('first'))).status, 401);

// Verify UI stops before rendering/downloading on denied or malformed authorization.
let slots = [], cursor = 0, response, downloads = 0, authPrompts = 0;
const useState = initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
  return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; };
const FeaturePricingAction = () => null;
const dialog = await load('src/components/ValuationPdfDialog.js', {
  react: { useState, useEffect: noop, useMemo: fn => fn() },
  'react-dom': { createPortal: node => node }, qrcode: { default: {} },
  '@/components/icons/CloseIcon': { default: noop }, '@/components/FeaturePricingAction': { default: FeaturePricingAction },
  '@/context/LanguageContext': { useTranslation: () => ({ lang: 'ro', t: key => key }) },
  '@/lib/validation': { validateCadastralNumber: noop },
  '@/lib/tracking': { getDeviceId: noop, getSessionId: noop },
  '@/lib/browser-pdf': { createPdfPageCanvas: noop, PDF_CANVAS_HEIGHT: 1000, PDF_CANVAS_WIDTH: 700,
    downloadCanvasesAsPdf: () => { downloads++; } },
}, { document: { body: {} }, fetch: async (...args) => typeof response==='function'?response(...args):response,
  console: { error: noop } }, 'buildReportCanvases = async () => [];');
function find(node, predicate) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => find(child, predicate));
  return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
}
for (const [token, status, payload, outcome] of [
  [null, 200, { ok: true }, 'auth'], ['token', 401, {}, 'auth'],
  ['token', 402, { error: 'feature_credit_required' }, 'credit'],
  ['token', 200, {}, 'error'], ['token', 503, {}, 'error'], ['token', 200, { ok: true }, 'download'],
]) {
  slots = []; downloads = 0; authPrompts = 0;
  response = { status, ok: status === 200, json: async () => payload };
  const render = () => { cursor = 0; return dialog.default({ open: true, data: {}, accessToken: token,
    onClose: noop, onAuthRequired: () => { authPrompts++; } }); };
  let tree = render();
  const initialOffers = find(tree, node => node.type === FeaturePricingAction);
  assert.equal(initialOffers.length, 1, 'PDF purchase offer appears before clicking download');
  assert.equal(initialOffers[0].props.offer.product_key, 'pdf_report_single');
  assert(find(tree, node => node.type === 'p' && node.props.children === 'result.pdfAccessNote').length,
    'the separate monthly allowance and PDF credit explanation is visible');
  await find(tree, node => node.type === 'button' && node.props.children?.at?.(-1) === 'result.pdfGenerate')[0].props.onClick();
  tree = render();
  assert.equal(downloads, outcome === 'download' ? 1 : 0);
  assert.equal(authPrompts, outcome === 'auth' ? 1 : 0);
  const offer = find(tree, node => node.type === FeaturePricingAction)[0];
  assert(offer, 'purchase offer remains visible after download attempts');
  assert.equal(offer.props.offer.product_key, 'pdf_report_single');
}
for (const full_access of [false,true]) {
  slots=[]; cursor=0; downloads=0; const requested=[];
  response=async(url,options)=>{
    requested.push(url);
    if(url==='/api/pdf-generation-authorizations') return Response.json({ok:true});
    if(url==='/api/pdf-generation-events') return Response.json({ok:true});
    assert.equal(url,'/api/estimate-rent');
    assert.equal(JSON.parse(options.body).pdf_report_key.estimate_type,'rent');
    return Response.json({full_access});
  };
  const tree=dialog.default({open:true,data:{full_access:false,estimate_type:'rent',input:{city:'Chisinau',rooms_count:2}},accessToken:'guest-token',onClose:noop});
  await find(tree,node=>node.type==='button'&&node.props.children?.at?.(-1)==='result.pdfGenerate')[0].props.onClick();
  assert.equal(downloads,full_access?1:0,'never generate a masked paid report');
  assert.deepEqual(requested.slice(0,2),['/api/pdf-generation-authorizations','/api/estimate-rent'],'authorize the PDF before reading its full matching data');
}
const messages = Object.fromEntries(await Promise.all(['ro', 'ru'].map(async lang =>
  [lang, JSON.parse(await fs.readFile(`src/locales/${lang}.json`, 'utf8'))])));
let lang = 'ro';
const pricing = await load('src/components/FeaturePricingAction.js', {
  react: { useState, useEffect: noop, useRef: value => ({ current: value }), useId: () => 'drawer', useSyncExternalStore: () => null },
  'react-dom': { createPortal: node => node },
  '@/lib/feature-purchase-content': { FEATURE_PURCHASE_CONTENT },
  '@/components/FeaturePurchaseBenefits': { default: noop },
  'next/link': { default: 'Link' },
  '@/components/usePaymentProvider': { default: () => 'maib' },
  '@/lib/maib/products.mjs': { maibProduct },
  '@/context/AuthContext': { useAuth: () => ({ loading: false }) },
  '@/context/LanguageContext': { useTranslation: () => ({ lang, t: (key, args = {}) =>
    Object.entries(args).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, replacement), messages[lang][key] || key) }) },
  '@/lib/tracking': { trackPaymentCheckoutEvent: noop },
  '@/lib/payment-urls.mjs': { featureCheckoutUrl: value => value },
});
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join('');
  return typeof node === 'object' ? text(node.props?.children) : String(node);
}
for (lang of ['ro', 'ru']) {
  slots = []; cursor = 0;
  const offer = pricing.default({ offer: { product_key: 'pdf_report_single' } });
  assert.match(text(offer), /15 lei/);
  assert.match(text(offer), new RegExp(messages[lang]['pricing.featurePdf']));
  assert(find(offer, node => node.type === 'button' && !node.props.disabled).length,
    `${lang}: purchase action is available immediately`);
  assert(messages[lang]['result.pdfAccessNote']);
}
console.log('PDF upfront RO/RU price and purchase action, monthly allowance, separate credits, repeat downloads, login and authorization checks passed.');
