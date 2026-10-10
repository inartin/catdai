import nodemailer from 'nodemailer';
import { MERCHANT } from '../merchant.mjs';
import { paymentSiteOrigin } from '../payment-urls.mjs';
import { MAIB_FEATURE_LABELS, purchaseMessages, receiptEmail } from './purchase.mjs';
import { maibOrderQuantity } from './products.mjs';

export function receiptConfig(env = process.env) {
  const port = Number(env.MAIB_SMTP_PORT || 587);
  const from = receiptEmail(env.MAIB_RECEIPT_FROM);
  const merchant = env.MAIB_MERCHANT_NAME?.trim() || MERCHANT.legalName;
  if (!env.MAIB_SMTP_HOST || !env.MAIB_SMTP_USER || !env.MAIB_SMTP_PASSWORD || !from || !merchant || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { from, merchant, transport: {
    host: env.MAIB_SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
    auth: { user: env.MAIB_SMTP_USER, pass: env.MAIB_SMTP_PASSWORD },
    connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
  } };
}

export function buildReceipt(order, merchant) {
  if (!receiptEmail(order.receipt_email) || !order.paid_at || !order.product_title) throw new Error('Incomplete receipt');
  const messages = purchaseMessages(order.language);
  const origin = paymentSiteOrigin();
  const paidAt = new Date(order.paid_at).toLocaleString(order.language === 'ru' ? 'ru-MD' : 'ro-MD', {
    timeZone: 'Europe/Chisinau', dateStyle: 'long', timeStyle: 'short',
  });
  const amount = (order.amount_minor / 100).toLocaleString(order.language === 'ru' ? 'ru-MD' : 'ro-MD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const values = {
    merchant, siteUrl: origin, orderId: order.id, paidAt, amount,
    currency: order.currency_code, productTitle: order.product_title, quantity: maibOrderQuantity(order),
    sandbox: order.environment === 'sandbox' ? messages['maib.sandbox'] : '',
    features: Object.entries(order.grants).filter(([feature]) => MAIB_FEATURE_LABELS[feature])
      .map(([feature, count]) => `${messages[MAIB_FEATURE_LABELS[feature]]}: ${count}`).join('\n\n'),
    refund: order.refunded_minor > 0
      ? `${messages['maib.refundedAmount']}: ${(order.refunded_minor / 100).toFixed(2)} ${order.currency_code}` : '',
    orderUrl: `${origin}/payment/maib/success?order_id=${encodeURIComponent(order.id)}&lang=${order.language === 'ru' ? 'ru' : 'ro'}`,
  };
  const fill = template => template.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? values[key] : match);
  return {
    subject: fill(messages['maib.receiptSubject']),
    text: messages['maib.receiptBody'].map(fill).filter(Boolean).join('\n\n'),
  };
}

// Only an explicit rejection or a failure before SMTP DATA is safe to retry.
export function retryableReceiptError(error) {
  return error.definitive === true || Number(error.responseCode) >= 400 || ['CONN','EHLO','HELO','STARTTLS','AUTH','MAIL FROM','RCPT TO'].includes(error.command);
}

export async function deliverReceipts(db, bankEnvironment, { config = receiptConfig(), createTransport = nodemailer.createTransport } = {}) {
  if (!config) return 0;
  const checked = async query => {
    const { data, error } = await query;
    if (error) throw error;
    return data;
  };
  const transport = createTransport(config.transport);
  let delivered = 0;
  try {
    // Claim one at a time so no queued claim expires while another email is sending.
    for (let index = 0; index < 10; index++) {
      const claims = await checked(db.rpc('claim_maib_receipts', { p_environment: bankEnvironment, p_limit: 1 }));
      const claim = claims?.[0];
      if (!claim) break;
      let result;
      let submitted = false;
      try {
        const order = await checked(db.from('maib_payment_orders').select('*').eq('id', claim.order_id).eq('environment', bankEnvironment).single());
        const receipt = buildReceipt(order, config.merchant);
        submitted = true;
        const info = await transport.sendMail({
          from: { name: config.merchant, address: config.from }, to: order.receipt_email,
          messageId: `<maib-${order.id}@catdai.md>`, ...receipt,
        });
        if (!info.accepted?.some(email => email.toLowerCase() === order.receipt_email.toLowerCase())) throw Object.assign(new Error('Recipient rejected'), { definitive: true });
        result = { status: 'sent', sent_at: new Date().toISOString(), last_error: null };
        delivered++;
      } catch (error) {
        const retry = !submitted || retryableReceiptError(error);
        const delay = Math.min(60, 2 ** Math.min(claim.attempts - 1, 6)) * 60_000;
        result = { status: retry ? 'failed' : 'unknown', next_attempt_at: new Date(Date.now() + delay).toISOString(),
          last_error: retry ? 'SMTP rejected delivery; retry scheduled.' : 'Delivery outcome unknown; inspect SMTP logs before retrying.' };
      }
      // If saving the outcome fails, retain the sending lease; expiration becomes unknown.
      await checked(db.from('maib_payment_receipts').update({ ...result, lease_until: null, lease_token: null })
        .eq('order_id', claim.order_id).eq('lease_token', claim.lease_token).eq('status', 'sending'));
    }
  } finally { transport.close(); }
  return delivered;
}
