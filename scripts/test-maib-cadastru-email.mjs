// Isolated result preparation and PostgreSQL checks. No mail, bank or Supabase writes.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { featureResultPath } from '../src/lib/guest-checkout.mjs';
import { getSavedCadastruAddress } from '../src/lib/cadastru-favorites.js';
import { cadastruPaidHistoryMetadata } from '../src/lib/cadastru-paid-history.js';
import { getCadastruSharePath } from '../src/lib/cadastru-share-url.js';

const number = '0100106.131.01.020';
const usageKey = (feature, value) => `paid:${feature}:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)}`;
const official = { status: 'success', cadastral_number: number, apartment: { area_m2: 52 }, cadastru_evaluation_token: 'private-token' };
let payload = official, reads = [], ambiguous = false;
const context = vm.createContext({ URL, process: { env: { NODE_ENV: 'production' } } });
const deliveryModule = new vm.SourceTextModule(await fs.readFile('src/lib/maib/cadastru-delivery.js', 'utf8'), { context });
const mocks = {
  '@/lib/guest-checkout.mjs': { featureResultPath },
  '@/lib/cadastru-favorites': { getSavedCadastruAddress },
  '@/lib/cadastru-records': Object.fromEntries(['Number', 'Address'].map(kind => [`getCadastruRecordBy${kind}`, async (value, options) => {
    reads.push({ kind, value, options }); return payload && { payload, lookupSource: 'api', resultType: 'full_data' };
  }])),
  '@/lib/cadastru-cache': { cleanCadastruPayload: value => { const copy = { ...value }; delete copy.access_limit; return copy; } },
  '@/lib/paid-feature-usage': { makePaidFeatureUsageKey: usageKey },
  '@/lib/cadastru-paid-history': { cadastruPaidHistoryMetadata },
  '@/lib/cadastru-share-statistics': { resolveCadastruShareSearch: async () => 1 },
  '@/lib/cadastru-supported-cities': { resolveCadastruSupportedCity: value => value },
  '@/lib/cadastru-streets/street-resolver': {
    inspectStreetAddress: ({ street }) => ({ status: 'unchanged', street }),
    resolveStreet: ({ street }) => ({ status: ambiguous ? 'ambiguous' : 'exact', street: street.replace('Дечебал', 'Decebal') }),
  },
  '@/lib/validation': { validateCadastralNumber: value => ({ valid: value === number, value }) },
};
await deliveryModule.link(name => new vm.SyntheticModule(Object.keys(mocks[name]), function () {
  for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
}, { context }));
await deliveryModule.evaluate();
const prepare = options => deliveryModule.namespace.buildMaibCadastruDelivery({
  productKey: 'cadastru_lookup_single', returnTo: `/en/cadastru/rezultat?cadastral_number=${number}`,
  user: { id: 'buyer' }, ...options,
});
const numberDelivery = JSON.parse(JSON.stringify(await prepare()));
assert.equal(numberDelivery.search_label, number);
assert.equal(numberDelivery.search_type, 'number');
assert.equal(numberDelivery.usage_key, usageKey('cadastru_lookup', { cadastral_number: number }));
assert.equal(numberDelivery.payload.apartment.area_m2, 52);
assert.equal(numberDelivery.payload.cadastru_evaluation_token, undefined);
assert.equal(numberDelivery.collect_statistics, true);
assert.equal((await prepare({ user: { id: 'admin', app_metadata: { catdai_is_admin: true } } })).collect_statistics, false);
context.process.env.NODE_ENV = 'development';
assert.equal((await prepare()).collect_statistics, false);
context.process.env.NODE_ENV = 'production';
const addressParams = new URLSearchParams({ source: 'address', city: 'Chișinău', road_type: 'bulevard', street: 'Дечебал', house_number: '22/a', apartment_number: '0020' });
const addressPath = `/ru/cadastru/rezultat?${addressParams}`;
const addressDelivery = await prepare({ returnTo: addressPath });
assert.equal(addressDelivery.search_type, 'address');
assert.equal(addressDelivery.search_label, 'Chișinău, bd Дечебал 22/A ap 20');
assert.equal(reads.at(-1).value, 'Chișinău, bd Decebal 22/A ap 20');
assert.equal(addressDelivery.metadata.search_request.apartment_number, '20');
assert.equal(addressDelivery.usage_key, numberDelivery.usage_key, 'resolved addresses reuse the number unlock');
assert.equal((await prepare({ returnTo: `${addressPath}&cadastral_number=${number}` })).search_label, addressDelivery.search_label, 'address handoffs retain the searched address in email');
payload = { status: 'success', lands: [{ cadastral_number: '0100106.131' }] };
const aggregateDelivery = JSON.parse(JSON.stringify(await prepare({ returnTo: addressPath })));
assert.equal(aggregateDelivery.usage_key, usageKey('cadastru_lookup', { address: 'chișinău, bd decebal 22/a ap 20' }));
for (const bad of [null, { error: 'unavailable' }, { status: 'failed' }, { locked_sections: { cadastru_details: true } }, { registry_unavailable: true }, { unit_list_entry: true }]) {
  payload = bad; assert.equal(await prepare(), null, 'missing/partial/unverified reports never become public');
}
payload = official;
ambiguous = true;
assert.equal(await prepare({ returnTo: addressPath }), null);
ambiguous = false;
for (const options of [{ productKey: 'credits_10' }, { productKey: 'pdf_report_single' }, { checkoutSource: 'pricing' },
  { returnTo: '/evaluare' }, { returnTo: 'https://evil.test/cadastru/rezultat' }, { returnTo: '/en/cadastru/rezultat?share_slug=existing' },
  { returnTo: '/cadastru/rezultat' }, { returnTo: addressPath.replace('0020', 'invalid') }]) {
  assert.equal(await prepare(options), null);
}
console.log('Checkout snapshot checks passed: official payloads, address/number identities, guest/admin language paths, partial data and excluded purchases.');

const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls;');
for (const name of ['paynet_payments', 'paddle_payments', 'maib_payments']) {
  await db.exec((await fs.readFile(`db/${name}.sql`, 'utf8')).replaceAll('create extension if not exists pgcrypto;', ''));
}
for (const name of ['20261017141519_universal_paid_credits', '20261020081326_retire_monthly_free_credits', '20261026194452_guest_feature_checkout']) {
  await db.exec(await fs.readFile(`supabase/migrations/${name}.sql`, 'utf8'));
}
await db.exec('create table cadastru_search_events(id bigint primary key, user_id uuid); grant select on cadastru_search_events to service_role;');
for (const name of ['20261019184740_cadastru_shared_reports', '20261019185731_cadastru_share_statistics', '20261026103149_cadastru_report_short_codes']) {
  await db.exec(await fs.readFile(`supabase/migrations/${name}.sql`, 'utf8'));
}
const migration = await fs.readFile('supabase/migrations/20261030203106_maib_cadastru_result_email.sql', 'utf8');
await db.exec(migration); await db.exec(migration);
const newOrder = async (delivery = numberDelivery) => {
  const user = crypto.randomUUID();
  await q('insert into auth.users values($1)', [user]);
  await q('insert into guest_checkout_accounts(guest_user_id) values($1)', [user]);
  const [order] = await q("insert into maib_payment_orders(user_id,environment,request_key,product_key,amount_minor,grants,receipt_email,product_title,cadastru_delivery) values($1,'sandbox',$2,'cadastru_lookup_single',1500,'{\"cadastru_lookup\":1}','buyer@example.com','Cadastral data',$3) returning *", [user, crypto.randomUUID(), delivery]);
  order.confirm = (status = 'paid', refund = 0) => q('select apply_maib_payment($1,$2,$3,$4,$5,$6,$7,$8,now())',
    [order.id, 'sandbox', order.checkout_id ||= crypto.randomUUID(), order.payment_id ||= crypto.randomUUID(), 1500, 'MDL', status, refund]);
  return order;
};
const publish = async order => {
  await db.exec('set role service_role');
  try { return (await q('select publish_maib_cadastru_result($1,$2) slug', [order.id, crypto.randomBytes(24).toString('hex')]))[0].slug; }
  finally { await db.exec('reset role'); }
};
const remaining = async order => (await q('select remaining_uses from maib_credit_grants where order_id=$1', [order.id]))[0].remaining_uses;
const consume = async order => (await q("select * from consume_user_credit($1,'cadastru_lookup',$2)", [order.user_id, order.cadastru_delivery.usage_key]))[0];
const order = await newOrder();
assert.equal(await publish(order), null, 'pending payments cannot publish');
assert.equal((await q('select count(*)::int n from cadastru_shared_reports'))[0].n, 0);
await order.confirm(); await order.confirm();
const slug = await publish(order);
assert.match(slug, /^[a-f0-9]{48}$/);
assert.equal(await remaining(order), 0, 'email unlock spends the purchased result once even with the browser closed');
assert.equal((await consume(order)).reason, 'already_consumed', 'browser return does not spend another credit');
assert.equal(await publish(order), slug, 'SMTP retries reuse one saved public report');
const [report] = await q('select * from cadastru_shared_reports where slug=$1', [slug]);
assert.equal(report.payload.apartment.area_m2, 52);
assert.equal(report.search_event_id, null, 'deleted search attribution cannot prevent delivery');
assert.equal(await getCadastruSharePath(slug, 'en'), `/en/c/${report.short_code}`);
assert.equal((await q('select count(*)::int n from cadastru_share_events'))[0].n, 0, 'automatic delivery never fabricates a share click');
const browserFirst = await newOrder(aggregateDelivery);
await browserFirst.confirm(); await consume(browserFirst);
assert.ok(await publish(browserFirst));
assert.equal(await remaining(browserFirst), 0);

// A share-code collision rolls the entire publication and credit change back.
const collision = await newOrder(); await collision.confirm();
await assert.rejects(q('select publish_maib_cadastru_result($1,$2)', [collision.id, slug]), { code: '23505' });
assert.equal(await remaining(collision), 1);
assert.ok(await publish(collision));
const refunded = await newOrder(); await refunded.confirm(); await refunded.confirm('refunded', 1500);
assert.equal(await publish(refunded), null, 'fully refunded orders do not publish');
const legacy = await newOrder(null); await legacy.confirm();
assert.equal(await publish(legacy), null, 'historical orders retain the regular confirmation');
assert.equal(await remaining(legacy), 1);

const retained = await newOrder(); await retained.confirm();
await q('insert into user_retained_free_credits(user_id,remaining_uses) values($1,1)', [retained.user_id]);
assert.ok(await publish(retained));
assert.equal(await remaining(retained), 1, 'retained free-credit precedence is preserved');
assert.ok(await publish(retained));
assert.equal(await remaining(retained), 1);
const freeKey = `${new Date().toISOString().slice(0,7)}:cadastru_lookup:${crypto.createHash('sha256').update(JSON.stringify({ idempotencyKey: retained.cadastru_delivery.usage_key })).digest('hex').slice(0,32)}`;
assert.equal((await q('select idempotency_key from user_feature_usage_events where user_id=$1', [retained.user_id]))[0].idempotency_key, freeKey, 'free unlock uses the browser key');

const transferring = await newOrder(); await transferring.confirm();
const account = crypto.randomUUID(); await q('insert into auth.users values($1)', [account]);
await q('select claim_guest_checkout($1,$2)', [transferring.user_id, account]);
assert.ok(await publish(transferring), 'registration before email delivery preserves the purchase');
assert.equal((await q('select user_id from user_feature_usage_events where idempotency_key=$1 and user_id=$2', [numberDelivery.usage_key, account]))[0].user_id, account);
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(q('select publish_maib_cadastru_result($1,$2)', [order.id, slug]), /permission denied/);
  await assert.rejects(q('select cadastru_delivery from maib_payment_orders'), /permission denied/);
  await db.exec('reset role');
}
await db.close();
console.log('Payment report SQL passed: verified payments, one-time unlocks, browser/SMTP retries, atomic rollback, refunds, retained credits, account transfer and server-only access.');
