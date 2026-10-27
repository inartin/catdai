// Isolated PostgreSQL integration tests: no live purchases or account changes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { maibProduct } from '../src/lib/maib/products.mjs';
import { sharedPaidCreditBalance, sharedFreeMonthlyCredit } from '../src/lib/shared-credit-balance.mjs';
const db = new PGlite();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role;');
for (const file of ['paynet_payments.sql', 'paddle_payments.sql', 'maib_payments.sql']) {
  await db.exec((await fs.readFile(`db/${file}`, 'utf8')).replaceAll('create extension if not exists pgcrypto;', ''));
}
const newUser = async () => { const id = crypto.randomUUID(); await q('insert into auth.users values($1)', [id]); return id; };
const balance = async user => (await q('select * from user_credit_balances where user_id=$1', [user]))[0];
const consume = async (user, feature, key = crypto.randomUUID()) => (await q('select * from consume_user_credit($1,$2,$3)', [user,feature,key]))[0];
const free = async (user, feature, key = crypto.randomUUID(), rpc = 'consume_free_monthly_credit') => (await q(`select * from ${rpc}($1,$2,$3,date_trunc('month',now() at time zone 'UTC') at time zone 'UTC',(date_trunc('month',now() at time zone 'UTC')+interval '1 month') at time zone 'UTC',99)`, [user,feature,key]))[0];
async function purchase(user, key, quantity = 1) {
  const product = maibProduct(key, quantity);
  const [order] = await q("insert into maib_payment_orders(user_id,environment,request_key,product_key,amount_minor,grants) values($1,'sandbox',$2,$3,$4,$5) returning *", [user,crypto.randomUUID(),key,product.amount_minor,JSON.stringify(product.grants)]);
  const args = [order.id,'sandbox',crypto.randomUUID(),crypto.randomUUID(),product.amount_minor,'MDL'];
  const apply = (state = 'paid', refund = 0) => q('select apply_maib_payment($1,$2,$3,$4,$5,$6,$7,$8,now())', [...args,state,refund]);
  await apply(); await apply();
  return { order, apply };
}
// Existing credits and unlocks must survive migration without multiplying balances.
const existing = await newUser();
await q("select grant_user_feature_credits($1,'pdf_report',2)", [existing]);
await q("select * from consume_free_monthly_feature_usage($1,'sale_estimate','old-free',date_trunc('month',now()),date_trunc('month',now())+interval '1 month',1)", [existing]);
const migration = await fs.readFile('supabase/migrations/20261017141519_universal_paid_credits.sql','utf8');
await db.exec(migration); await db.exec(migration);
await db.exec(await fs.readFile('supabase/migrations/20261026194452_guest_feature_checkout.sql','utf8'));
assert.equal((await balance(existing)).remaining_uses,2);
assert.equal((await consume(existing,'cadastru_lookup')).remaining_uses,1);
assert.equal((await free(existing,'pdf_report')).allowed,false,'old monthly free usage counts globally');
assert.equal((await free(existing,'sale_estimate','old-free')).reason,'already_consumed');
const features = ['sale_estimate','rent_estimate','listing_analysis','cadastru_lookup','yield_calculator','pdf_report'];
// Every single-use product can unlock every feature, including PDF and estimates.
for (const productFeature of features) {
  for (const target of features) {
    const user = await newUser();
    const { order, apply } = await purchase(user, `${productFeature}_single`);
    assert.equal((await balance(user)).remaining_uses,1);
    const used = await consume(user,target,'same');
    assert.equal(used.allowed,true); assert.equal(used.remaining_uses,0);
    assert.equal((await consume(user,target,'same')).usage_event_id,used.usage_event_id);
    assert.equal((await consume(user,features.find(f=>f!==target),'same')).allowed,false);
    const [event] = await q('select feature_key,metadata from user_feature_usage_events where id=$1',[used.usage_event_id]);
    assert.equal(event.feature_key,target);
    assert.equal(event.metadata.credit_grant_feature_key,productFeature);
    assert.equal(event.metadata.maib_order_id,order.id);
    await apply('refunded',order.amount_minor);
    assert.equal((await balance(user)).total_used,1);
    assert.equal((await consume(user,target,'same')).allowed,true,'paid unlock survives refund');
  }
}
const packs = await newUser();
const first = await purchase(packs,'all_features_5');
const second = await purchase(packs,'all_features_20');
assert.equal((await balance(packs)).remaining_uses,150,'30 plus 120, never multiplied or reduced');
for (let i=0;i<7;i++) assert.equal((await consume(packs,'pdf_report')).allowed,true,'pool exceeds original PDF bucket');
await first.apply('partially_refunded',100);
assert.equal((await balance(packs)).remaining_uses,143);
await first.apply('refunded',first.order.amount_minor); await first.apply();
assert.equal((await balance(packs)).remaining_uses,120,'only refunded order remainder removed');
assert.equal((await balance(packs)).total_used,7);
await second.apply('refunded',second.order.amount_minor);
assert.equal((await balance(packs)).remaining_uses,0);
const limited = await newUser();
await purchase(limited,'sale_estimate_single',3);
const attempts = await Promise.all(features.map(feature=>consume(limited,feature)));
assert.equal(attempts.filter(r=>r.allowed).length,3,'cross-feature requests cannot overspend');
assert.equal((await balance(limited)).remaining_uses,0);
assert.equal((await consume(await newUser(),'sale_estimate')).allowed,false,'accounts stay isolated');
await assert.rejects(consume(limited,'unknown'),/invalid/);
await assert.rejects(consume(limited,null),/invalid/);
const paddleBuyer = await newUser();
const [paddleOrder] = await q("insert into paddle_payment_orders(user_id,product_key,status,paddle_price_id) values($1,'sale_estimate_single','paid','pri_test') returning id",[paddleBuyer]);
await q("select * from grant_paddle_payment_order_feature_credits($1,'sale_estimate',2)",[paddleOrder.id]);
await q("select * from grant_paddle_payment_order_feature_credits($1,'sale_estimate',2)",[paddleOrder.id]);
assert.equal((await balance(paddleBuyer)).remaining_uses,2);
assert.equal((await consume(paddleBuyer,'pdf_report')).remaining_uses,1);
await q("select * from revoke_paddle_payment_order_feature_credits($1,'adj_test','refunded')",[paddleOrder.id]);
assert.equal((await balance(paddleBuyer)).remaining_uses,0);
assert.equal((await balance(paddleBuyer)).total_used,1);
const monthly = await newUser();
const monthlyAttempts = await Promise.all(features.map(feature=>free(monthly,feature,feature)));
assert.equal(monthlyAttempts.filter(r=>r.allowed).length,1,'one shared free use, even with caller limit 99');
assert.equal((await free(monthly,'sale_estimate','sale_estimate')).reason,'already_consumed');
assert.equal((await free(monthly,'pdf_report','legacy-rpc','consume_free_monthly_feature_usage')).allowed,false);
await q("update user_feature_usage_events set created_at=now()-interval '2 months' where user_id=$1",[monthly]);
assert.equal((await free(monthly,'pdf_report','new-month')).allowed,true);
// Legacy/Paddle and admin sources participate in the same pool, retaining lifecycle rules.
const legacy = await newUser();
await purchase(legacy,'pdf_report_single',2);
await q("select grant_user_feature_credits($1,'sale_estimate',1)",[legacy]);
const legacyUse = await consume(legacy,'rent_estimate');
assert.equal((await q('select metadata from user_feature_usage_events where id=$1',[legacyUse.usage_event_id]))[0].metadata.payment_provider,'legacy');
await q("insert into paddle_subscriptions(paddle_subscription_id,user_id,product_key,status) values('sub_pool',$1,'extra_pack','active')",[legacy]);
await q("select * from reset_paddle_subscription_period_feature_credits('sub_pool',$1,'extra_pack','txn_pool',now(),now()+interval '1 month',$2)",[legacy,JSON.stringify(Object.fromEntries(features.map(f=>[f,50])))]);
assert.equal((await balance(legacy)).remaining_uses,302);
await consume(legacy,'pdf_report');
await q("select clear_paddle_subscription_feature_credits('sub_pool')");
assert.equal((await balance(legacy)).remaining_uses,2,'Paddle cancellation preserves MAIB pool');
await q('select override_payment_credits($1,$2,true,false)',[legacy,JSON.stringify({pdf_report:4})]);
assert.equal((await balance(legacy)).remaining_uses,4);
assert.equal((await consume(legacy,'listing_analysis')).remaining_uses,3);
await q('select override_payment_credits($1,$2,false,true)',[legacy,'{}']);
assert.equal(await balance(legacy),undefined);
const adjusted = await newUser();
const adjustableOrder = await purchase(adjusted,'pdf_report_single',3);
await consume(adjusted,'cadastru_lookup');
await free(adjusted,'sale_estimate','free-before-adjustment');
const adjust = async delta => (await q('select * from adjust_user_credits($1,$2)',[adjusted,delta]))[0];
assert.equal((await adjust(4)).remaining_uses,6,'adds exactly four shared credits');
assert.equal((await adjust(-5)).remaining_uses,1,'removes across legacy and MAIB sources');
assert.equal((await balance(adjusted)).total_used,1,'removal is not consumption');
await assert.rejects(adjust(-2),/insufficient credits/);
assert.equal((await balance(adjusted)).remaining_uses,1,'failed removal rolls back all source changes');
assert.equal((await free(adjusted,'pdf_report')).allowed,false,'adjustment does not restore the free allowance');
await adjustableOrder.apply('refunded',adjustableOrder.order.amount_minor);
assert.equal((await balance(adjusted)).remaining_uses,0,'refund still revokes its own remaining grant');
await assert.rejects(adjust(0),/invalid/);
await assert.rejects(adjust(1001),/invalid/);
for (const role of ['anon','authenticated']) {
  for (const fn of ['adjust_user_credits(uuid,integer)','consume_user_credit(uuid,text,text,jsonb)','consume_free_monthly_credit(uuid,text,text,timestamptz,timestamptz,integer,jsonb)','consume_user_feature_credit(uuid,text,text,jsonb)','consume_free_monthly_feature_usage(uuid,text,text,timestamptz,timestamptz,integer,jsonb)']) {
    assert.equal((await q('select has_function_privilege($1,$2,\'EXECUTE\') ok',[role,fn]))[0].ok,false);
  }
  assert.equal((await q("select has_table_privilege($1,'user_credit_balances','SELECT') ok",[role]))[0].ok,false);
}
assert.equal((await q("select has_function_privilege('service_role','consume_user_credit(uuid,text,text,jsonb)','EXECUTE') ok"))[0].ok,true);
assert.deepEqual(sharedPaidCreditBalance([{remaining_uses:2,total_granted:3,total_used:1},{remaining_uses:4,total_granted:4,total_used:0}]),{remainingUses:6,totalGranted:7,totalUsed:1});
assert.equal(sharedFreeMonthlyCredit([{feature_key:'sale_estimate'}]).remainingUses,0);
// Retirement snapshots only unused existing allowances and never replenishes them.
const retainedUser = await newUser();
const spentUser = await newUser();
await free(spentUser, 'pdf_report', 'before-retirement');
const paidBeforeRetirement = await balance(packs);
const retirement = await fs.readFile('supabase/migrations/20261020081326_retire_monthly_free_credits.sql', 'utf8');
await db.exec(retirement);
const newcomer = await newUser();
await db.exec(retirement); // Reapplying must neither add new users nor refill a credit.
assert.equal((await free(newcomer, 'sale_estimate')).allowed, false);
assert.equal((await free(spentUser, 'sale_estimate')).allowed, false);
assert.equal((await free(spentUser, 'pdf_report', 'before-retirement')).reason, 'already_consumed');
assert.deepEqual(await balance(packs), paidBeforeRetirement, 'paid ledgers are unchanged');
const retainedRows = await q('select remaining_uses from user_retained_free_credits where user_id=$1', [retainedUser]);
assert.equal(sharedFreeMonthlyCredit(retainedRows).remainingUses, 1);
assert.equal(sharedFreeMonthlyCredit([]).remainingUses, 0, 'missing rows never imply a grant');
const retainedAttempts = await Promise.all(features.map(feature => free(retainedUser, feature, 'retained-' + feature)));
assert.equal(retainedAttempts.filter(r => r.allowed).length, 1, 'one retained credit across all features');
assert.equal((await free(retainedUser, 'sale_estimate', 'retained-sale_estimate')).reason, 'already_consumed');
await db.exec(retirement);
assert.equal((await free(retainedUser, 'pdf_report', 'after-reapply')).allowed, false);
const [futureFree] = await q("select * from consume_free_monthly_credit($1,'pdf_report','future',now()+interval '1 month',now()+interval '2 months',99)", [retainedUser]);
assert.equal(futureFree.allowed, false, 'future months and larger limits cannot mint credits');
assert.equal((await free(newcomer, 'pdf_report', 'legacy', 'consume_free_monthly_feature_usage')).allowed, false);
await q("select grant_user_feature_credits($1,'sale_estimate',1)", [newcomer]);
assert.equal((await consume(newcomer, 'cadastru_lookup')).allowed, true, 'paid access still works');
for (const role of ['anon', 'authenticated']) {
  for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    assert.equal((await q("select has_table_privilege($1,'user_retained_free_credits',$2) ok", [role, privilege]))[0].ok, false);
  }
}
assert.equal((await q("select relrowsecurity from pg_class where oid='user_retained_free_credits'::regclass"))[0].relrowsecurity, true);
await db.close();
console.log('Universal credits: cross-feature purchases, preserved totals, refunds, retired free allowance, idempotency, overspend, lifecycle and privileges passed.');
