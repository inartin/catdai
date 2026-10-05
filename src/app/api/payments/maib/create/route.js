import { NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { rateLimit } from '@/lib/rate-limit';
import { getPaymentProvider } from '@/lib/payment-provider';
import { environment, maibRequest, safeReturnTo, validateCheckoutUrl } from '@/lib/maib/client.mjs';
import { maibProduct } from '@/lib/maib/products.mjs';
import { checked, publicOrder } from '@/lib/maib/service.mjs';
import { UUID, requestUser, paymentOrigin, paymentError } from '@/lib/maib/http';
const limiter = rateLimit({ interval: 60_000, limit: 10 });
export async function POST(request) {
  if (getPaymentProvider() !== 'maib') return NextResponse.json({ error: 'MAIB checkout is inactive.' }, { status: 409 });
  const user = await requestUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!limiter.check(user.id).allowed) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const body = await request.json().catch(() => null);
  const product = maibProduct(body?.product_key);
  if (!product || !UUID.test(body?.request_key || '')) return NextResponse.json({ error: 'Invalid product or request key.' }, { status: 400 });
  try {
    if (!process.env.MAIB_SIGNATURE_KEY) throw new Error('MAIB callback signature key is missing');
    const existing = await checked(db.from('maib_payment_orders').select('*').eq('user_id', user.id)
      .eq('environment', environment()).eq('request_key', body.request_key).maybeSingle());
    if (existing) {
      if (existing.product_key !== product.key) return NextResponse.json({ error: 'Request key already used.' }, { status: 409 });
      return NextResponse.json(publicOrder(existing));
    }
    const lang = body.lang === 'ru' ? 'ru' : 'ro';
    const order = await checked(db.from('maib_payment_orders').insert({
      user_id: user.id, environment: environment(), request_key: body.request_key, product_key: product.key,
      amount_minor: product.amount_minor, currency_code: 'MDL', grants: product.grants, language: lang,
      return_to: safeReturnTo(body.return_to), next_check_at: new Date(Date.now() + 60_000).toISOString(),
    }).select('*').single());
    const origin = paymentOrigin();
    const returnUrl = `${origin}/payment/maib/success?order_id=${order.id}&lang=${lang}`;
    const email = user.email && !/^telegram-\d+@auth\.catdai\.md$/i.test(user.email) ? user.email : undefined;
    try {
      const result = await maibRequest('/v2/checkouts', { method: 'POST', body: {
        amount: product.amount_mdl, currency: 'MDL', language: lang,
        orderInfo: { id: order.id, description: `CatDai ${product.key}`, date: order.created_at,
          orderAmount: product.amount_mdl, orderCurrency: 'MDL', items: [{ externalId: product.key, title: `CatDai ${product.key}`, amount: product.amount_mdl, currency: 'MDL', quantity: 1 }] },
        payerInfo: { ...(email ? { email } : {}) },
        callbackUrl: `${origin}/api/maib/callback`, successUrl: returnUrl, failUrl: returnUrl,
      }});
      if (!UUID.test(result.checkoutId || '')) throw new Error('Invalid checkout id');
      const checkoutUrl = validateCheckoutUrl(result.checkoutUrl);
      // A fast callback may already have finalized this order. Never regress its state.
      await checked(db.from('maib_payment_orders').update({ checkout_id: result.checkoutId, checkout_url: checkoutUrl, status: 'registered' }).eq('id', order.id).in('status', ['pending','creation_unknown']));
      const saved = await checked(db.from('maib_payment_orders').select('*').eq('id', order.id).single());
      return NextResponse.json(publicOrder(saved));
    } catch (error) {
      await checked(db.from('maib_payment_orders').update({ status: error.definitive ? 'failed' : 'creation_unknown', last_error: 'Checkout creation could not be confirmed.' }).eq('id', order.id).eq('status', 'pending'));
      return NextResponse.json({ ...publicOrder(order), status: error.definitive ? 'failed' : 'creation_unknown' }, { status: 202 });
    }
  } catch (error) { return paymentError(error); }
}
