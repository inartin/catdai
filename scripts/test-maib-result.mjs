// Isolated return-page rendering and polling; never contacts a bank or database.
// pnpm exec node --experimental-vm-modules scripts/test-maib-result.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as products from '../src/lib/maib/products.mjs';
import * as purchase from '../src/lib/maib/purchase.mjs';
import * as guestCheckout from '../src/lib/guest-checkout.mjs';
import * as paymentResult from '../src/lib/maib/result.mjs';
import { FEATURE_PURCHASE_CONTENT } from '../src/lib/feature-purchase-content.js';

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const { code } = await transform(await fs.readFile('src/components/MaibPaymentPage.js', 'utf8'), {
  filename: 'src/components/MaibPaymentPage.js',
  jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
  module: { type: 'es6' },
});
const noop = () => {};
const jsx = (type, props) => typeof type === 'function' ? type(props) : ({ type, props });
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return Array.isArray(node) ? node.map(text).join(' ') : text(node.props?.children);
}

async function page(lang, initialStatus, options = {}) {
  const translations = JSON.parse(await fs.readFile(`src/locales/${lang}.json`, 'utf8'));
  const slots = [], effects = [], timers = new Map(), cleared = [], redirects = [];
  const stored = new Map();
  const storage = {
    getItem: key => { if (options.storageError) throw Error('Storage blocked'); return stored.get(key) ?? null; },
    setItem: (key, value) => { if (options.storageError) throw Error('Storage blocked'); stored.set(key, value); },
    removeItem: key => { if (options.storageError) throw Error('Storage blocked'); stored.delete(key); cleared.push(key); },
  };
  let cursor = 0, timerId = 0, status = initialStatus, fetchError = false, verificationPending = false, requests = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        previous?.cleanup?.();
        const slot = slots[index] = { deps };
        effects.push(() => { slot.cleanup = effect(); });
      }
    },
  };
  const session = { access_token: 'isolated-token' }, user = { id: 'buyer' };
  const language = { lang, t: (key, vars = {}) => Object.entries(vars).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)), translations[key] ?? key), setLang: noop };
  const mocks = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/link': { default: 'Link' },
    '@/context/AuthContext': { useAuth: () => ({ session, user, loading: false, isGuest: options.isGuest || false }) },
    '@/context/LanguageContext': { useTranslation: () => language },
    '@/lib/maib/products.mjs': products, '@/lib/maib/purchase.mjs': purchase,
    '@/lib/guest-checkout.mjs': { ...guestCheckout,
      queueGuestAccountPrompt: notice => guestCheckout.queueGuestAccountPrompt(notice, storage) },
    '@/lib/maib/result.mjs': paymentResult,
    '@/lib/feature-purchase-content': { FEATURE_PURCHASE_CONTENT },
    '@/lib/tracking': { trackPaymentCheckoutEvent: noop },
    '@/lib/payment-urls.mjs': { paymentAppLink: path => path },
  };
  const context = vm.createContext({
    console, URL, URLSearchParams, Date, process, AbortController,
    window: { location: { search: `?order_id=order&lang=${lang}&status=paid&return_to=%2Fevil`, replace: url => redirects.push(url) } },
    sessionStorage: storage,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    fetch: async (url, options) => {
      assert.equal(url, '/api/payments/maib/status?order_id=order');
      assert.equal(options.headers.Authorization, 'Bearer isolated-token');
      assert.equal(options.method, undefined, 'The return page only reads payment status');
      requests++;
      if (fetchError) throw Error('Network unavailable');
      return Response.json({ order_id: 'order', product_key: 'cadastru_lookup_single', status,
        grants: { cadastru_lookup: 1 }, amount_minor: 1500, currency_code: 'MDL', quantity: 1,
        paid_at: status === 'paid' ? '2026-10-27T10:49:22Z' : null, return_to: '/cadastru/rezultat?number=123',
        verification_pending: verificationPending, ...orderOverrides });
    },
  });
  const orderOverrides = options.order || {};
  async function link(name) {
    const exports = mocks[name] || (name.startsWith('@/components/') ? { default: name } : null);
    assert(exports, `Missing mock ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  }
  const cardSource = await transform(await fs.readFile('src/components/MaibPaymentResultCard.js', 'utf8'), {
    filename: 'src/components/MaibPaymentResultCard.js',
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' },
  });
  const card = new vm.SourceTextModule(cardSource.code, { context });
  await card.link(link); await card.evaluate();
  mocks['@/components/MaibPaymentResultCard'] = card.namespace;
  const mod = new vm.SourceTextModule(code, { context });
  await mod.link(link);
  await mod.evaluate();
  async function render() {
    let tree;
    for (let i = 0; i < 3; i++) {
      cursor = 0; tree = mod.namespace.default({ result: true, sandbox: true });
      for (const effect of effects.splice(0)) effect();
      await new Promise(setImmediate);
    }
    return tree;
  }
  return { render, cleared, redirects, timers, translations, storage, requests: () => requests,
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    async update(nextStatus, { error = false, unverified = false } = {}) {
      status = nextStatus;
      fetchError = error; verificationPending = unverified;
      const timer = timers.entries().next().value;
      assert(timer, 'Pending status schedules another check');
      timers.delete(timer[0]); await timer[1]();
      return render();
    },
  };
}

for (const lang of ['ro', 'ru']) {
  const view = await page(lang, 'registered');
  let tree = await view.render();
  assert.equal(text(nodes(tree).find(node => node.type === 'h1')), view.translations['maib.result.pendingTitle']);
  assert.equal(nodes(tree).filter(node => node.props?.role === 'alert').length, 0);
  assert.equal(view.redirects.length, 0, 'Redirect parameters cannot confirm a payment');
  const details = nodes(tree).find(node => node.type === 'details');
  assert.equal(details.props.open, undefined, 'Order details start collapsed');
  assert.equal(text(nodes(details).find(node => node.type === 'summary')).trim(), view.translations['maib.result.details']);
  assert(text(details).includes('order'), 'Order number stays inside the disclosure');

  tree = await view.update('failed');
  const all = nodes(tree), heading = all.find(node => node.type === 'h1');
  const alert = all.find(node => node.props?.role === 'alert');
  assert.equal(text(heading), lang === 'ro' ? 'Plata nu a fost finalizată' : 'Оплата не завершена');
  assert(text(alert).includes(view.translations['maib.result.failedMessage']));
  assert(all.indexOf(alert) < all.findIndex(node => node.type === 'h2'));
  assert(!text(tree).includes(view.translations['maib.notPaid']), 'Failure never suggests confirmation is pending');
  assert.equal(view.timers.size, 0, 'Verified failure stops polling');
  assert.deepEqual(view.cleared, ['catdai:maib:request:buyer:cadastru_lookup_single']);
  assert.deepEqual(view.redirects, []);
  const retry = all.find(node => node.type === 'Link' && text(node) === view.translations['maib.result.retry']);
  const retryUrl = new URL(retry.props.href, 'https://catdai.test');
  assert.equal(retryUrl.pathname, '/payment/maib/checkout');
  assert.equal(retryUrl.searchParams.get('product_key'), 'cadastru_lookup_single');
  assert.equal(retryUrl.searchParams.get('quantity'), '1');
  assert.equal(retryUrl.searchParams.get('return_to'), '/cadastru/rezultat?number=123');
  assert.equal(retryUrl.searchParams.get('lang'), lang);
  assert.equal(retryUrl.searchParams.has('checkout_source'), false);
  assert(all.some(node => node.type === 'Link' && text(node) === view.translations['maib.result.back.cadastru'] && node.props.href === '/cadastru/rezultat?number=123'));

  const reloaded = await page(lang, 'failed');
  assert(nodes(await reloaded.render()).some(node => node.props?.role === 'alert'));
  for (const status of ['canceled', 'expired', 'refunded']) {
    const other = await page(lang, status), otherTree = await other.render();
    assert(text(otherTree).includes(other.translations['maib.status.' + status]));
    assert(!text(otherTree).includes(other.translations['maib.notPaid']));
    assert.equal(other.redirects.length, 0);
  }

  for (const isGuest of [false, true]) {
    for (const [feature, returnTo, kind] of [
      ['cadastru_lookup', '/ru/cadastru/rezultat?share_slug=property#map', 'cadastru'],
      ['sale_estimate', '/evaluare?city=Chisinau&id=property', 'estimate'],
      ['rent_estimate', '/evaluare?type=rent&city=Balti', 'estimate'],
      ['listing_analysis', '/anunt?url=999', 'listing'],
      ['yield_calculator', '/calculator?price=100000', 'yield'],
      ['pdf_report', '/evaluare?city=Chisinau#report', 'estimate'],
    ]) {
      const success = await page(lang, 'paid', { isGuest, order: { product_key: feature + '_single', grants: { [feature]: 1 }, return_to: returnTo } });
      const paidTree = await success.render();
      assert.deepEqual(success.redirects, [returnTo], 'Both registered and guest users return immediately to the saved property');
      assert.equal(guestCheckout.consumeGuestAccountPrompt('buyer', returnTo, success.storage), isGuest,
        'Only a verified guest purchase queues the notice for its saved result');
      assert.equal(guestCheckout.consumeGuestAccountPrompt('buyer', returnTo, success.storage), false,
        'Refreshing the purchased result cannot repeat the notice');
      assert.equal(text(nodes(paidTree).find(node => node.type === 'h1')), success.translations['maib.result.successTitle']);
      assert(text(paidTree).includes(success.translations['maib.result.purchased.' + feature + '.one'].replace('{count}', '1')));
      assert(nodes(paidTree).some(node => node.type === 'Link' && text(node).includes(success.translations['maib.result.view.' + kind]) && node.props.href === returnTo));
    }
  }

  for (const [product_key, grants, count] of [
    ['cadastru_lookup_single', { cadastru_lookup: 1 }, 1],
    ['all_features_5', products.maibProduct('all_features_5').grants, 30],
    ['credits_10', products.maibProduct('credits_10').grants, 10],
    ['credits_50', products.maibProduct('credits_50').grants, 50],
  ]) {
    const pricing = await page(lang, 'paid', { order: { product_key, grants, return_to: '/profile' } });
    const pricingTree = await pricing.render();
    assert.equal(pricing.redirects.length, 0, 'Pricing purchases stay on the summary page');
    const plural = new Intl.PluralRules(lang).select(count);
    assert(text(pricingTree).includes(pricing.translations['maib.result.purchased.general.' + plural].replace('{count}', String(count))));
    assert(!text(pricingTree).includes('maib.result.purchased.'), 'All localized purchase summaries resolve');
    assert(nodes(pricingTree).some(node => node.type === 'Link' && node.props.href === '/profile'));
  }
  const pricingFailure = await page(lang, 'failed', { order: { return_to: '/profile', quantity: 3, grants: { cadastru_lookup: 3 } } });
  const pricingRetry = nodes(await pricingFailure.render()).find(node => node.type === 'Link' && text(node) === pricingFailure.translations['maib.result.retry']);
  const pricingRetryUrl = new URL(pricingRetry.props.href, 'https://catdai.test');
  assert.equal(pricingRetryUrl.searchParams.get('checkout_source'), 'pricing');
  assert.equal(pricingRetryUrl.searchParams.get('quantity'), '3');
}

const polling = await page('ro', 'registered');
let pendingTree = await polling.render();
for (let i = 0; i < 27; i++) pendingTree = await polling.update('registered');
assert.equal(polling.timers.size, 1, 'Polling continues beyond the previous 24-check limit');
let oldRequests = polling.requests();
nodes(pendingTree).find(node => node.type === 'button' && text(node) === polling.translations['maib.refresh']).props.onClick();
await polling.render();
assert.equal(polling.requests(), oldRequests + 1, 'The primary action checks status immediately');
let networkTree = await polling.update('registered', { error: true });
assert(text(networkTree).includes(polling.translations['maib.statusError']));
assert.equal(polling.timers.size, 1, 'Network errors keep polling without offering another payment');
assert.equal(nodes(networkTree).filter(node => node.type === 'Link' && text(node) === polling.translations['maib.result.retry']).length, 0);
networkTree = await polling.update('registered', { unverified: true });
assert(text(networkTree).includes(polling.translations['maib.statusError']), 'Bank verification errors remain visible');
await polling.update('paid');
assert.deepEqual(polling.redirects, ['/cadastru/rezultat?number=123'], 'Delayed confirmation also returns to the property');
assert.equal(polling.timers.size, 0);

const leaving = await page('ro', 'registered');
await leaving.render(); leaving.unmount();
assert.equal(leaving.timers.size, 0, 'Leaving the page stops scheduled checks');
const storageBlocked = await page('ro', 'paid', { storageError: true, isGuest: true });
await storageBlocked.render();
assert.equal(storageBlocked.redirects.length, 1, 'Restricted browser storage cannot block a verified return');
for (const return_to of ['https://evil.test', '//evil.test', '/payment/maib/success?order_id=other']) {
  const unsafe = await page('ro', 'paid', { order: { return_to } });
  await unsafe.render();
  assert.equal(unsafe.redirects.length, 0, 'Unknown or external destinations never auto-redirect');
}
console.log('MAIB result: contextual RO/RU cards, retry links, collapsed details, continuous polling and verified property returns passed.');
