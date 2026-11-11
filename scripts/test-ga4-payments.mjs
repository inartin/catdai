// pnpm exec node --experimental-vm-modules scripts/test-ga4-payments.mjs
// No bank, Google collection endpoint, or remote database is contacted.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import * as analytics from '../src/lib/ga4-payment.mjs';
import { deliverPaymentAnalytics } from '../src/lib/maib/analytics.mjs';

const measurementId = 'G-TEST123';
const browserContext = { measurement_id: measurementId, client_id: '123456.789012', session_id: '1793628000', analytics_consent: true };
const options = { user: { is_anonymous: true }, productKey: 'cadastru_lookup_single', checkoutSource: 'pricing', measurementId, production: true };
const context = analytics.verifiedAnalyticsContext({ ...browserContext, email: 'private@example.com', value: 999 }, options);
assert.equal(context.checkout_origin, 'pricing');
assert.equal(context.buyer_type, 'guest');
assert.equal(context.email, undefined);
for (const invalid of [null, {}, { ...browserContext, analytics_consent: false }, { ...browserContext, measurement_id: 'G-OTHER' },
  { ...browserContext, client_id: 'private@example.com' }, { ...browserContext, session_id: 'invalid' }]) {
  assert.equal(analytics.verifiedAnalyticsContext(invalid, options), null);
}
assert.equal(analytics.verifiedAnalyticsContext(browserContext, { ...options, production: false }), null);
assert.equal(analytics.verifiedAnalyticsContext(browserContext, { ...options, checkoutSource: null, user: {} }).checkout_origin, 'cadastru');
for (const invalid of [undefined, false, 'granted', 'true', 1, {}]) {
  assert.equal(analytics.verifiedAnalyticsContext({ ...browserContext, ads_measurement_consent: invalid }, options).ads_measurement_consent, false);
}
assert.equal(analytics.verifiedAnalyticsContext({ ...browserContext, analytics_consent: false, ads_measurement_consent: true }, options), null);

const order = { id: crypto.randomUUID(), product_key: 'credits_10', amount_minor: 8900, currency_code: 'MDL',
  product_title: 'Historical bundle price', environment: 'production', grants: { cadastru_lookup: 10 },
  language: 'ro', ga4_context: context, receipt_email: 'private@example.com', return_to: '/cadastru/rezultat?address=private' };
const time = new Date().toISOString();
const purchase = { event_name: 'purchase', occurred_at: time, amount_minor: 8900 };
const payload = analytics.paymentMeasurementPayload(purchase, order);
assert.equal(payload.events[0].params.value, 89, 'Revenue uses immutable order amount, not current catalog price');
assert.equal(payload.events[0].params.items[0].price, 89);
assert.equal(payload.events[0].params.items[0].quantity, 1, 'A credit pack is one purchased bundle');
assert.equal(payload.events[0].params.transaction_id, order.id);
assert.equal(payload.client_id, browserContext.client_id);
assert.equal(payload.events[0].params.session_id, browserContext.session_id);
assert.deepEqual(payload.consent, { ad_user_data: 'DENIED', ad_personalization: 'DENIED' });
assert.deepEqual(analytics.paymentMeasurementPayload(purchase, { ...order, ga4_context: browserContext }).consent, payload.consent,
  'Historical orders without a choice do not grant ad measurement');
assert(!JSON.stringify(payload).includes('private'));
assert.equal(analytics.paymentMeasurementPayload(purchase, { ...order, environment: 'sandbox' }), null);
const refund = analytics.paymentMeasurementPayload({ ...purchase, event_name: 'refund', amount_minor: 2000 }, order);
assert.equal(refund.events[0].params.value, 20);
assert.equal(refund.events[0].params.items, undefined, 'A partial refund must not return the whole bundle');

// Real SQL verifies transactional queueing, idempotency, leases and client denial.
const db = new PGlite();
await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls;');
for (const name of ['paynet_payments','paddle_payments','maib_payments']) {
  await db.exec((await fs.readFile(`db/${name}.sql`, 'utf8')).replaceAll('create extension if not exists pgcrypto;', ''));
}
const migration = await fs.readFile('supabase/migrations/20261102141624_ga4_payment_events.sql', 'utf8');
await db.exec(migration); await db.exec(migration);
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const newOrder = async (environment = 'production', gaContext = context) => {
  const user = crypto.randomUUID();
  await q('insert into auth.users values($1)', [user]);
  const [saved] = await q("insert into maib_payment_orders(user_id,environment,request_key,product_key,amount_minor,grants,ga4_context) values($1,$2,$3,'credits_10',7900,'{\"cadastru_lookup\":10}',$4) returning *", [user, environment, crypto.randomUUID(), gaContext]);
  saved.confirm = (status = 'paid', refunded = 0) => q('select apply_maib_payment($1,$2,$3,$4,$5,$6,$7,$8,now())',
    [saved.id, environment, saved.checkout_id ||= crypto.randomUUID(), saved.payment_id ||= crypto.randomUUID(), 7900, 'MDL', status, refunded]);
  return saved;
};
const paid = await newOrder('production', { ...context, ads_measurement_consent: true });
assert.equal(analytics.paymentMeasurementPayload(purchase, paid).consent.ad_user_data, 'GRANTED');
await paid.confirm(); await paid.confirm();
assert.equal((await q('select * from ga4_payment_events')).length, 1, 'Callback/poll duplicates enqueue one purchase');
await paid.confirm('partially_refunded', 1000); await paid.confirm('partially_refunded', 1000);
assert.equal((await q("select * from ga4_payment_events where event_name='refund'"))[0].amount_minor, 1000);
const [claimed] = await q('select * from claim_ga4_payment_events(10)');
assert.equal(claimed.event_name, 'purchase', 'Refund waits for purchase delivery');
assert.equal((await q('select * from claim_ga4_payment_events(10)')).length, 0, 'Lease excludes concurrent claim');
await q("update ga4_payment_events set status='sent' where id=$1", [claimed.id]);
assert.equal((await q('select * from claim_ga4_payment_events(10)'))[0].event_name, 'refund');
await paid.confirm('refunded', 7900); await paid.confirm('refunded', 7900);
assert.deepEqual((await q("select amount_minor from ga4_payment_events where event_name='refund' order by id")).map(row => row.amount_minor), [1000,6900]);
for (const [env, consent] of [['sandbox',context], ['production',null]]) {
  const excluded = await newOrder(env, consent); await excluded.confirm();
  assert.equal((await q('select * from ga4_payment_events where order_id=$1', [excluded.id])).length, 0);
}
const canceled = await newOrder();
await q("update maib_payment_orders set status='creation_unknown' where id=$1", [canceled.id]);
assert.equal((await q('select * from ga4_payment_events where order_id=$1', [canceled.id])).length, 0, 'Uncertainty is not failure');
await q("update maib_payment_orders set status='canceled' where id=$1", [canceled.id]);
assert.equal((await q('select * from ga4_payment_events where order_id=$1', [canceled.id]))[0].event_name, 'payment_cancelled');
for (const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(q('select * from ga4_payment_events'));
  await assert.rejects(q('select * from claim_ga4_payment_events(1)'));
  await db.exec('reset role');
}
await db.close();

// Browser events go only to GA4, obey consent, and omit checkout query data.
const sent = [];
let consent = 'granted';
const browser = vm.createContext({ process: { env: { NODE_ENV: 'production', NEXT_PUBLIC_GA_ID: measurementId } },
  localStorage: { getItem: key => key === 'cookie_consent' ? consent : null }, setTimeout,
  window: { location: { hostname: 'catdai.md', origin: 'https://catdai.md', pathname: '/payment/maib/checkout', search: '?receipt_email=private' },
    gtag: (...args) => args[0] === 'get' ? args[3](args[2] === 'client_id' ? browserContext.client_id : browserContext.session_id) : sent.push(args) },
});
const client = new vm.SourceTextModule(await fs.readFile('src/lib/ga4-payment-client.js','utf8'), { context: browser });
const consentModule = new vm.SourceTextModule(await fs.readFile('src/lib/google-consent.mjs', 'utf8'), { context: browser });
await client.link(specifier => specifier === './google-consent.mjs' ? consentModule :
  new vm.SyntheticModule(Object.keys(analytics), function () {
    for (const [key,value] of Object.entries(analytics)) this.setExport(key,value);
  }, { context: browser }));
await client.evaluate();
assert(client.namespace.trackPaymentAnalytics('begin_checkout', 'credits_10', { email: 'private', checkout_source: 'pricing' }));
assert.equal(sent[0][2].send_to, measurementId);
assert.equal(sent[0][2].page_location, 'https://catdai.md/payment/maib/checkout');
assert(!JSON.stringify(sent).includes('private'));
for (const choice of ['granted', 'analytics_only', 'analytics_and_ads']) {
  consent = choice;
  const captured = await client.namespace.capturePaymentAnalytics();
  assert.equal(captured.client_id, browserContext.client_id);
  const saved = analytics.verifiedAnalyticsContext(captured, options);
  assert.deepEqual(analytics.paymentMeasurementPayload(purchase, { ...order, ga4_context: saved }).consent,
    { ad_user_data: choice === 'analytics_and_ads' ? 'GRANTED' : 'DENIED', ad_personalization: 'DENIED' });
}
assert.equal(await client.namespace.capturePaymentAnalytics(true), null);
assert.equal(client.namespace.trackPaymentAnalytics('begin_checkout', 'credits_10', { sandbox: true }), false);
for (const choice of ['denied', 'unknown', 'constructor', null]) {
  consent = choice;
  assert.equal(client.namespace.trackPaymentAnalytics('begin_checkout', 'credits_10'), false);
  assert.equal(await client.namespace.capturePaymentAnalytics(), null);
}
consent = 'granted'; browser.window.location.hostname = 'dev.catdai.md';
assert.equal(client.namespace.trackPaymentAnalytics('begin_checkout', 'credits_10'), false);
browser.window.location.hostname = 'catdai.md';
assert.equal(client.namespace.trackPaymentAnalytics('purchase', 'credits_10'), false, 'Only backend verification can report purchases');

// Delivery acknowledges success and preserves uncertain refunds without duplication.
let records = [], requests = 0;
const fakeDb = {
  async rpc() {
    const event = records.find(row => ['pending','failed'].includes(row.status) && Date.parse(row.next_attempt_at || time) <= Date.now());
    if (!event) return { data: [] };
    Object.assign(event, { status: 'sending', attempts: 1, lease_token: crypto.randomUUID() });
    return { data: [{ ...event }] };
  },
  from(table) {
    let update; const filters = [];
    const chain = { select: () => chain, single: () => chain, eq: (key,value) => { filters.push(row => row[key] === value); return chain; },
      update: value => { update = value; return chain; },
      then(resolve,reject) {
        const rows = (table === 'maib_payment_orders' ? [order] : records).filter(row => filters.every(filter => filter(row)));
        if (update) rows.forEach(row => Object.assign(row, update));
        return Promise.resolve({ data: table === 'maib_payment_orders' ? rows[0] : rows }).then(resolve,reject);
      } };
    return chain;
  },
};
const config = { measurementId, secret: 'not-a-real-secret' };
const reset = eventName => { records = [{ ...purchase, event_name: eventName, id: 1, order_id: order.id, status: 'pending' }]; requests = 0; };
reset('purchase');
await deliverPaymentAnalytics(fakeDb, { config, fetchImpl: async (url, init) => {
  requests++; assert.equal(url.searchParams.get('measurement_id'), measurementId);
  assert.equal(JSON.parse(init.body).events[0].params.value, 89); return { ok: true };
} });
assert.equal(records[0].status, 'sent'); assert.equal(requests, 1);
reset('refund');
await deliverPaymentAnalytics(fakeDb, { config, fetchImpl: async () => { requests++; throw new Error('timeout'); } });
assert.equal(records[0].status, 'unknown'); assert.equal(requests, 1);
reset('purchase');
await deliverPaymentAnalytics(fakeDb, { config, fetchImpl: async () => { requests++; throw new Error('timeout'); } });
assert.equal(records[0].status, 'failed'); assert.equal(requests, 1);
reset('purchase');
await deliverPaymentAnalytics(fakeDb, { config, fetchImpl: async () => ({ ok: false, status: 403 }) });
assert.equal(records[0].status, 'unknown', 'Rejected requests require a config correction, not blind retries');
console.log('GA4 payment checks passed: consent, privacy, server revenue, transactional deduplication, partial refunds, leases, RLS and delivery recovery.');
