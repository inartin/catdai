import { maibProduct, maibOrderQuantity } from './maib/products.mjs';
import { maibProductTitle } from './maib/purchase.mjs';

const origins = {
  cadastru_lookup: 'cadastru', sale_estimate: 'evaluation', rent_estimate: 'evaluation',
  listing_analysis: 'listing', yield_calculator: 'calculator', pdf_report: 'pdf',
};

export function checkoutOrigin(productKey, source) {
  if (source === 'pricing') return 'pricing';
  return origins[productKey?.replace(/_single$/, '')] || 'pricing';
}

// Only these fields may cross the analytics boundary. Never forward checkout URLs,
// receipt emails, property searches, auth tokens or arbitrary client metadata.
export function paymentEventParams(product, { checkout_source, buyer_type = 'guest', language = 'ro' } = {}) {
  if (!product) return null;
  return {
    currency: product.currency_code, value: product.amount_minor / 100,
    payment_provider: 'maib', checkout_origin: checkoutOrigin(product.key, checkout_source),
    buyer_type: buyer_type === 'account' ? 'account' : 'guest',
    language: ['ro', 'ru', 'en'].includes(language) ? language : 'ro',
    items: [{ item_id: product.key, item_name: maibProductTitle(product.key, 'en', product.quantity, checkout_source),
      price: product.amount_minor / 100, quantity: 1 }],
  };
}

export function verifiedAnalyticsContext(value, { user, productKey, checkoutSource, measurementId, production }) {
  if (!production || !value || value.analytics_consent !== true || value.measurement_id !== measurementId
    || !/^G-[A-Z0-9]+$/.test(measurementId || '')
    || typeof value.client_id !== 'string' || !/^\d{1,20}\.\d{1,20}$/.test(value.client_id)
    || typeof value.session_id !== 'string' || !/^\d{1,20}$/.test(value.session_id)) return null;
  return {
    measurement_id: measurementId, client_id: value.client_id, session_id: value.session_id,
    analytics_consent: true, checkout_origin: checkoutOrigin(productKey, checkoutSource),
    buyer_type: user?.is_anonymous ? 'guest' : 'account',
  };
}

export function paymentMeasurementPayload(event, order) {
  const context = order.ga4_context;
  if (!context?.analytics_consent || order.environment !== 'production') return null;
  // Immutable order snapshots supply all money and product data, not browser values
  // or today's catalog price. One GA item represents the purchased bundle.
  const product = { key: order.product_key, quantity: maibOrderQuantity(order),
    amount_minor: order.amount_minor, currency_code: order.currency_code };
  const params = paymentEventParams(product, { buyer_type: context.buyer_type, language: order.language });
  params.checkout_origin = context.checkout_origin;
  params.items[0].item_name = order.product_title || params.items[0].item_name;
  params.session_id = context.session_id;
  params.engagement_time_msec = 1;
  if (['purchase', 'refund'].includes(event.event_name)) params.transaction_id = order.id;
  if (event.event_name === 'refund') {
    params.value = event.amount_minor / 100;
    // Refund amounts can be partial; do not imply the whole bundle was returned.
    delete params.items;
  }
  if (event.event_name === 'payment_failed') params.checkout_error_reason = 'bank_reported_failure';
  return { client_id: context.client_id,
    timestamp_micros: Date.parse(event.occurred_at) * 1000,
    consent: { ad_user_data: 'DENIED', ad_personalization: 'DENIED' },
    events: [{ name: event.event_name, params }] };
}

export function catalogPaymentParams(productKey, options = {}) {
  return paymentEventParams(maibProduct(productKey, options.quantity ?? 1), options);
}
