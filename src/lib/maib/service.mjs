import { supabaseAdmin as db } from '../supabase-admin.js';
import { environment, maibRequest, minorUnits, validateCheckoutUrl, validatePayment } from './client.mjs';

export async function checked(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
export async function getOrder(id, userId) {
  let query = db.from('maib_payment_orders').select('*').eq('id', id).eq('environment', environment());
  if (userId) query = query.eq('user_id', userId);
  return checked(query.maybeSingle());
}
export function publicOrder(order) {
  return { order_id: order.id, product_key: order.product_key, status: order.status,
    amount_minor: order.amount_minor, currency_code: order.currency_code, environment: order.environment,
    product_title: order.product_title, grants: order.grants, quantity: 1,
    paid_at: order.paid_at, created_at: order.created_at,
    return_to: order.return_to, language: order.language, refunded_minor: order.refunded_minor,
    checkout: order.checkout_url && ['pending','registered','creation_unknown'].includes(order.status) ? { url: order.checkout_url } : null };
}
async function applyPayment(order, payment, checkoutId) {
  validatePayment(order, payment);
  const status = { Executed: 'paid', PartiallyRefunded: 'partially_refunded', Refunded: 'refunded' }[payment.status];
  if (!status) return;
  await checked(db.rpc('apply_maib_payment', {
    p_order_id: order.id, p_environment: environment(), p_checkout_id: checkoutId,
    p_payment_id: payment.paymentId, p_amount_minor: minorUnits(payment.amount),
    p_currency: payment.currency, p_status: status,
    p_refunded_minor: minorUnits(payment.refundedAmount ?? 0), p_paid_at: payment.executedAt || new Date().toISOString(),
  }));
}
export async function reconcileOrder(order, expectedCheckoutId) {
  if (!order || order.environment !== environment()) throw new Error('Unknown MAIB order');
  if (expectedCheckoutId && order.checkout_id && expectedCheckoutId !== order.checkout_id) throw new Error('Checkout mismatch');
  let checkoutId = order.checkout_id || expectedCheckoutId;
  if (!checkoutId) {
    const list = await maibRequest(`/v2/checkouts?orderId=${encodeURIComponent(order.id)}&count=2`);
    const items = (list.items || []).filter(item => item.order?.id === order.id);
    if (items.length > 1) throw new Error('Multiple MAIB checkouts require review');
    if (!items.length) return order; // Unknown creation is never retried automatically.
    checkoutId = items[0].id;
  }
  const checkout = await maibRequest(`/v2/checkouts/${checkoutId}`);
  if (checkout.id !== checkoutId || checkout.order?.id !== order.id ||
    checkout.currency !== order.currency_code || minorUnits(checkout.amount) !== order.amount_minor) throw new Error('Checkout mismatch');
  const checkoutUrl = validateCheckoutUrl(checkout.url);
  await checked(db.from('maib_payment_orders').update({ checkout_id: checkoutId, checkout_url: checkoutUrl })
    .eq('id', order.id).or(`checkout_id.is.null,checkout_id.eq.${checkoutId}`));
  if (checkout.payment?.paymentId) {
    const payment = await maibRequest(`/v2/payments/${checkout.payment.paymentId}`);
    await applyPayment(order, payment, checkoutId);
    if (payment.status === 'Failed' && checkout.status === 'Failed') {
      await checked(db.from('maib_payment_orders').update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', order.id).in('status', ['pending','registered','creation_unknown']));
    }
  } else {
    const status = { Failed: 'failed', Cancelled: 'canceled', Expired: 'expired', Abandoned: 'expired' }[checkout.status] || 'registered';
    await checked(db.from('maib_payment_orders').update({ status, updated_at: new Date().toISOString() })
      .eq('id', order.id).in('status', ['pending','registered','creation_unknown']));
  }
  let current = await getOrder(order.id);
  const attempts = await checked(db.from('maib_refund_attempts').select('*').eq('order_id', order.id)
    .in('status', ['submitting','unknown','Created','Requested','Manual']));
  for (const attempt of attempts || []) {
    if (!attempt.refund_id) continue; // Recover unknown submissions through payment status, never POST again.
    const refund = await maibRequest(`/v2/payments/refunds/${attempt.refund_id}`);
    if (refund.id !== attempt.refund_id || refund.paymentId !== current.payment_id ||
      refund.currency !== current.currency_code || minorUnits(refund.amount) !== attempt.amount_minor) throw new Error('Refund mismatch');
    if (!['Created','Requested','Accepted','Rejected','Manual'].includes(refund.status)) throw new Error('Unknown refund status');
    if (refund.status === 'Accepted') {
      // The reserved amount was the entire outstanding balance. Accepted proves full reimbursement.
      await checked(db.rpc('apply_maib_payment', { p_order_id: current.id, p_environment: environment(),
        p_checkout_id: current.checkout_id, p_payment_id: current.payment_id, p_amount_minor: current.amount_minor,
        p_currency: current.currency_code, p_status: 'refunded', p_refunded_minor: current.amount_minor,
        p_paid_at: current.paid_at }));
    }
    await checked(db.from('maib_refund_attempts').update({ status: refund.status, updated_at: new Date().toISOString(), last_error: null })
      .eq('id', attempt.id).in('status', ['submitting','unknown','Created','Requested','Manual']));
  }
  current = await getOrder(order.id);
  return current;
}
export async function requestFullRefund(order, reason) {
  const current = await reconcileOrder(order);
  if (!current.payment_id || !['paid','partially_refunded'].includes(current.status)) throw new Error('Payment is not refundable');
  const payment = validatePayment(current, await maibRequest(`/v2/payments/${current.payment_id}`));
  const amountMinor = current.amount_minor - current.refunded_minor;
  if (!payment.isRefundable || minorUnits(payment.refundableAmount) !== amountMinor || Number(payment.requestedRefundAmount) > 0) throw new Error('Payment already has a refund or is not refundable');
  const attemptId = await checked(db.rpc('reserve_maib_refund', { p_order_id: current.id, p_amount_minor: amountMinor, p_reason: reason }));
  try {
    const result = await maibRequest(`/v2/payments/${current.payment_id}/refund`, { method: 'POST', body: { amount: amountMinor / 100, reason } });
    if (!result.refundId || result.status !== 'Created') throw new Error('Uncertain refund response');
    await checked(db.from('maib_refund_attempts').update({ refund_id: result.refundId, status: result.status }).eq('id', attemptId).eq('status', 'submitting'));
  } catch (error) {
    await checked(db.from('maib_refund_attempts').update({ status: error.definitive ? 'Rejected' : 'unknown', last_error: 'Refund submission could not be confirmed. Reconcile before retrying.' }).eq('id', attemptId).eq('status', 'submitting'));
    if (error.definitive) throw error;
  }
  return checked(db.from('maib_refund_attempts').select('id,status,amount_minor').eq('id', attemptId).single());
}
