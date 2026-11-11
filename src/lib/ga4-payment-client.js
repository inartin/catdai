import { catalogPaymentParams } from './ga4-payment.mjs';
import { readGoogleConsent } from './google-consent.mjs';

const browserEvents = new Set(['paid_offer_viewed', 'checkout_button_clicked', 'begin_checkout',
  'maib_pay_button_clicked', 'sent_to_maib', 'returned_from_maib', 'checkout_error']);

export function paymentAnalyticsAvailable() {
  try {
    return process.env.NODE_ENV === 'production' && typeof window !== 'undefined'
      && ['catdai.md', 'www.catdai.md'].includes(window.location.hostname)
      && !window.location.pathname.startsWith('/admin')
      && /^G-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GA_ID || '')
      && readGoogleConsent().analytics_storage === 'granted' && typeof window.gtag === 'function';
  } catch { return false; }
}

export function trackPaymentAnalytics(eventName, productKey, options = {}) {
  if (options.sandbox || !browserEvents.has(eventName) || !paymentAnalyticsAvailable()) return false;
  try {
    const params = catalogPaymentParams(productKey, options);
    if (!params) return false;
    const errorReasons = ['guest_session_unavailable', 'checkout_request_failed'];
    window.gtag('event', eventName, { ...params,
      ...(errorReasons.includes(options.error_reason) ? { checkout_error_reason: options.error_reason } : {}),
      send_to: process.env.NEXT_PUBLIC_GA_ID,
      page_location: window.location.origin + window.location.pathname,
      page_referrer: '', transport_type: 'beacon',
    });
    return true;
  } catch { return false; }
}

export async function capturePaymentAnalytics(sandbox = false) {
  if (sandbox || !paymentAnalyticsAvailable()) return null;
  const measurementId = process.env.NEXT_PUBLIC_GA_ID;
  try {
    const values = await Promise.race([
      Promise.all(['client_id', 'session_id'].map(field => new Promise(resolve => {
        window.gtag('get', measurementId, field, resolve);
      }))),
      new Promise(resolve => setTimeout(() => resolve(null), 400)),
    ]);
    if (!values || !paymentAnalyticsAvailable()) return null;
    return { measurement_id: measurementId, client_id: values[0], session_id: String(values[1] || ''),
      analytics_consent: true, ads_measurement_consent: readGoogleConsent().ad_user_data === 'granted' };
  } catch { return null; }
}
