// Real route + PostgreSQL credit/transfer/history checks. No network or live writes.
// pnpm exec node --experimental-vm-modules scripts/test-guest-cadastru-results.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import * as validation from '../src/lib/validation.js';
import * as paidHistory from '../src/lib/cadastru-paid-history.js';
import * as sharedBalances from '../src/lib/shared-credit-balance.mjs';

const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role;');
for (const file of ['paynet_payments.sql','paddle_payments.sql','maib_payments.sql']) {
  await db.exec((await fs.readFile(`db/${file}`, 'utf8')).replaceAll('create extension if not exists pgcrypto;', ''));
}
await db.exec(await fs.readFile('supabase/migrations/20261017141519_universal_paid_credits.sql','utf8'));
await db.exec(await fs.readFile('supabase/migrations/20261026194452_guest_feature_checkout.sql','utf8'));
let userId, payload, analyticsCalls = 0, creditCalls = 0;
const analyticsRows = [];
const number = '0100104.003.01.012';
const address = { city: 'Chișinău', road_type: 'strada', street: 'Valea Trandafirilor', house_number: '11', search_context: 'cadastru' };

// The profile executes its real owner/filter/pagination logic against persisted usage rows.
const admin = { from(table) {
  const filters = []; let limit = Infinity, descending = false;
  const query = {
    select() { return query; }, eq(key,value) { filters.push(row => row[key] === value); return query; },
    in(key,values) { filters.push(row => values.includes(row[key])); return query; },
    is(key,value) { filters.push(row => (row[key] ?? null) === value); return query; },
    lt(key,value) { filters.push(row => row[key] < value); return query; },
    order() { descending = true; return query; }, limit(value) { limit = value; return query; },
    async then(resolve,reject) {
      try {
        let rows = table === 'user_feature_usage_events' ? await q('select * from user_feature_usage_events')
          : table === 'user_feature_credit_balances' ? await q('select * from user_feature_credit_balances')
          : table === 'cadastru_search_events' ? analyticsRows : [];
        rows = rows.filter(row => filters.every(filter => filter(row)));
        if (descending) rows.sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at));
        return resolve({ data: rows.slice(0,limit), error: null });
      } catch (error) { return reject(error); }
    },
  }; return query;
} };
const check = async args => {
  const previous = await q('select id from user_feature_usage_events where user_id=$1 and feature_key=$2 and idempotency_key=$3', [args.userId,args.featureKey,args.idempotencyKey]);
  if (previous.length) return { allowed: true, reason: 'already_consumed' };
  const [balance] = await q('select * from user_credit_balances where user_id=$1', [args.userId]);
  return { allowed: balance?.remaining_uses > 0, reason: 'no_credit' };
};
const mocks = {
  'next/server': { NextResponse: { json: Response.json } },
  '@/lib/access-tier': { resolveAccessTier: async () => ({ tier: 'free', user_id: userId, is_guest: true }) },
  '@/lib/supabase-admin': { supabaseAdmin: admin },
  '@/lib/statistics-context': { withStatisticsContext: fn => fn },
  '@/lib/cadastru-outcome': { withCadastruOutcome: fn => fn },
  '@/lib/cadastru-lookup-tracking': { getCadastruLookupTracking: body => ({ lookupId: body.lookup_id }) },
  '@/lib/cadastru-paid-history': paidHistory,
  '@/lib/shared-credit-balance.mjs': sharedBalances,
  '@/lib/evaluation-snapshots': { PAID_EVALUATION_FEATURE_KEYS: ['sale_estimate','rent_estimate'], normalizePaidEvaluationSnapshot: () => null },
  '@/lib/free-monthly-feature-usage': { FREE_MONTHLY_FEATURE_KEYS: ['cadastru_lookup'] },
  '@/lib/payment-products': { PAYMENT_FEATURE_KEYS: ['cadastru_lookup'] },
  '@/lib/rate-limit': { rateLimit: () => ({ check: () => ({ allowed: true, remaining: 10 }) }) },
  '@/lib/validation': validation,
  '@/lib/cadastru-street-suggestions': { suggestRoadTypes: () => [], suggestStreets: () => [] },
  '@/lib/cadastru-suggestion-recovery': { createSuggestionRecoveryToken: () => null, readSuggestionRecoveryToken: () => null, recordSuggestionRecovery: async () => {} },
  '@/lib/cadastru-streets/street-resolver': { inspectStreetAddress: () => ({ status: 'clean' }), resolveStreet: args => ({ street: args.street, status: 'exact' }) },
  '@/lib/cadastru-external-api': { fetchExternalCadastruAddressData: async () => { throw Error('Unexpected worker lookup'); }, fetchExternalCadastralData: async () => { throw Error('Unexpected worker lookup'); } },
  '@/lib/cadastru-address-search': { findCadastralByAddress: async () => null, getVerifiedAddressAlternative: () => null, fetchCadastruDetailData: async () => null },
  '@/lib/cadastru-buildings': { getBuildingFallback: () => null },
  '@/lib/cadastru-preview': { buildCadastruPreviewPayload: () => ({ locked_sections: { cadastru_details: true } }) },
  '@/lib/cadastru-search-events': { logCadastruSearchEvent: async () => { analyticsCalls++; return null; } },
  '@/lib/cadastru-records': { getCadastruRecordByAddress: async () => ({ payload, lookupSource: 'api' }), getCadastruRecordByNumber: async () => ({ payload, lookupSource: 'api' }), persistCadastruAddressResult: async value => value, persistCadastruRecord: async () => null },
  '@/lib/cadastru-record-refresh': { scheduleCadastruNumberRefresh: () => {} },
  '@/lib/cadastru-cache': { cadastruNeedsRefresh: () => false, withCadastruFreshness: row => row.payload, cadastruExpiresAt: () => null, writeCadastruCache: async () => {}, cleanCadastruPayload: value => value },
  '@/lib/cadastru-refresh': { scheduleCadastruRefresh: () => {}, isUsableCadastruRefresh: () => true },
  '@/lib/cadastru-supported-cities': { CADASTRU_SUPPORTED_CITIES: ['Chișinău'], resolveCadastruSupportedCity: city => city },
  '@/lib/paid-feature-usage': {
    checkFeatureAccess: check,
    makePaidFeatureUsageKey: (feature, input) => `paid:${feature}:${JSON.stringify(input)}`,
    consumeFeatureCredit: async args => {
      creditCalls++;
      const [row] = await q('select * from consume_user_credit($1,$2,$3,$4)', [args.userId,args.featureKey,args.idempotencyKey,JSON.stringify(args.metadata)]);
      return row;
    },
  },
};
async function load(file) {
  const context = vm.createContext({ console, URL, URLSearchParams, Request, Response, Buffer, Date,
    process: { env: { NODE_ENV: 'development', ENABLE_RUNTIME_PERSISTENCE: 'true' } } });
  const mod = new vm.SourceTextModule(await fs.readFile(file,'utf8'), { context });
  await mod.link(name => {
    const exports = mocks[name]; assert(exports, `Missing mock ${name}`);
    return new vm.SyntheticModule(Object.keys(exports),function() { for (const [key,value] of Object.entries(exports)) this.setExport(key,value); }, { context });
  });
  await mod.evaluate(); return mod.namespace;
}
const addressRoute = await load('src/app/api/cadastru/address/route.js');
const numberRoute = await load('src/app/api/cadastral/route.js');
const historyRoute = await load('src/app/api/profile/history/route.js');
const creditsRoute = await load('src/app/api/profile/credits/route.js');
const request = (body, path = '/api/cadastru/address') => new Request(`https://catdai.test${path}`, { method:'POST', body:JSON.stringify(body) });
const history = async () => (await (await historyRoute.GET(new Request('https://catdai.test/api/profile/history'))).json()).history;

for (const kind of ['address-single','address-multiple','number']) {
  const guest = crypto.randomUUID(), account = crypto.randomUUID(), stranger = crypto.randomUUID(), lookupId = crypto.randomUUID();
  await q('insert into auth.users values ($1),($2),($3)', [guest,account,stranger]);
  await q('insert into guest_checkout_accounts(guest_user_id) values($1)', [guest]);
  const [order] = await q("insert into maib_payment_orders(user_id,environment,request_key,product_key,amount_minor,grants) values($1,'sandbox',$2,'cadastru_lookup_single',1500,'{\"cadastru_lookup\":1}') returning id", [guest,crypto.randomUUID()]);
  await q("select apply_maib_payment($1,'sandbox',$2,$3,1500,'MDL','paid',0,now())", [order.id,crypto.randomUUID(),crypto.randomUUID()]);
  payload = { address:'Chișinău, str. Valea Trandafirilor 11', building:{ area_m2:100 }, ...(kind === 'address-multiple'
    ? { lands:[{cadastral_number:'0100104.003'}], buildings:[{cadastral_number:'0100104.003.01'}] }
    : { cadastral_number:number }) };
  const body = kind === 'number' ? { cadastral_number:number, search_context:'cadastru', lookup_id:lookupId } : { ...address, lookup_id:lookupId };
  const route = kind === 'number' ? numberRoute : addressRoute;
  userId = guest;
  for (let read = 0; read < 3; read++) {
    const response = await route.POST(request(body));
    assert.equal(response.status,200,kind);
    assert.notEqual((await response.json()).locked_sections?.cadastru_details,true,kind);
  }
  const [balance] = await q('select * from user_credit_balances where user_id=$1', [guest]);
  assert.equal(balance.remaining_uses,0,`${kind}: seeing a paid result consumes its credit in development`);
  assert.equal(balance.total_used,1,`${kind}: refreshes never spend another credit`);
  const rows = await history();
  assert.equal(rows.length,1,`${kind}: paid history exists without any analytics rows`);
  assert.equal(rows[0].type,'cadastru'); assert.equal(rows[0].isPaidResult,true);
  assert.equal(rows[0].searchType,kind === 'number' ? 'number' : 'address');
  if (kind !== 'number') assert.equal(rows[0].searchRequest.street,address.street);
  assert(rows[0].resultValue,`${kind}: paid history has the actual lookup result`);
  analyticsRows.push({ id:lookupId, lookup_id:lookupId, duplicate_of:null, user_id:guest, created_at:rows[0].createdAt });
  assert.equal((await history()).length,1,'the paid row replaces the matching analytics history row');

  await q('select claim_guest_checkout($1,$2)', [guest,account]);
  userId = account;
  assert.equal((await history()).length,1,`${kind}: account creation preserves the paid result in history`);
  const credits = await (await creditsRoute.GET(new Request('https://catdai.test/api/profile/credits'))).json();
  assert.equal(credits.sharedCredits.remainingUses,0,'profile cannot show a paid use that was already consumed');
  const reopened = await route.POST(request(body));
  assert.notEqual((await reopened.json()).locked_sections?.cadastru_details,true,'the new account reuses the transferred unlock');
  userId = stranger;
  assert.equal((await history()).length,0,'paid history is scoped to its owner');
  const locked = await route.POST(request(body));
  assert.equal((await locked.json()).locked_sections.cadastru_details,true,'another account cannot reuse the paid result');
}
assert(creditCalls > 0); assert(analyticsCalls > 0);
await db.close();
console.log('Guest Cadastru: real development routes, one credit per result, analytics-independent history, account transfer and owner isolation passed.');
