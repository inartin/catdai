// Isolated pricing and checkout rendering; no bank, database, or server calls.
// pnpm exec node --experimental-vm-modules scripts/test-pricing.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as products from '../src/lib/maib/products.mjs';
import * as purchase from '../src/lib/maib/purchase.mjs';
import * as guestCheckout from '../src/lib/guest-checkout.mjs';
import { FEATURE_PURCHASE_CONTENT } from '../src/lib/feature-purchase-content.js';

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require('next/dist/build/swc');
await loadBindings();
const noop = () => null;
const jsx = (type, props) => ({ type, props });
const locales = Object.fromEntries(await Promise.all(['ro', 'ru', 'en'].map(async lang =>
  [lang, JSON.parse(await fs.readFile(`src/locales/${lang}.json`, 'utf8'))])));
let lang = 'ro', checkoutParams = null, stateIndex = 0;
const t = (key, vars = {}) => Object.entries(vars).reduce((value, [name, replacement]) =>
  value.replaceAll(`{${name}}`, String(replacement)), locales[lang][key] ?? key);
const mocks = {
  react: {
    useEffect: noop, useRef: value => ({ current: value }),
    useState: value => [stateIndex++ === 0 && checkoutParams ? checkoutParams : value, noop],
  },
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'next/link': { default: 'Link' },
  '@/context/AuthContext': { useAuth: () => ({ user: { id: 'buyer' }, session: { access_token: 'test' }, loading: false, isGuest: false }) },
  '@/context/LanguageContext': { useTranslation: () => ({ t, lang, setLang: noop }) },
  '@/components/usePaymentProvider': { default: () => 'maib' },
  '@/lib/maib/products.mjs': products,
  '@/lib/maib/purchase.mjs': purchase,
  '@/lib/maib/result.mjs': { MAIB_FINAL_STATUSES: [], maibResultContext: noop },
  '@/lib/guest-checkout.mjs': guestCheckout,
  '@/lib/feature-purchase-content': { FEATURE_PURCHASE_CONTENT },
  '@/lib/tracking': { trackPaymentCheckoutEvent: noop },
  '@/lib/ga4-payment-client': { trackPaymentAnalytics: noop, capturePaymentAnalytics: noop },
  '@/lib/payment-urls.mjs': { paymentSiteOrigin: () => 'https://example.test', paymentAppLink: path => path },
};

async function loadComponent(file) {
  const { code } = await transform(await fs.readFile(file, 'utf8'), {
    filename: file,
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } },
    module: { type: 'es6' },
  });
  const context = vm.createContext({ URL, URLSearchParams, Intl });
  const jsxModule = new vm.SourceTextModule(code, { context });
  await jsxModule.link(name => {
    const exports = mocks[name] || (name.startsWith('@/components/') ? { default: noop } : null);
    assert(exports, `Unexpected import: ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await jsxModule.evaluate();
  return jsxModule.namespace.default;
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return Array.isArray(node) ? node.map(text).join('') : text(node.props?.children);
}

const PricingPackages = await loadComponent('src/components/PricingPackages.js');
const CheckoutPackagesCard = await loadComponent('src/components/CheckoutPackagesCard.js');
mocks['@/components/CheckoutPackagesCard'] = { default: CheckoutPackagesCard };
const Checkout = await loadComponent('src/components/MaibPaymentPage.js');
const offers = [
  { key: 'cadastru_lookup_single', total: 49, unitPrice: 49, discount: null, titles: { ro: '1 utilizare', ru: '1 использование', en: '1 use' } },
  { key: 'credits_4', total: 98, unitPrice: 24.5, discount: '50%', titles: { ro: '4 utilizări', ru: '4 использования', en: '4 uses' } },
  { key: 'credits_20', total: 290, unitPrice: 14.5, discount: '~70%', titles: { ro: '20 de utilizări', ru: '20 использований', en: '20 uses' } },
];
for (lang of ['ro', 'ru']) {
  checkoutParams = null;
  const cards = nodes(PricingPackages()).filter(node => node.type === 'article');
  assert.equal(cards.length, 3);
  for (const [index, { total, unitPrice, discount, titles }] of offers.entries()) {
    const content = text(cards[index]);
    assert.equal(text(nodes(cards[index]).find(node => node.type === 'h2')), titles[lang]);
    assert(content.includes(`${total} MDL`));
    const unit = unitPrice.toLocaleString(lang === 'ru' ? 'ru-MD' : 'ro-MD', { minimumFractionDigits: index ? 2 : 0 });
    assert(content.includes(t('pricing.sharedUnitPrice', { price: unit })));
    if (discount !== null) assert(content.includes(t('pricing.sharedSavingsPerUse', { percent: discount })));
    assert(locales[lang]['pricing.metaDescription'].includes(`${total} MDL`));
  }
}
for (lang of ['ro', 'ru', 'en']) {
  function checkSavingsCard(tree) {
    const cards = nodes(tree).filter(node => node.type === CheckoutPackagesCard);
    assert.equal(cards.length, 1);
    const card = CheckoutPackagesCard(cards[0].props);
    assert(text(card).includes(t('payment.checkoutPackagesTitle')));
    const savings = t('payment.checkoutPackagesSavingsAmount', { percent: '~70%' });
    assert(text(card).includes(t('payment.checkoutPackagesSavings', { savings })));
    assert(savings.includes('~70%'));
    assert(!savings.includes('%%'));
    assert.equal(text(nodes(card).find(node => node.type === 'strong')), savings);
    const link = nodes(card).find(node => node.type === 'Link');
    assert.equal(link.props.href, '/pricing');
    assert.equal(text(link.props.children[0]), t('payment.checkoutPackagesLink'));
  }

  for (const { key, total, titles } of offers) {
    checkoutParams = new URLSearchParams({ product_key: key, checkout_source: 'pricing' });
    stateIndex = 0;
    const tree = Checkout({});
    assert(nodes(tree).some(node => node.type === 'strong' && text(node) === `${total} MDL`));
    assert(nodes(tree).some(node => node.type === 'h2' && text(node) === titles[lang]));
    checkSavingsCard(tree);
  }
  for (const [product_key, return_to] of [
    ['cadastru_lookup_single', '/cadastru/rezultat?number=123'],
    ['sale_estimate_single', '/evaluare?city=Chisinau'],
  ]) {
    checkoutParams = new URLSearchParams({ product_key, return_to });
    stateIndex = 0;
    checkSavingsCard(Checkout({}));
  }
  stateIndex = 0;
  assert(!nodes(Checkout({ result: true })).some(node => node.type === CheckoutPackagesCard));
  assert(!nodes(CheckoutPackagesCard({})).some(node => node.type === 'p'));
}
console.log('Pricing cards, per-use rates, 50%/~70% discounts, metadata and RO/RU/EN checkout prices/savings passed.');
