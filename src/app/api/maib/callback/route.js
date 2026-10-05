import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabase-admin';
import { validSignature, validatePayment, environment } from '@/lib/maib/client.mjs';
import { checked, getOrder, reconcileOrder } from '@/lib/maib/service.mjs';
import { UUID, paymentError } from '@/lib/maib/http';
export async function POST(request) {
  const raw = await request.text();
  if (raw.length > 65536 || !validSignature(raw, request.headers)) return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  let payload;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (!UUID.test(payload.orderId || '') || !UUID.test(payload.checkoutId || '')) return NextResponse.json({ error: 'Invalid order.' }, { status: 400 });
  try {
    const order = await getOrder(payload.orderId);
    if (!order) return NextResponse.json({ error: 'Unknown order.' }, { status: 404 });
    validatePayment(order, { paymentId: payload.paymentId, orderId: payload.orderId, amount: payload.paymentAmount, currency: payload.paymentCurrency });
    if (payload.amount !== payload.paymentAmount || payload.currency !== payload.paymentCurrency || (order.checkout_id && order.checkout_id !== payload.checkoutId)) return NextResponse.json({ error: 'Checkout mismatch.' }, { status: 400 });
    const hash = crypto.createHash('sha256').update(`${environment()}:`).update(raw).digest('hex');
    // Audit only the verification fields, not payer or card data.
    await checked(db.from('maib_callback_events').upsert({ delivery_hash: hash, order_id: order.id,
      payload: { checkoutId: payload.checkoutId, paymentId: payload.paymentId, paymentStatus: payload.paymentStatus, amount: payload.paymentAmount, currency: payload.paymentCurrency } }, { onConflict: 'delivery_hash', ignoreDuplicates: true }));
    try {
      await reconcileOrder(order, payload.checkoutId);
      await checked(db.from('maib_callback_events').update({ processed_at: new Date().toISOString(), last_error: null }).eq('delivery_hash', hash));
    } catch (error) {
      await checked(db.from('maib_callback_events').update({ last_error: 'Reconciliation failed; retry required.' }).eq('delivery_hash', hash));
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return paymentError(error); }
}
