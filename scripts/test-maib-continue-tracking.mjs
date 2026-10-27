// Isolated checkout behavior and event endpoint checks; no bank or database calls.
// pnpm exec node --experimental-vm-modules scripts/test-maib-continue-tracking.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { receiptEmail, MAIB_TERMS_VERSION } from '../src/lib/maib/purchase.mjs';

const source = await fs.readFile('src/components/MaibPaymentPage.js', 'utf8');
const startSource = source.slice(source.indexOf('  async function start(event)'), source.indexOf('  // The result destination'));
assert.ok(startSource.startsWith('  async function start(event)'));
const events = [];
let bankCalls = 0;
let fail = true;
const state = {
  inFlight: { current: false }, product: { key: 'cadastru_lookup_single', quantity: 1 },
  session: { access_token: 'token' }, user: { id: 'buyer' }, accepted: true, guestAllowed: false,
  email: 'buyer@example.com', lang: 'ro', params: new URLSearchParams({ checkout_source: 'pricing' }),
  receiptEmail, MAIB_TERMS_VERSION, crypto: { randomUUID: () => 'request' },
  sessionStorage: { getItem: () => 'request', setItem() {} },
  setBusy() {}, setError() {}, t: (key) => key,
  trackPaymentCheckoutEvent: (event, metadata) => events.push({ event, metadata }),
  paymentAppLink: (path) => path, window: { location: { assign() {} } },
  fetch: async (_url, options) => {
    bankCalls++;
    assert.equal(JSON.parse(options.body).checkout_source, 'pricing', 'Checkout forwards its naming context');
    assert.equal(events.at(-1).event, 'maib_continue_clicked', 'Track before the bank request');
    return { ok: !fail, json: async () => ({ order_id: 'order', checkout: { url: 'https://checkout.maib.md/test' } }) };
  },
};
vm.createContext(state);
vm.runInContext(`${startSource}\nthis.submit = start;`, state);
const submit = () => state.submit({ preventDefault() {} });
for (const [key, blocked] of [['accepted', false], ['email', 'invalid'], ['session', null], ['product', null]]) {
  const original = state[key]; state[key] = blocked;
  await submit();
  state[key] = original;
}
assert.equal(events.length, 0, 'Invalid submissions do not count');
assert.equal(bankCalls, 0);
await submit();
assert.equal(events.length, 1, 'Failed bank attempts still count');
assert.equal(state.inFlight.current, false, 'A failed attempt permits a deliberate retry');
assert.equal(events[0].metadata.accessToken, 'token');
assert.equal(events[0].metadata.provider, 'maib');
assert.equal(events[0].metadata.product_key, 'cadastru_lookup_single');
fail = false;
await submit();
assert.deepEqual(events.map(({ event }) => event), ['maib_continue_clicked', 'maib_continue_clicked', 'checkout_order_created']);
await submit();
assert.equal(bankCalls, 2, 'Duplicate submissions while in flight do not create another attempt');
assert.equal(events.length, 3);

const rows = [];
const mocks = {
  "@/lib/statistics-context": { getStatisticsVisitor: () => null, shouldCollectStatistics: () => true, withStatisticsContext: handler => handler },
  'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  '@/lib/access-tier': { resolveAccessTier: async () => ({ user_id: 'buyer' }) },
  '@/lib/rate-limit': { rateLimit: () => ({ check: () => ({ allowed: true }) }) },
  '@/lib/payment-provider': { getPaymentProvider: () => 'maib' },
  '@/lib/supabase-admin': { supabaseAdmin: { from: (table) => {
    assert.equal(table, 'payment_checkout_events');
    return { insert: async (row) => { rows.push(row); return { error: null }; } };
  } } },
};
const context = vm.createContext({ console });
const route = new vm.SourceTextModule(await fs.readFile('src/app/api/payment-checkout-events/route.js', 'utf8'), { context });
await route.link((id) => {
  assert.ok(mocks[id], `Unexpected import: ${id}`);
  return new vm.SyntheticModule(Object.keys(mocks[id]), function () {
    for (const [key, value] of Object.entries(mocks[id])) this.setExport(key, value);
  }, { context });
});
await route.evaluate();
const post = (event_type) => route.namespace.POST(new Request('https://catdai.md/api/payment-checkout-events', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ event_type, provider: 'maib', product_key: 'cadastru_lookup_single', device_id: 'device' }),
}));
assert.equal((await post('maib_continue_clicked')).status, 200);
assert.equal(rows[0].event_type, 'maib_continue_clicked');
assert.equal(rows[0].user_id, 'buyer');
assert.equal(rows[0].device_id, 'device');
assert.equal(rows[0].maib_order_id, null, 'Clicks do not require an order to exist');
assert.equal((await post('unknown_event')).status, 400);
assert.equal(rows.length, 1);
console.log('MAIB continue tracking checks passed.');
