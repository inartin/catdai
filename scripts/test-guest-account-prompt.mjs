// Isolated guest notice lifecycle and Paddle return; no bank, auth or database calls.
// pnpm exec node --experimental-vm-modules scripts/test-guest-account-prompt.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as guestCheckout from '../src/lib/guest-checkout.mjs';

const { transform, loadBindings } = createRequire(import.meta.url)('next/dist/build/swc');
await loadBindings();
const noop = () => {};
const guest = { session: { access_token: 'guest-token', user: { id: 'guest' } }, isGuest: true, loading: false };
const paidOrder = { order_id: 'order', status: 'paid', return_to: '/cadastru/rezultat?number=123' };
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function queue(storage, order = paidOrder, provider = 'maib') {
  guestCheckout.queueGuestAccountPrompt({ userId: 'guest', provider, order }, storage);
}
const consume = (storage, path = paidOrder.return_to, userId = 'guest') => guestCheckout.consumeGuestAccountPrompt(userId, path, storage);

for (const path of ['/evaluare?city=Chisinau', '/cadastru/rezultat?number=456', '/ru/cadastru/rezultat?number=123']) {
  const storage = memoryStorage();
  queue(storage);
  assert.equal(consume(storage, path), false, 'Other features, properties and locales never show the paid-result notice');
  assert.equal(consume(storage), false, 'An unrelated result discards the pending notice');
}
for (const status of ['pending', 'registered', 'failed', 'canceled', 'refunded']) {
  const storage = memoryStorage();
  queue(storage, { ...paidOrder, status });
  assert.equal(consume(storage), false, 'Only a verified successful payment queues the notice');
}
for (const return_to of ['/profile', 'https://evil.test/evaluare', '//evil.test/evaluare']) {
  const storage = memoryStorage();
  queue(storage, { ...paidOrder, return_to });
  assert.equal(consume(storage), false);
}
const storage = memoryStorage();
queue(storage);
assert.equal(consume(storage, paidOrder.return_to, 'another-user'), false, 'Notice belongs to the purchasing guest');
queue(storage, { ...paidOrder, return_to: '/evaluare?city=Chisinau&type=rent#report' });
assert.equal(consume(storage, '/evaluare?type=rent&city=Chisinau'), true, 'Query order and section anchors do not change result identity');
assert.equal(consume(storage, '/evaluare?type=rent&city=Chisinau'), false);
queue(storage);
assert.equal(consume(storage), false, 'Rechecking the same order does not show the notice twice');
queue(storage, { ...paidOrder, order_id: 'next-order', status: 'partially_refunded' });
assert.equal(consume(storage), true, 'A separate paid order can show its own notice');
const expired = memoryStorage();
const realNow = Date.now;
try {
  Date.now = () => 1000;
  queue(expired);
  Date.now = () => 1000 + 11 * 60 * 1000;
  assert.equal(consume(expired), false, 'An abandoned payment return expires');
} finally { Date.now = realNow; }
const blocked = { getItem() { throw Error('Storage blocked'); } };
assert.doesNotThrow(() => queue(blocked));
assert.equal(consume(blocked), false);

async function view(file, { path = paidOrder.return_to, auth = guest, storage = memoryStorage(), status = 'paid', replayEffects = false } = {}) {
  const instances = new Map(), effects = [], redirects = [];
  let current, location = new URL(path, 'https://catdai.test');
  const react = {
    Suspense: 'Suspense',
    useState(initial) {
      const frame = current, index = frame.cursor++;
      if (!(index in frame.slots)) frame.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [frame.slots[index], value => { frame.slots[index] = typeof value === 'function' ? value(frame.slots[index]) : value; }];
    },
    useMemo: fn => fn(),
    useEffect(effect, deps) {
      const frame = current, index = frame.cursor++, previous = frame.slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        previous?.cleanup?.();
        const slot = frame.slots[index] = { deps };
        effects.push(() => {
          slot.cleanup = effect();
          if (replayEffects) { slot.cleanup?.(); slot.cleanup = effect(); }
        });
      }
    },
  };
  const mocks = {
    react, 'react/jsx-runtime': { jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) },
    'next/navigation': { usePathname: () => location.pathname, useSearchParams: () => location.searchParams },
    'next/link': { default: 'Link' },
    '@/context/AuthContext': { useAuth: () => auth },
    '@/context/LanguageContext': { useTranslation: () => ({ t: key => key, lang: 'ro', setLang: noop }) },
    '@/lib/guest-checkout.mjs': { ...guestCheckout,
      consumeGuestAccountPrompt: (userId, result) => guestCheckout.consumeGuestAccountPrompt(userId, result, storage),
      queueGuestAccountPrompt: notice => guestCheckout.queueGuestAccountPrompt(notice, storage) },
    '@/lib/payment-urls.mjs': { paymentAppLink: path => path },
  };
  const { code } = await transform(await fs.readFile(file, 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' },
  });
  const context = vm.createContext({ console, URL, URLSearchParams, Promise,
    window: { location: { search: location.search, replace: path => redirects.push(path) }, setTimeout: noop, clearTimeout: noop },
    fetch: async url => {
      assert.equal(file, 'src/app/payment/paddle/success/page.js', 'Displaying the notice never fetches historical credits');
      assert(url.startsWith('/api/payments/paddle/status?'));
      return Response.json({ ...paidOrder, status });
    },
  });
  const mod = new vm.SourceTextModule(code, { context });
  await mod.link(name => {
    const exports = mocks[name] || (name.startsWith('@/components/') ? { default: name } : null);
    assert(exports, `Missing mock ${name}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await mod.evaluate();
  function render() {
    const visited = new Set();
    function resolve(node, path) {
      if (!node || typeof node !== 'object') return node;
      if (Array.isArray(node)) return node.map((child, index) => resolve(child, `${path}/${index}`));
      if (typeof node.type === 'function') {
        const id = `${path}/${node.type.name}:${node.key ?? ''}`;
        const frame = instances.get(id) || { slots: [] };
        instances.set(id, frame); visited.add(id); frame.cursor = 0;
        current = frame;
        return resolve(node.type(node.props), id);
      }
      return { ...node, props: { ...node.props, children: resolve(node.props?.children, `${path}/children`) } };
    }
    const tree = resolve({ type: mod.namespace.default, props: {} }, 'root');
    for (const [id, frame] of instances) if (!visited.has(id)) {
      for (const slot of frame.slots) slot?.cleanup?.();
      instances.delete(id);
    }
    return tree;
  }
  return {
    redirects, storage, render,
    async settle() { render(); for (const effect of effects.splice(0)) effect(); await new Promise(setImmediate); return render(); },
    navigate(path) { location = new URL(path, 'https://catdai.test'); },
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
}
const promptFile = 'src/components/GuestAccountPrompt.js';
const pending = memoryStorage();
queue(pending);
const prompt = await view(promptFile, { storage: pending, replayEffects: true });
let tree = await prompt.settle();
assert.equal(nodes(tree).filter(node => node.type === 'aside').length, 1, 'Successful payment shows the notice once, including React effect replay');
nodes(tree).find(node => node.props?.children === 'payment.guestCreateAccount').props.onClick();
assert(nodes(prompt.render()).some(node => node.type === '@/components/AuthOptions'), 'The account action still opens login providers');
nodes(tree).find(node => node.props?.children === 'payment.guestLater').props.onClick();
assert.equal(nodes(prompt.render()).filter(node => node.type === 'aside').length, 0);
assert.equal(nodes(await (await view(promptFile, { storage: pending })).settle()).filter(node => node.type === 'aside').length, 0, 'Refresh does not repeat a dismissed notice');
queue(pending, { ...paidOrder, order_id: 'new-payment' });
const changing = await view(promptFile, { storage: pending });
assert(nodes(await changing.settle()).some(node => node.type === 'aside'));
changing.navigate('/cadastru/rezultat?number=456');
assert.equal(nodes(await changing.settle()).filter(node => node.type === 'aside').length, 0, 'Changing only result query parameters hides the notice');
changing.navigate(paidOrder.return_to);
assert.equal(nodes(await changing.settle()).filter(node => node.type === 'aside').length, 0, 'Returning to an earlier result does not repeat it');
assert.equal(nodes(await (await view(promptFile, { storage: pending, path: '/evaluare?city=Chisinau' })).settle()).filter(node => node.type === 'aside').length, 0, 'Reopening Evaluare after a Cadastru purchase has no notice');
const transferError = await view(promptFile, { auth: { ...guest, guestUpgradeError: true, retryGuestUpgrade: noop } });
assert(nodes(await transferError.settle()).some(node => node.props?.role === 'alert'), 'Account transfer retry remains available');

for (const status of ['pending', 'failed', 'paid']) {
  const paddle = await view('src/app/payment/paddle/success/page.js', { path: '/payment/paddle/success?order_id=order&checkout=completed&return_to=%2Fevaluare', status });
  await paddle.settle();
  assert.deepEqual(paddle.redirects, status === 'paid' ? [paidOrder.return_to] : []);
  assert.equal(consume(paddle.storage), status === 'paid', 'Paddle queues the notice only after its server confirms payment');
}
console.log('Guest account prompt: exact paid result, one-time display, dismissal, navigation, refresh, effect replay and verified Paddle return passed.');
