// Isolated PostgreSQL integration checks. No Supabase, bank or user-account writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { maibProduct } from '../src/lib/maib/products.mjs';

const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role;');
for (const file of ['paynet_payments.sql','paddle_payments.sql','maib_payments.sql']) {
  await db.exec((await fs.readFile(`db/${file}`, 'utf8')).replaceAll('create extension if not exists pgcrypto;', ''));
}
await db.exec(await fs.readFile('supabase/migrations/20261017141519_universal_paid_credits.sql','utf8'));
await db.exec('create table estimate_log(id uuid primary key,user_id uuid references auth.users(id));');
const migration = await fs.readFile('supabase/migrations/20261026194452_guest_feature_checkout.sql','utf8');
await db.exec(migration); await db.exec(migration);
const newUser = async (guest = false) => {
  const id = crypto.randomUUID(); await q('insert into auth.users values($1)', [id]);
  if (guest) await q('insert into guest_checkout_accounts(guest_user_id) values($1)', [id]);
  return id;
};
const consume = async (user, feature, key = 'request') => (await q('select * from consume_user_credit($1,$2,$3)', [user,feature,key]))[0];
const balance = async user => (await q('select * from user_credit_balances where user_id=$1',[user]))[0];
const claim = (guest, account) => q('select claim_guest_checkout($1,$2)',[guest,account]);
async function order(user, feature, paid = true) {
  const product = maibProduct(`${feature}_single`);
  const [row] = await q("insert into maib_payment_orders(user_id,environment,request_key,product_key,amount_minor,grants) values($1,'sandbox',$2,$3,$4,$5) returning *", [user,crypto.randomUUID(),product.key,product.amount_minor,JSON.stringify(product.grants)]);
  const args = [row.id,'sandbox',crypto.randomUUID(),crypto.randomUUID(),row.amount_minor,'MDL'];
  const apply = (status = 'paid', refund = 0) => q('select apply_maib_payment($1,$2,$3,$4,$5,$6,$7,$8,now())',[...args,status,refund]);
  if (paid) { await apply(); await apply(); }
  return { ...row, apply };
}
const features = ['sale_estimate','rent_estimate','listing_analysis','cadastru_lookup','yield_calculator','pdf_report'];
for (const feature of features) {
  const guest = await newUser(true), stranger = await newUser(true), account = await newUser();
  assert.equal((await consume(guest,feature)).allowed,false,'a guest session alone grants no paid access');
  const payment = await order(guest,feature,false);
  assert.equal((await consume(guest,feature)).allowed,false,'pending payments grant no access');
  await payment.apply(); await payment.apply();
  for (const other of features.filter(key => key !== feature)) {
    assert.equal((await consume(guest,other)).allowed,false,'containing/secondary features cannot spend this purchase');
  }
  const usage = await consume(guest,feature);
  assert.equal(usage.allowed,true);
  assert.equal((await balance(guest)).remaining_uses,0);
  for (let refresh=0; refresh<3; refresh++) assert.equal((await consume(guest,feature)).usage_event_id,usage.usage_event_id,'refresh reuses the paid unlock');
  assert.equal((await consume(stranger,feature)).allowed,false,'a different browser identity cannot read the result');
  const historyId = crypto.randomUUID();
  await q('insert into estimate_log values($1,$2)',[historyId,guest]);
  const pending = await order(guest,feature,false);
  await claim(guest,account); await claim(guest,account);
  assert.equal((await consume(account,feature)).usage_event_id,usage.usage_event_id,'account registration keeps the result');
  assert.equal((await consume(guest,feature)).allowed,false,'old guest identity loses transferred access');
  assert.equal((await q('select user_id from estimate_log where id=$1',[historyId]))[0].user_id,account);
  await pending.apply(); await pending.apply();
  assert.equal((await balance(account)).remaining_uses,1,'payment arriving after registration credits the account once');
  const otherFeature = features.find(key => key !== feature);
  assert.equal((await consume(account,otherFeature,'new-action')).allowed,true,'registered accounts retain universal credits');
  await assert.rejects(claim(guest,stranger),/already claimed/);
  await payment.apply('refunded',payment.amount_minor);
  assert.equal((await consume(account,feature)).allowed,true,'historical paid access keeps existing refund semantics');
}

// Merge into an existing account with the same action, retaining both snapshots.
const guest = await newUser(true), account = await newUser();
await order(guest,'sale_estimate'); await order(account,'sale_estimate');
const guestUse = await consume(guest,'sale_estimate');
const accountUse = await consume(account,'sale_estimate');
await q('update user_feature_usage_events set metadata=$1 where id=$2',[JSON.stringify({evaluation_snapshot:{value:123}}),guestUse.usage_event_id]);
await q("select grant_user_feature_credits($1,'pdf_report',2)",[guest]);
await q("select grant_user_feature_credits($1,'pdf_report',3)",[account]);
await q("insert into paddle_payment_orders(user_id,product_key,paddle_price_id) values($1,'pdf_report_single','pri_test')",[guest]);
await q("insert into paddle_subscriptions(paddle_subscription_id,user_id,product_key,status) values('sub_guest',$1,'extra_pack','active')",[guest]);
await q("insert into paddle_subscription_credit_periods(paddle_subscription_id,user_id,product_key,paddle_transaction_id,billing_period_start,billing_period_end) values('sub_guest',$1,'extra_pack','txn_guest',now(),now()+interval '1 month')",[guest]);
await claim(guest,account); await claim(guest,account);
assert.equal((await consume(account,'sale_estimate')).usage_event_id,accountUse.usage_event_id);
const [snapshot] = await q('select * from user_feature_usage_events where id=$1',[guestUse.usage_event_id]);
assert.equal(snapshot.user_id,account); assert.equal(snapshot.metadata.evaluation_snapshot.value,123);
assert.equal((await q('select count(*)::int n from user_feature_usage_events where user_id=$1',[account]))[0].n,2);
assert.equal((await balance(account)).remaining_uses,5,'legacy balances merge once without replacing existing credits');
assert.equal((await q('select user_id from paddle_payment_orders limit 1'))[0].user_id,account);
assert.equal((await q('select user_id from paddle_subscriptions limit 1'))[0].user_id,account);
assert.equal((await q('select user_id from paddle_subscription_credit_periods limit 1'))[0].user_id,account);
await assert.rejects(claim(await newUser(),account),/unknown/,'unregistered guest principals cannot be claimed');
for (const role of ['anon','authenticated']) {
  assert.equal((await q("select has_table_privilege($1,'guest_checkout_accounts','SELECT') ok",[role]))[0].ok,false);
  assert.equal((await q("select has_function_privilege($1,'claim_guest_checkout(uuid,uuid)','EXECUTE') ok",[role]))[0].ok,false);
}
assert.equal((await q("select relrowsecurity from pg_class where relname='guest_checkout_accounts'"))[0].relrowsecurity,true);
assert.equal((await q("select prosecdef from pg_proc where proname='claim_guest_checkout'"))[0].prosecdef,false);
await db.close();
console.log('Guest checkout database: all six features, payment confirmation, refresh, browser isolation, account merge, late payment, refund and privileges passed.');
