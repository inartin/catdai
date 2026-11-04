// Isolated PostgreSQL, route and component checks; no hosted database or payment calls.
// pnpm exec node --experimental-vm-modules scripts/test-result-reviews.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const query = async (sql, args = []) => (await db.query(sql, args)).rows;

// Result producers expose the prompt only after an actual paid unlock.
async function resultFunction(file, name, globals = {}, asyncFunction = false) {
  const source = await fs.readFile(file, 'utf8');
  const start = source.indexOf(`${asyncFunction ? 'async ' : ''}function ${name}(`);
  assert(start >= 0);
  return vm.runInNewContext(`(${source.slice(start, source.indexOf('\n}', start) + 2)})`, globals);
}
for (const [file, name] of [
  ['src/app/api/estimate/route.js', 'buildEstimateAccessPayload'],
  ['src/app/api/estimate-rent/route.js', 'buildRentEstimateAccessPayload'],
]) {
  const build = await resultFunction(file, name, { buildEstimatePreview: () => ({}), buildRentEstimatePreview: () => ({}) });
  for (const source of ['paid_credit', 'free_monthly']) {
    const access = { hasFullAccess: true, access: { tier: 'free' }, accessSource: source, paidCreditUsage: { source, usage_event_id: 'owned-unlock' } };
    assert.equal(build({}, access).review_usage_id, source === 'paid_credit' ? 'owned-unlock' : null);
  }
  assert.equal(build({}, { hasFullAccess: false, access: {}, sharedLink: null }).review_usage_id, undefined);
}
const buildListing = await resultFunction('src/app/api/estimate/route.js', 'buildListingAnalysisAccessPayload', { buildEstimatePreview: () => ({}) });
assert.equal(buildListing({}, { check: { allowed: true }, access: {} }, { source: 'paid_credit', usage_event_id: 'listing-unlock' }).review_usage_id, 'listing-unlock');
assert.equal(buildListing({}, { check: { allowed: true }, access: {} }, { source: 'free_monthly' }).review_usage_id, null);
const calculatorResponse = await resultFunction('src/app/api/estimate-rent/route.js', 'resolveRentResponse', {
  consumeYieldCalculatorCredit: async () => ({ allowed: true, source: 'paid_credit', usage_event_id: 'calculator-unlock' }),
}, true);
assert.equal((await calculatorResponse({}, { calculator_usage: {} }, {}, {}, { check: { allowed: true }, access: {} })).payload.review_usage_id, 'calculator-unlock');

await db.exec(`create schema auth; create table auth.users(id uuid primary key);
  create role anon; create role authenticated; create role service_role bypassrls;
  create table user_feature_usage_events(id uuid primary key, user_id uuid, feature_key text, source text);
  create table guest_checkout_accounts(guest_user_id uuid primary key, claimed_user_id uuid);`);
await db.exec(await fs.readFile('supabase/migrations/20261104192647_result_reviews.sql', 'utf8'));

// A small PostgREST adapter runs the production query chains against PostgreSQL.
const admin = { from(table) {
  assert(['guest_checkout_accounts', 'user_feature_usage_events', 'result_reviews', 'user_feedback'].includes(table));
  let fields = '*', filters = [], args = [], payload, single = false, count, order;
  const chain = {
    select(value) { fields = value; return chain; },
    eq(key, value) { args.push(value); filters.push(`${key} = $${args.length}`); return chain; },
    in(key, values) { const slots = values.map(value => { args.push(value); return `$${args.length}`; }); filters.push(`${key} in (${slots.join(',')})`); return chain; },
    limit(value) { count = value; return chain; },
    order(key) { order = key; return chain; },
    maybeSingle() { single = true; return chain; },
    insert(value) { payload = value; return chain; },
    then(resolve, reject) {
      return (async () => {
        try {
          if (table === 'user_feedback') return { data: [{ id: 1, message: 'Existing feedback' }], error: null };
          if (payload) {
            const keys = Object.keys(payload);
            await query(`insert into ${table} (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')})`,
              keys.map(key => key === 'visitor' ? JSON.stringify(payload[key]) : payload[key]));
            return { error: null };
          }
          const rows = await query(`select ${fields} from ${table}${filters.length ? ` where ${filters.join(' and ')}` : ''}${order ? ` order by ${order} desc` : ''}${count ? ` limit ${count}` : ''}`, args);
          return { data: single ? rows[0] || null : rows, error: null };
        } catch (error) { return { data: null, error }; }
      })().then(resolve, reject);
    },
  };
  return chain;
} };
const users = new Map();
async function buyer({ guest = false, source = 'paid_credit', feature = 'cadastru_lookup' } = {}) {
  const user = { id: crypto.randomUUID(), is_anonymous: guest }, usage = crypto.randomUUID();
  users.set(user.id, user);
  await query('insert into auth.users values($1)', [user.id]);
  await query('insert into user_feature_usage_events values($1,$2,$3,$4)', [usage, user.id, feature, source]);
  return { user, usage };
}
const context = vm.createContext({ URL, Response, console: { error() {} } });
const cache = new Map();
let throttled = false;
const mocks = {
  'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  '@/lib/access-tier': { getRequestUser: async request => ({ data: { user: users.get(request.headers.get('authorization')?.slice(7)) || null } }) },
  '@/lib/supabase-admin': { supabaseAdmin: admin },
  '@/lib/visitor': { getRequestVisitor: () => ({ device_type: 'Mobile' }) },
  '@/lib/rate-limit': { rateLimit: () => ({ check: () => ({ allowed: !throttled }) }) },
  '@/lib/admin-auth': { requireAdminApiAuth: request => request.headers.get('cookie') === 'admin=valid' ? null : Response.json({ error: 'unauthorized' }, { status: 401 }) },
};
async function moduleFor(file) {
  if (cache.has(file)) return cache.get(file);
  const mod = new vm.SourceTextModule(await fs.readFile(file, 'utf8'), { context });
  cache.set(file, mod);
  await mod.link(async name => {
    if (name === '@/lib/result-reviews') return moduleFor('src/lib/result-reviews.js');
    assert(mocks[name], `Missing mock: ${name}`);
    return new vm.SyntheticModule(Object.keys(mocks[name]), function () {
      for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
    }, { context });
  });
  return mod;
}
const route = await moduleFor('src/app/api/result-reviews/route.js');
await route.evaluate();
async function request(owner, body, method = 'POST') {
  const url = `https://catdai.test/api/result-reviews?usage_id=${owner.usage}`;
  const response = await route.namespace[method](new Request(url, {
    method, headers: { Authorization: `Bearer ${owner.user.id}`, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify({ usage_id: owner.usage, action: 'submit', rating: 4, ...body }) } : {}),
  }));
  return { status: response.status, body: await response.json(), headers: response.headers };
}

const guest = await buyer({ guest: true }), stranger = await buyer(), free = await buyer({ source: 'free_monthly' });
assert.equal((await request(guest, null, 'GET')).body.eligible, true, 'Guest buyers can review without registering');
assert.equal((await request(free, null, 'GET')).body.eligible, false, 'Free results do not prompt');
assert.equal((await request(free)).status, 403);
assert.equal((await request({ ...stranger, usage: guest.usage })).status, 403, 'Paid result must belong to the session');
assert.equal((await request({ ...guest, user: { id: 'missing' } })).status, 401);
for (const rating of [0, 6, 2.5, '5', null]) assert.equal((await request(guest, { rating })).status, 400);
assert.equal((await request(guest, { usage_id: [guest.usage] })).status, 400);
assert.equal((await request(guest, { action: 'publish' })).status, 400);
for (const comment of ['x'.repeat(501), 123]) assert.equal((await request(guest, { comment })).status, 400);
assert.equal((await request(guest, { comment: '  Useful\u0000 details  ' })).status, 200);
const [savedGuest] = await query('select * from result_reviews where user_id=$1', [guest.user.id]);
assert.equal(savedGuest.comment, 'Useful details');
assert.equal(savedGuest.is_anonymous, true);
assert.equal(savedGuest.feature_key, 'cadastru_lookup');
assert.equal((await request(guest, null, 'GET')).body.eligible, false);
await request(guest, { rating: 1, comment: 'Changed' });
assert.equal((await query('select rating from result_reviews where user_id=$1', [guest.user.id]))[0].rating, 4, 'Retries preserve the first review');
await query('insert into guest_checkout_accounts values($1,$2)', [guest.user.id, stranger.user.id]);
assert.equal((await request(stranger, null, 'GET')).body.eligible, false, 'Claiming guest purchases keeps review suppression');

const dismissed = await buyer();
await request(dismissed, { action: 'dismiss', rating: 0 });
assert.equal((await request(dismissed, null, 'GET')).body.eligible, false);
const [dismissal] = await query('select * from result_reviews where user_id=$1', [dismissed.user.id]);
assert.equal(dismissal.status, 'dismissed'); assert.equal(dismissal.rating, null);
for (const rating of [1, 2, 3, 4, 5]) {
  const owner = await buyer();
  await request(owner, { rating });
  assert.equal((await query('select comment from result_reviews where user_id=$1', [owner.user.id]))[0].comment, null, 'Comments are optional');
}
const concurrent = await buyer();
await Promise.all([request(concurrent), request(concurrent)]);
assert.equal((await query('select count(*)::int n from result_reviews where user_id=$1', [concurrent.user.id]))[0].n, 1);
throttled = true;
assert.equal((await request(free)).status, 429);
throttled = false;
assert.match((await request(guest, null, 'GET')).headers.get('cache-control'), /no-store/);

const adminRoute = await moduleFor('src/app/api/admin/feedback/route.js');
await adminRoute.evaluate();
assert.equal((await adminRoute.namespace.GET(new Request('https://catdai.test/api/admin/feedback'))).status, 401);
const adminData = await (await adminRoute.namespace.GET(new Request('https://catdai.test/api/admin/feedback', { headers: { cookie: 'admin=valid' } }))).json();
assert.equal(adminData.feedback[0].message, 'Existing feedback');
assert(adminData.reviews.some(row => row.is_anonymous && row.rating === 4));
assert(!adminData.reviews.some(row => row.user_id === dismissed.user.id), 'Admin reviews exclude dismissals');
for (const role of ['anon', 'authenticated']) {
  for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    assert.equal((await query("select has_table_privilege($1,'result_reviews',$2) ok", [role, privilege]))[0].ok, false);
  }
}
assert.equal((await query("select relrowsecurity from pg_class where relname='result_reviews'"))[0].relrowsecurity, true);
await assert.rejects(query("insert into result_reviews(user_id,feature_key,status,rating) values($1,'sale_estimate','submitted',6)", [free.user.id]));
await assert.rejects(query("insert into result_reviews(user_id,feature_key,status,rating) values($1,'sale_estimate','submitted',null)", [free.user.id]));

// Exercise the real component's hooks, input handlers, API requests and saved state.
const { transform, loadBindings } = createRequire(import.meta.url)('next/dist/build/swc');
await loadBindings();
const componentCode = (await transform(await fs.readFile('src/components/ResultReviewCard.js', 'utf8'), {
  filename: 'ResultReviewCard.js', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' },
})).code;
const storage = new Map();
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
async function view(owner, usageId = owner.usage, { blockedStorage = false, failSubmit = false } = {}) {
  const frames = new Map(), effects = [];
  let current, calls = 0;
  const react = {
    useId: () => 'review-id',
    useState(initial) { const frame = current, index = frame.cursor++; if (!(index in frame.slots)) frame.slots[index] = initial;
      return [frame.slots[index], value => { frame.slots[index] = value; }]; },
    useEffect(effect, deps) { const frame = current, index = frame.cursor++, previous = frame.slots[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) { previous?.cleanup?.(); const slot = frame.slots[index] = { deps }; effects.push(() => { slot.cleanup = effect(); }); } },
  };
  const session = { user: owner.user, access_token: owner.user.id };
  const uiMocks = {
    react, 'react/jsx-runtime': { Fragment: 'Fragment', jsx: (type, props, key) => ({ type, props, key }), jsxs: (type, props, key) => ({ type, props, key }) },
    '@/context/AuthContext': { useAuth: () => ({ session }) },
    '@/context/LanguageContext': { useTranslation: () => ({ t: key => key }) },
    '@/lib/visitor-browser': { getDeviceId: () => null },
  };
  const uiContext = vm.createContext({ AbortController, localStorage: {
    getItem: key => { if (blockedStorage) throw Error(); return storage.get(key); },
    setItem: (key, value) => { if (blockedStorage) throw Error(); storage.set(key, value); },
  }, fetch: async (url, init) => {
    calls++;
    if (failSubmit && init.method === 'POST') return Response.json({}, { status: 500 });
    return route.namespace[init.method || 'GET'](new Request(`https://catdai.test${url}`, init));
  } });
  const mod = new vm.SourceTextModule(componentCode, { context: uiContext });
  await mod.link(name => new vm.SyntheticModule(Object.keys(uiMocks[name]), function () {
    for (const [key, value] of Object.entries(uiMocks[name])) this.setExport(key, value);
  }, { context: uiContext }));
  await mod.evaluate();
  function render() {
    function resolve(node, path = 'root') {
      if (!node || typeof node !== 'object') return node;
      if (Array.isArray(node)) return node.map((child, index) => resolve(child, `${path}/${index}`));
      if (typeof node.type === 'function') {
        const key = `${path}/${node.type.name}:${node.key || ''}`, frame = frames.get(key) || { slots: [] };
        frames.set(key, frame); frame.cursor = 0; current = frame;
        return resolve(node.type(node.props), key);
      }
      return { ...node, props: { ...node.props, children: resolve(node.props?.children, `${path}/children`) } };
    }
    return resolve({ type: mod.namespace.default, props: { usageId } });
  }
  return { render, get calls() { return calls; }, async settle() { render(); for (const effect of effects.splice(0)) effect(); await new Promise(setImmediate); return render(); } };
}
const uiBuyer = await buyer();
const locked = await view(uiBuyer, null);
assert.equal(await locked.settle(), null); assert.equal(locked.calls, 0, 'Locked or not-yet-loaded results make no review request');
const ui = await view(uiBuyer);
let tree = await ui.settle();
assert(nodes(tree).some(node => node.type === 'aside'));
assert.equal(nodes(tree).filter(node => node.type === 'input').length, 5);
nodes(tree).find(node => node.type === 'input' && node.props.value === 5).props.onChange();
tree = ui.render();
nodes(tree).find(node => node.type === 'textarea').props.onChange({ target: { value: 'Helpful result' } });
await nodes(ui.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
assert(nodes(ui.render()).some(node => node.props?.role === 'status'));
assert.equal(await (await view(uiBuyer)).settle(), null, 'Submitted users are never prompted again');
const dismissBuyer = await buyer(), dismissUI = await view(dismissBuyer);
tree = await dismissUI.settle();
nodes(tree).find(node => node.props?.['aria-label'] === 'review.dismiss').props.onClick();
await dismissUI.settle();
assert.equal(dismissUI.render(), null);
assert.equal(await (await view(dismissBuyer)).settle(), null, 'Dismissal survives refresh');
const failedBuyer = await buyer(), failedUI = await view(failedBuyer, failedBuyer.usage, { failSubmit: true });
tree = await failedUI.settle();
nodes(tree).find(node => node.type === 'input').props.onChange();
await nodes(failedUI.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
assert(nodes(failedUI.render()).some(node => node.props?.role === 'alert'), 'Failed submissions remain retryable');
assert.equal((await request(failedBuyer, null, 'GET')).body.eligible, true);
const blockedBuyer = await buyer(), blockedUI = await view(blockedBuyer, blockedBuyer.usage, { blockedStorage: true });
assert(nodes(await blockedUI.settle()).some(node => node.type === 'aside'), 'Server state supports blocked browser storage');
await db.close();
console.log('Result reviews: paid ownership, anonymous buyers, rating/comment validation, dismissal, duplicates, guest upgrade, admin privacy, SQL constraints and component lifecycle passed.');
