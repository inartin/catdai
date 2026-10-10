// Isolated PostgreSQL execution; never connects to Supabase or payment providers.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { maibProduct } from '../src/lib/maib/products.mjs';
const { PGlite } = await import(process.env.MAIB_TEST_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role;');
for (const file of ['paynet_payments.sql','paddle_payments.sql','maib_payments.sql']) {
  // pgcrypto's UUID generator is built into PostgreSQL; PGlite needs no extension.
  await db.exec((await fs.readFile(`db/${file}`, 'utf8')).replaceAll('create extension if not exists pgcrypto;', ''));
}
await db.exec(await fs.readFile('db/maib_payments.sql', 'utf8')); // repeatable migration
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const user = crypto.randomUUID();
await q('insert into auth.users values($1)', [user]);
const grants = { sale_estimate: 2, rent_estimate: 2, listing_analysis: 2, cadastru_lookup: 2, yield_calculator: 2, pdf_report: 2 };
async function order(count = 2, env = 'sandbox') {
  const g = Object.fromEntries(Object.keys(grants).map(k => [k,count]));
  const [row] = await q(`insert into maib_payment_orders(user_id,environment,request_key,product_key,amount_minor,grants)
    values($1,$2,$3,'standard_pack',9900,$4) returning *`, [user, env, crypto.randomUUID(), JSON.stringify(g)]);
  return { ...row, checkout: crypto.randomUUID(), payment: crypto.randomUUID() };
}
async function apply(o, status = 'paid', refund = 0) {
  return q('select apply_maib_payment($1,$2,$3,$4,$5,$6,$7,$8,now())', [o.id,o.environment,o.checkout,o.payment,9900,'MDL',status,refund]);
}
const balance = async () => (await q("select * from user_feature_credit_balances where user_id=$1 and feature_key='sale_estimate'",[user]))[0];
const consume = async key => (await q("select * from consume_user_feature_credit($1,'sale_estimate',$2,'{}')",[user,key]))[0];
const first = await order();
await apply(first); await apply(first);
assert.equal((await balance()).remaining_uses,2,'duplicate completion grants once');
await assert.rejects(q('select apply_maib_payment($1,$2,$3,$4,10000,\'MDL\',\'paid\',0,now())',[first.id,'sandbox',first.checkout,first.payment]), /mismatch/);
await assert.rejects(q('select apply_maib_payment($1,$2,$3,$4,9900,\'MDL\',\'paid\',0,now())',[first.id,'production',first.checkout,first.payment]), /mismatch/);
await q("select grant_user_feature_credits($1,'sale_estimate',1)",[user]);
await consume('legacy-first');
assert.equal((await q('select remaining_uses from maib_credit_grants where order_id=$1 and feature_key=\'sale_estimate\'',[first.id]))[0].remaining_uses,2);
const same = await Promise.all([consume('same-key'),consume('same-key')]);
assert.equal(same[0].usage_event_id,same[1].usage_event_id);
assert.equal((await balance()).remaining_uses,1);
const second=await order(10); await apply(second);
assert.equal((await balance()).remaining_uses,11,'repeat purchase stacks');
await apply(first,'partially_refunded',1000);
assert.equal((await balance()).remaining_uses,11,'partial refunds retain credits');
await apply(first,'paid',0);
assert.equal((await q('select status,refunded_minor from maib_payment_orders where id=$1',[first.id]))[0].status,'partially_refunded');
await apply(first,'refunded',9900); await apply(first,'refunded',9900); await apply(first);
assert.equal((await balance()).remaining_uses,10,'refund revokes only unused credits of the order and cannot regrant');
assert.equal((await balance()).total_used,2,'usage retained after refund');
await q("insert into paddle_subscriptions(paddle_subscription_id,user_id,product_key,status) values('sub_test',$1,'extra_pack','active')",[user]);
await q("select * from reset_paddle_subscription_period_feature_credits('sub_test',$1,'extra_pack','txn_test',now(),now()+interval '1 month',$2)",[user,JSON.stringify(grants)]);
assert.equal((await balance()).remaining_uses,12,'Paddle renewal does not overwrite MAIB');
await q("select clear_paddle_subscription_feature_credits('sub_test')");
assert.equal((await balance()).remaining_uses,10,'Paddle cancellation preserves MAIB');
const [reserved]=await q("select reserve_maib_refund($1,9900,'Test refund') id",[second.id]);
assert.ok(reserved.id);
await assert.rejects(q("select reserve_maib_refund($1,9900,'Duplicate')",[second.id]),/unique/);
await q("update maib_refund_attempts set status='Rejected' where id=$1",[reserved.id]);
await q("select reserve_maib_refund($1,9900,'Retry after definite rejection')",[second.id]);
assert.equal((await balance()).remaining_uses,10,'pending refund does not revoke');
await apply(second,'refunded',9900);
assert.equal((await balance()).remaining_uses,0);
assert.equal((await q('select status from maib_refund_attempts where order_id=$1 order by created_at desc',[second.id]))[0].status,'Accepted');
const third=await order(50); await apply(third);
await q('select override_payment_credits($1,$2,false,false)',[user,JSON.stringify(grants)]);
assert.equal((await balance()).remaining_uses,2,'admin reset replaces both sources');
await apply(third,'refunded',9900);
assert.equal((await balance()).remaining_uses,2,'refund cannot revoke manual replacement credits');
await consume('admin-credit');
await q('select override_payment_credits($1,$2,true,false)',[user,JSON.stringify(grants)]);
assert.equal((await balance()).total_used,1,'bulk override preserves usage');
await q('select override_payment_credits($1,$2,false,true)',[user,'{}']);
assert.equal(await balance(),undefined,'Start explicitly clears both sources');
const fourth=await order(1,'production'); await apply(fourth);
const fifth=await order(1,'sandbox'); await apply(fifth);
assert.equal((await q('select count(*)::integer n from reporting_payment_orders'))[0].n,1,'sandbox excluded from paid reports');
assert.equal((await q('select remaining_uses from reporting_feature_credit_balances where user_id=$1 and feature_key=\'sale_estimate\'',[user]))[0].remaining_uses,1);
const concurrent=await Promise.all(Array.from({length:5},(_,i)=>consume(`concurrent-${i}`)));
assert.equal(concurrent.filter(r=>r.allowed).length,2,'no negative balance or double spending');
const claims=await q("select * from claim_maib_orders('production',20)");
assert.ok(claims.length);
assert.equal((await q("select * from claim_maib_orders('production',20)")).length,0,'leases prevent overlapping workers');
await q("update maib_payment_orders set lease_until=now()-interval '1 second' where id=$1",[fourth.id]);
assert.equal((await q("select * from claim_maib_orders('production',20)")).length,1,'expired leases recover');
for(const role of ['anon','authenticated']) {
  assert.equal((await q("select has_table_privilege($1,'maib_payment_orders','SELECT') ok",[role]))[0].ok,false);
  assert.equal((await q("select has_table_privilege($1,'user_feature_credit_balances','SELECT') ok",[role]))[0].ok,false);
  assert.equal((await q("select has_function_privilege($1,'apply_maib_payment(uuid,text,uuid,uuid,integer,text,text,integer,timestamptz)','EXECUTE') ok",[role]))[0].ok,false);
  assert.equal((await q("select has_table_privilege($1,'maib_payment_receipts','SELECT') ok",[role]))[0].ok,false);
  assert.equal((await q("select has_function_privilege($1,'claim_maib_receipts(text,integer)','EXECUTE') ok",[role]))[0].ok,false);
}

// Receipts are queued atomically with verified payments, never on checkout or redirect.
const mailOrder=await order();
await q("update maib_payment_orders set receipt_email='buyer@example.com',product_title='Pachet Standard',terms_version='2026-10-05',terms_accepted_at=now() where id=$1",[mailOrder.id]);
assert.equal((await q('select * from maib_payment_receipts')).length,0);
await apply(mailOrder);await apply(mailOrder);
assert.equal((await q('select * from maib_payment_receipts')).length,1,'one receipt per verified order');
assert.equal((await q("select * from claim_maib_receipts('production',1)")).length,0,'receipt environment isolated');
const [mailClaim]=await q("select * from claim_maib_receipts('sandbox',1)");
assert.equal(mailClaim.order_id,mailOrder.id);assert.equal(mailClaim.attempts,1);assert.ok(mailClaim.lease_token);
assert.equal((await q("select * from claim_maib_receipts('sandbox',1)")).length,0,'active delivery cannot be claimed twice');
await q("update maib_payment_receipts set lease_until=now()-interval '1 second' where order_id=$1",[mailOrder.id]);
assert.equal((await q("select * from claim_maib_receipts('sandbox',1)")).length,0,'expired delivery is not blindly resent');
assert.equal((await q('select status from maib_payment_receipts where order_id=$1',[mailOrder.id]))[0].status,'unknown');
await q("update maib_payment_receipts set status='failed',next_attempt_at=now()+interval '1 hour' where order_id=$1",[mailOrder.id]);
assert.equal((await q("select * from claim_maib_receipts('sandbox',1)")).length,0,'retry backoff respected');
await q("update maib_payment_receipts set next_attempt_at=now() where order_id=$1",[mailOrder.id]);
assert.equal((await q("select * from claim_maib_receipts('sandbox',1)"))[0].attempts,2,'definite failures may retry');
await q("update maib_payment_receipts set status='sent',sent_at=now(),lease_until=null,lease_token=null where order_id=$1",[mailOrder.id]);
await apply(mailOrder);await apply(mailOrder,'refunded',9900);
assert.equal((await q("select * from claim_maib_receipts('sandbox',1)")).length,0,'callbacks and refunds do not resend a sent receipt');
assert.equal((await q("select relrowsecurity from pg_class where oid='maib_payment_receipts'::regclass"))[0].relrowsecurity,true);
const bundleUser=crypto.randomUUID();
await q('insert into auth.users values($1)',[bundleUser]);
async function purchaseProduct(key, buyer = bundleUser, quantity = 1) {
  const product=maibProduct(key, quantity);
  const [placed]=await q(`insert into maib_payment_orders(user_id,environment,request_key,product_key,amount_minor,grants)
    values($1,'sandbox',$2,$3,$4,$5) returning *`,[buyer,crypto.randomUUID(),key,product.amount_minor,JSON.stringify(product.grants)]);
  const checkout=crypto.randomUUID(), payment=crypto.randomUUID();
  const args=[placed.id,'sandbox',checkout,payment,product.amount_minor,'MDL','paid',0];
  await q('select apply_maib_payment($1,$2,$3,$4,$5,$6,$7,$8,now())',args);
  await q('select apply_maib_payment($1,$2,$3,$4,$5,$6,$7,$8,now())',args);
  return {...placed,checkout,payment};
}
await purchaseProduct('cadastru_lookup_5');
const largePack=await purchaseProduct('cadastru_lookup_20');
const combo=await purchaseProduct('property_combo_1');
const bundleBalance=async feature => (await q('select remaining_uses from user_feature_credit_balances where user_id=$1 and feature_key=$2',[bundleUser,feature]))[0]?.remaining_uses;
assert.equal(await bundleBalance('cadastru_lookup'),26,'5, 20 and combo Cadastru credits stack exactly once');
assert.equal(await bundleBalance('sale_estimate'),1,'combo grants one market estimate');
assert.equal(await bundleBalance('pdf_report'),1,'combo grants one PDF report');
await q("select consume_user_feature_credit($1,'cadastru_lookup',$2,'{}')",[bundleUser,'bundle-cadastru']);
assert.equal(await bundleBalance('cadastru_lookup'),25,'new pack credits are consumable');
await q('select apply_maib_payment($1,$2,$3,$4,$5,$6,$7,$8,now())',[largePack.id,'sandbox',largePack.checkout,largePack.payment,29900,'MDL','refunded',29900]);
assert.equal(await bundleBalance('cadastru_lookup'),5,'refund removes unused credits from its own pack');
await q('select apply_maib_payment($1,$2,$3,$4,$5,$6,$7,$8,now())',[combo.id,'sandbox',combo.checkout,combo.payment,5900,'MDL','refunded',5900]);
assert.equal(await bundleBalance('sale_estimate'),0,'combo refund revokes unused estimate');
assert.equal(await bundleBalance('pdf_report'),0,'combo refund revokes unused PDF');
const allFeaturesUser=crypto.randomUUID();
await q('insert into auth.users values($1)',[allFeaturesUser]);
await purchaseProduct('all_features_5', allFeaturesUser);
const allTwenty=await purchaseProduct('all_features_20', allFeaturesUser);
const allBalances=async () => q('select feature_key,remaining_uses from user_feature_credit_balances where user_id=$1 order by feature_key',[allFeaturesUser]);
assert.equal((await allBalances()).length,6,'all-feature packs grant every feature');
assert.ok((await allBalances()).every(row=>row.remaining_uses===25),'5 and 20 uses stack per feature, despite duplicate payment confirmations');
await q("select consume_user_feature_credit($1,'sale_estimate',$2,'{}')",[allFeaturesUser,'all-feature-sale']);
await q('select apply_maib_payment($1,$2,$3,$4,$5,$6,$7,$8,now())',[allTwenty.id,'sandbox',allTwenty.checkout,allTwenty.payment,29900,'MDL','refunded',29900]);
for(const row of await allBalances()) assert.equal(row.remaining_uses,row.feature_key==='sale_estimate'?4:5,'refund preserves the other pack and consumed usage');
const quantityUser=crypto.randomUUID();
await q('insert into auth.users values($1)',[quantityUser]);
const quantityOrder=await purchaseProduct('cadastru_lookup_single',quantityUser,4);
assert.equal(quantityOrder.amount_minor,7700);
const quantityBalance=async () => (await q("select remaining_uses,total_used from user_feature_credit_balances where user_id=$1 and feature_key='cadastru_lookup'",[quantityUser]))[0];
assert.equal((await quantityBalance()).remaining_uses,4,'four discounted searches are granted once despite duplicate confirmations');
await q("select consume_user_feature_credit($1,'cadastru_lookup',$2,'{}')",[quantityUser,'quantity-search']);
assert.equal((await quantityBalance()).remaining_uses,3);
const quantityRefund=[quantityOrder.id,'sandbox',quantityOrder.checkout,quantityOrder.payment,7700,'MDL','refunded',7700];
await q('select apply_maib_payment($1,$2,$3,$4,$5,$6,$7,$8,now())',quantityRefund);
assert.equal((await quantityBalance()).remaining_uses,0,'bulk refund removes only the unused searches');
assert.equal((await quantityBalance()).total_used,1);
await db.close();
console.log('MAIB PostgreSQL regression checks passed.');
