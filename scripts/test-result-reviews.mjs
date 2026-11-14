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
const listingBody = { listing_analysis: { external_id: '105784182' } };
const listingAccess = { access: { user_id: 'buyer' }, check: { allowed: true }, idempotencyKey: 'listing-key' };
const listingData = { estimate_type: 'rent', estimate: { market_rate: 400 } };
const rentalPreview = { estimate: { market_rate: null }, locked_sections: { market_estimate: true } };
const resolveRentalListing = await resultFunction('src/app/api/estimate-rent/route.js', 'resolveRentResponse', {
  precheckListingAnalysisAccess: async () => listingAccess,
  resolveListingAnalysisPayload: async (data, access, body, params, preview) => {
    assert.equal(access, listingAccess);
    assert.equal(body, listingBody);
    return preview(data);
  },
  buildRentEstimatePreview: (data, { hideMarketEstimate }) => {
    assert.equal(data, listingData);
    assert.equal(hideMarketEstimate, true);
    return rentalPreview;
  },
}, true);
assert.equal((await resolveRentalListing({}, listingBody, {}, listingData)).payload, rentalPreview);

for (const usage of [
  { allowed: true, source: 'paid_credit', usage_event_id: 'listing-unlock' },
  { allowed: true, source: 'free_monthly' },
  { allowed: false, reason: 'no_credit' },
]) {
  const resolveListing = await resultFunction('src/lib/listing-analysis-access.js', 'resolveListingAnalysisPayload', {
    LISTING_ANALYSIS_FEATURE_KEY: 'listing_analysis',
    consumeFeatureCredit: async ({ featureKey, idempotencyKey }) => {
      assert.equal(featureKey, 'listing_analysis');
      assert.equal(idempotencyKey, 'listing-key');
      return usage;
    },
    getFeaturePurchaseOffer: () => ({ product_key: 'listing_analysis_single' }),
  }, true);
  const result = await resolveListing(listingData, listingAccess, listingBody, {}, () => rentalPreview);
  assert.equal(result.full_access, usage.allowed);
  if (usage.allowed) {
    assert.equal(result.review_usage_id, usage.usage_event_id || null);
  } else {
    assert.equal(result.estimate.market_rate, null);
    assert.equal(result.access_limit.feature_key, 'listing_analysis');
  }
}
const calculatorResponse = await resultFunction('src/app/api/estimate-rent/route.js', 'resolveRentResponse', {
  consumeYieldCalculatorCredit: async () => ({ allowed: true, source: 'paid_credit', usage_event_id: 'calculator-unlock' }),
}, true);
assert.equal((await calculatorResponse({}, { calculator_usage: {} }, {}, {}, { check: { allowed: true }, access: {} })).payload.review_usage_id, 'calculator-unlock');

await db.exec(`create schema auth; create table auth.users(id uuid primary key);
  create role anon; create role authenticated; create role service_role bypassrls;
  create table user_feature_usage_events(id uuid primary key, user_id uuid, feature_key text, source text, metadata jsonb,
    idempotency_key text, created_at timestamptz default now());
  create table maib_payment_orders(id uuid primary key, user_id uuid, receipt_email text,
    product_key text default 'cadastru_lookup_single', product_title text default 'Cadastral data',
    amount_minor integer default 2000, currency_code text default 'MDL', refunded_minor integer default 0,
    status text default 'paid', environment text default 'production', language text default 'ro',
    paid_at timestamptz default now(), created_at timestamptz default now(), cadastru_delivery jsonb);
  create table guest_checkout_accounts(guest_user_id uuid primary key, claimed_user_id uuid);`);
await db.exec(await fs.readFile('supabase/migrations/20261104192647_result_reviews.sql', 'utf8'));

// A small PostgREST adapter runs the production query chains against PostgreSQL.
let failingTable = null;
const admin = { from(table) {
  assert(['guest_checkout_accounts', 'user_feature_usage_events', 'result_reviews', 'user_feedback', 'maib_payment_orders'].includes(table));
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
          if (table === failingTable) throw new Error('Database unavailable');
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
admin.auth = { admin: { getUserById: async id => ({ data: { user: users.get(id) }, error: null }) } };
async function buyer({ guest = false, source = 'paid_credit', feature = 'cadastru_lookup' } = {}) {
  const user = { id: crypto.randomUUID(), is_anonymous: guest }, usage = crypto.randomUUID();
  users.set(user.id, user);
  await query('insert into auth.users values($1)', [user.id]);
  await query('insert into user_feature_usage_events(id,user_id,feature_key,source) values($1,$2,$3,$4)', [usage, user.id, feature, source]);
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
const guestOrder = crypto.randomUUID(), otherOrder = crypto.randomUUID();
await query('insert into maib_payment_orders(id,user_id,receipt_email) values($1,$2,$3),($4,$2,$5)',
  [guestOrder, guest.user.id, 'guest-checkout@example.com', otherOrder, 'other-checkout@example.com']);
await query('update user_feature_usage_events set metadata=$1 where id=$2', [{ maib_order_id: guestOrder }, guest.usage]);
// Claiming purchases changes ownership, while the original anonymous review remains.
await query('update user_feature_usage_events set user_id=$1 where id=$2', [stranger.user.id, guest.usage]);
await query('update maib_payment_orders set user_id=$1 where id=$2', [stranger.user.id, guestOrder]);
const registered = await buyer();
registered.user.email = 'account@example.com';
registered.user.user_metadata = { full_name: 'Registered Buyer' };
await request(registered);
const registeredOrder = crypto.randomUUID();
await query('insert into maib_payment_orders(id,user_id,receipt_email) values($1,$2,$3)', [registeredOrder, registered.user.id, 'registered-checkout@example.com']);
await query('update user_feature_usage_events set metadata=$1 where id=$2', [{ maib_order_id: registeredOrder }, registered.usage]);
const accountOnly = await buyer();
accountOnly.user.email = 'account-only@example.com';
await request(accountOnly);
const historicalGuest = await buyer({ guest: true });
await request(historicalGuest);
const adminData = await (await adminRoute.namespace.GET(new Request('https://catdai.test/api/admin/feedback', { headers: { cookie: 'admin=valid' } }))).json();
assert.equal(adminData.feedback[0].message, 'Existing feedback');
assert(adminData.reviews.some(row => row.is_anonymous && row.rating === 4));
assert(!adminData.reviews.some(row => row.user_id === dismissed.user.id), 'Admin reviews exclude dismissals');
const guestReview = adminData.reviews.find(row => row.user_id === guest.user.id);
assert.equal(guestReview.contact_email, 'guest-checkout@example.com', 'Uses the reviewed order even after ownership transfer, not another checkout');
assert.equal(guestReview.contact_email_source, 'checkout');
const registeredReview = adminData.reviews.find(row => row.user_id === registered.user.id);
assert.equal(registeredReview.user_name, 'Registered Buyer');
assert.equal(registeredReview.contact_email, 'registered-checkout@example.com', 'Checkout email takes precedence over account email');
const accountReview = adminData.reviews.find(row => row.user_id === accountOnly.user.id);
assert.equal(accountReview.contact_email, 'account-only@example.com');
assert.equal(accountReview.contact_email_source, 'account');
assert.equal(adminData.reviews.find(row => row.user_id === historicalGuest.user.id).contact_email, null, 'Missing checkout history does not fabricate contact details');

// Admin expansion reads the frozen report for this exact unlock, never current records.
const reportRoute = await moduleFor('src/app/api/admin/feedback/[id]/cadastru/route.js');
await reportRoute.evaluate();
const report = (id, cookie = 'admin=valid') => reportRoute.namespace.GET(
  new Request('https://catdai.test/api/admin/feedback/report', { headers: { cookie } }),
  { params: Promise.resolve({ id: String(id) }) },
);
const usageKey = 'paid:cadastru_lookup:0123456789abcdef0123456789abcdef';
const snapshot = { cadastral_number: '0100106.131.01.020', apartment: { area_m2: 52, transactions_count: 0,
  notes: '<script>unsafe()</script>', restrictions: null }, building: { construction_year: 1986, gas: false },
  lands: [{ cadastral_number: '0100106.131', area_m2: 600 }],
  map_location: { latitude: 47.02, longitude: 28.83 }, map_geometry: { type: 'Polygon', coordinates: [[[28, 47], [29, 47], [28, 47]]] } };
const delivery = { payload: { ...snapshot, cadastru_evaluation_token: 'secret', review_usage_id: 'internal', locked_sections: {} },
  usage_key: usageKey, search_label: 'Chișinău, Decebal 22/A ap 20', search_type: 'address' };
await query('update user_feature_usage_events set idempotency_key=$1 where id=$2', [usageKey, guest.usage]);
await query('update maib_payment_orders set cadastru_delivery=$1 where id=$2', [delivery, guestOrder]);
assert.equal((await report(guestReview.id, '')).status, 401);
assert.equal((await report('bad')).status, 400);
assert.equal((await report(999999)).status, 404);
assert.equal((await report(dismissal.id)).status, 404);
const otherFeature = await buyer({ feature: 'sale_estimate' });
await request(otherFeature);
const [otherReview] = await query('select id from result_reviews where user_id=$1', [otherFeature.user.id]);
assert.equal((await report(otherReview.id)).status, 404, 'Only Cadastru reviews have report expansion');
const savedResponse = await report(guestReview.id);
assert.match(savedResponse.headers.get('cache-control'), /private, no-store/);
const savedReport = await savedResponse.json();
assert.deepEqual(savedReport.snapshot, snapshot, 'All saved property fields survive, excluding internal access tokens');
assert.equal(savedReport.purchase.id, guestOrder, 'Report still follows exact usage after guest claim');
assert.equal(savedReport.purchase.amount_minor, 2000);
assert.equal(savedReport.search.search_label, delivery.search_label);
assert.equal(savedReport.unavailable_reason, null);
assert.equal(savedReport.purchase.cadastru_delivery, undefined);
const noHistory = await (await report(adminData.reviews.find(row => row.user_id === historicalGuest.user.id).id)).json();
assert.equal(noHistory.snapshot, null);
assert(noHistory.unavailable_reason);
for (const change of [
  { ...delivery, usage_key: 'another-property' }, null, { ...delivery, payload: null },
]) {
  await query('update maib_payment_orders set cadastru_delivery=$1 where id=$2', [change, guestOrder]);
  assert.equal((await (await report(guestReview.id)).json()).snapshot, null, 'Missing or unrelated snapshots cannot be presented as historical results');
}
await query('update maib_payment_orders set cadastru_delivery=$1, product_key=$2 where id=$3', [delivery, 'standard_pack', guestOrder]);
assert.equal((await (await report(guestReview.id)).json()).snapshot, null, 'Package purchases do not have a single-Cadastru checkout report');
await query('update maib_payment_orders set product_key=$1, paid_at=null where id=$2', ['cadastru_lookup_single', guestOrder]);
assert.equal((await (await report(guestReview.id)).json()).snapshot, null, 'Unpaid orders do not establish a purchased report');
failingTable = 'maib_payment_orders';
assert.equal((await report(guestReview.id)).status, 500, 'Storage failures remain retryable errors');
failingTable = null;
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

// The admin report fetches only on expansion, preserves every nested value and retries failures.
const adminComponentSources = new Map();
for (const file of ['src/components/admin/AdminReviewCadastru.js', 'src/components/CadastralDataCard.js', 'src/components/CadastruFreshnessNote.js']) {
  adminComponentSources.set(file, (await transform(await fs.readFile(file, 'utf8'), {
    filename: file, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' },
  })).code);
}
const reviewMessages = JSON.parse(await fs.readFile('src/locales/ro.json', 'utf8'));
const { cadastruValueLabel } = await import('../src/lib/cadastru-value-labels.js');
import { cadastruPropertyDetails } from "../src/lib/cadastru-property-details.js";
async function adminReportView({ fail = false, result = savedReport } = {}) {
  const slots = [];
  let cursor = 0, calls = 0;
  const react = { useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], value => { slots[index] = value; }];
  } };
  const uiMocks = {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    '@/context/LanguageContext': { useTranslation: () => ({ lang: 'ro', t: (key, vars) => {
      let value = reviewMessages[key] || key;
      for (const [key, replacement] of Object.entries(vars || {})) value = value.replaceAll(`{${key}}`, String(replacement));
      return value;
    } }) },
    '@/lib/cadastru-value-labels': { cadastruValueLabel },
    '@/lib/cadastru-property-details': { cadastruPropertyDetails },
    '@/components/icons/LockIcon': { default: () => null },
  };
  const uiContext = vm.createContext({ fetch: async url => {
    calls++;
    assert.equal(url, `/api/admin/feedback/${guestReview.id}/cadastru`);
    return Response.json(result, { status: fail && calls === 1 ? 500 : 200 });
  } });
  const modules = new Map();
  async function component(file) {
    if (modules.has(file)) return modules.get(file);
    const mod = new vm.SourceTextModule(adminComponentSources.get(file), { context: uiContext });
    modules.set(file, mod);
    await mod.link(name => {
      if (name === '@/components/CadastralDataCard') return component('src/components/CadastralDataCard.js');
      if (name === '@/components/CadastruFreshnessNote') return component('src/components/CadastruFreshnessNote.js');
      assert(uiMocks[name], `Missing admin component mock: ${name}`);
      return new vm.SyntheticModule(Object.keys(uiMocks[name]), function () {
        for (const [key, value] of Object.entries(uiMocks[name])) this.setExport(key, value);
      }, { context: uiContext });
    });
    return mod;
  }
  const mod = await component('src/components/admin/AdminReviewCadastru.js');
  await mod.evaluate();
  function resolve(node) {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(resolve);
    if (typeof node.type === 'function') return resolve(node.type(node.props));
    return { ...node, props: { ...node.props, children: resolve(node.props?.children) } };
  }
  return {
    get calls() { return calls; },
    render() { cursor = 0; return resolve(mod.namespace.default({ reviewId: guestReview.id })); },
    async settle() { await new Promise(setImmediate); return this.render(); },
  };
}
const adminUI = await adminReportView();
tree = adminUI.render();
assert.equal(adminUI.calls, 0, 'Collapsed reviews do not fetch heavy reports');
nodes(tree).find(node => node.type === 'button').props.onClick();
assert(nodes(adminUI.render()).some(node => node.props?.role === 'status'));
tree = await adminUI.settle();
assert.equal(nodes(tree).find(node => node.type === 'button').props['aria-expanded'], true);
const renderedText = JSON.stringify(tree);
for (const value of ['0100106.131.01.020', '52', '1986', '20.00 MDL', 'Transactions', 'Apartment / unit', 'Land parcels', 'Map outline']) {
  assert(renderedText.includes(value), `Saved field visible: ${value}`);
}
assert(nodes(tree).some(node => node.type === 'span' && node.props.children === '0'), 'Zero registry values remain visible');
assert(nodes(tree).some(node => node.type === 'span' && node.props.children === 'No'), 'False registry values remain visible');
assert(!nodes(tree).some(node => node.type === 'script'), 'Official free text is rendered as text');
assert(nodes(tree).some(node => node.type === 'details' && node.props.open === false), 'Large map outlines can be expanded separately');
nodes(tree).find(node => node.type === 'button').props.onClick();
tree = adminUI.render();
assert(!JSON.stringify(tree).includes('0100106.131.01.020'), 'Closing hides the report');
nodes(tree).find(node => node.type === 'button').props.onClick();
await adminUI.settle();
assert.equal(adminUI.calls, 1, 'Reopening the same review reuses its historical report');
const retryUI = await adminReportView({ fail: true });
nodes(retryUI.render()).find(node => node.type === 'button').props.onClick();
tree = await retryUI.settle();
assert(nodes(tree).some(node => node.props?.role === 'alert'));
await nodes(tree).find(node => node.type === 'button' && node.props.children === 'Retry').props.onClick();
assert(!nodes(retryUI.render()).some(node => node.props?.role === 'alert'));
assert.equal(retryUI.calls, 2);
const missingUI = await adminReportView({ result: noHistory });
nodes(missingUI.render()).find(node => node.type === 'button').props.onClick();
assert(JSON.stringify(await missingUI.settle()).includes('No saved checkout report'), 'Historical gaps are explicit');

// Customer-facing text from the supplied example uses the real result card.
const screenshotUI = await adminReportView({ result: { ...savedReport, snapshot: {
  cadastral_number: snapshot.cadastral_number,
  apartment: { address: 'mun. Chișinău, bd. Decebal 63, ap. 59', area_m2: 41.9, floor: 4, toilet: 'Da', bathroom: 'Da',
    is_last_floor: 'Nu', estimated_value_lei: '404 207', object_type: 'Încăperi', destination: 'Locativă', room_usage: 'Apartament',
    ownership_type: 'Privată (pe cote părți)', transactions_count: 'Informația nu poate fi prezentată',
    real_rights: 'Nu există', notes: 'Nu există', restrictions: 'Nu există' },
  building: { classifier: 'Bloc cu apartamente', total_floors: 5, condition: 'Satisfacatoare', construction_year: 1965,
    wall_material: 'piatra de calcar (cotelet)', water: 'Centrala functioneaza', sewage: 'Centrala functioneaza', gas: 'Da', electricity: 'Nu' },
} } });
nodes(screenshotUI.render()).find(node => node.type === 'button').props.onClick();
const screenshotTree = await screenshotUI.settle();
const screenshotText = JSON.stringify(screenshotTree);
for (const key of ['Area', 'Floor', 'Toilet', 'Bathroom', 'LastFloor', 'EstimatedValue', 'ObjectType', 'Destination', 'RoomUsage',
  'PropertyType', 'Transactions', 'RealRights', 'Notes', 'Restrictions', 'Classifier', 'TotalFloors', 'Condition', 'Year', 'WallMaterial', 'Water', 'Sewage', 'Gas', 'Electricity']) {
  assert(screenshotText.includes(reviewMessages[`form.cadastral${key}`]), `Customer label preserved: ${key}`);
}
for (const value of ['41.9 m²', 'Etaj 4/5', '404 207 lei', 'Privată (pe cote părți)', 'Informația nu poate fi prezentată',
  'Nu sunt înregistrate', 'piatra de calcar (cotelet)', 'Centrala functioneaza']) {
  assert(screenshotText.includes(value), `Customer value preserved: ${value}`);
}
assert(nodes(screenshotTree).some(node => node.type === 'details' && node.props.children?.[0]?.props?.children === 'All saved fields'
  && !node.props.open), 'Additional saved fields stay collapsed below the customer report');

// Historical Mazililor-style address snapshots predate the nested unit format.
const oldSnapshot = { cadastral_number: '0100104.294.05.053', apartment: '53',
  matched_address: 'mun. Chișinău, str. Mazililor 32, ap. 53', apartment_area_m2: '104.7',
  apartment_floor: '8', apartment_type: 'Apartament', estimated_value_lei: '1 442 323' };
for (const original of [oldSnapshot, { ...oldSnapshot, apartment: { area_m2: '105', floor: '9', estimated_value_lei: '1 500 000' } }]) {
  const oldUI = await adminReportView({ result: { ...savedReport, snapshot: original } });
  nodes(oldUI.render()).find(node => node.type === 'button').props.onClick();
  const oldTree = await oldUI.settle();
  // Inspect only the visible card, excluding the raw-field disclosure.
  const card = nodes(oldTree).find(node => node.props?.className?.includes('border-2 border-emerald-200'));
  const text = JSON.stringify(card);
  const nested = typeof original.apartment === 'object' ? original.apartment : null;
  for (const value of [nested ? '105 m²' : '104.7 m²', nested ? '1 500 000 lei' : '1 442 323 lei']) {
    assert(text.includes(value), `Older saved field appears in the customer card: ${value}`);
  }
  assert(nodes(card).some(node => node.type === 'span' && node.props.children === (nested ? '9' : '8')), 'Saved unit floor appears');
  assert(!text.includes('Clasificator'), 'No building data is invented');
}
assert.equal(oldSnapshot.apartment, '53', 'The original historical snapshot is unchanged');
await db.close();
console.log('Result reviews: paid ownership, anonymous buyers, rating/comment validation, dismissal, duplicates, guest upgrade, admin privacy, SQL constraints, exact checkout snapshots and component lifecycle passed.');
