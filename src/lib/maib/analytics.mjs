import { paymentMeasurementPayload } from '../ga4-payment.mjs';

export function paymentAnalyticsConfig() {
  const measurementId = process.env.NEXT_PUBLIC_GA_ID;
  const secret = process.env.GA4_API_SECRET;
  if (process.env.NODE_ENV !== 'production' || process.env.MAIB_ENVIRONMENT !== 'production'
    || !/^G-[A-Z0-9]+$/.test(measurementId || '') || !secret) return null;
  return { measurementId, secret };
}

export async function deliverPaymentAnalytics(db, { config = paymentAnalyticsConfig(), fetchImpl = fetch, now = Date.now } = {}) {
  if (!config) return;
  const checked = async query => { const { data, error } = await query; if (error) throw error; return data; };
  for (let index = 0; index < 10; index++) {
    const events = await checked(db.rpc('claim_ga4_payment_events', { p_limit: 1 }));
    const event = events?.[0];
    if (!event) break;
    const order = await checked(db.from('maib_payment_orders').select('*').eq('id', event.order_id).single());
    const payload = paymentMeasurementPayload(event, order);
    let result;
    if (!payload || order.ga4_context.measurement_id !== config.measurementId || !Number.isFinite(payload.timestamp_micros)
      || now() - payload.timestamp_micros / 1000 > 72 * 3600_000) {
      result = { status: 'skipped', last_error: 'Missing consent, wrong stream or event older than 72 hours.' };
    } else {
      try {
        const url = new URL('https://www.google-analytics.com/mp/collect');
        url.searchParams.set('measurement_id', config.measurementId);
        url.searchParams.set('api_secret', config.secret);
        const response = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
        // GA's 2xx acknowledges receipt, not validation. Validate payloads with
        // /debug/mp/collect during rollout; never log credentials or response data.
        if (response.ok) result = { status: 'sent', sent_at: new Date(now()).toISOString(), last_error: null };
        else result = { status: response.status >= 500 || response.status === 429 ? 'failed' : 'unknown',
          next_attempt_at: new Date(now() + Math.min(3600_000, 60_000 * 2 ** Math.min(event.attempts, 6))).toISOString(),
          last_error: `Google Analytics HTTP ${response.status}; check configuration before manual retries.` };
      } catch {
        result = event.event_name === 'purchase'
          ? { status: 'failed', next_attempt_at: new Date(now() + 60_000).toISOString(), last_error: 'Analytics delivery unconfirmed; purchase retry scheduled.' }
          : { status: 'unknown', last_error: 'Analytics delivery unconfirmed; inspect before resending.' };
      }
    }
    await checked(db.from('ga4_payment_events').update({ ...result, lease_until: null, lease_token: null })
      .eq('id', event.id).eq('lease_token', event.lease_token));
  }
}
