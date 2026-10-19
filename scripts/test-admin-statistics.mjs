// Isolated request, writer, browser-auth and schema checks. No live writes.
// pnpm exec node --experimental-vm-modules scripts/test-admin-statistics.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import crypto from 'node:crypto';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { NextResponse } from 'next/server.js';
import { PGlite } from '@electric-sql/pglite';

const writes = [], authCalls = [];
const users = {
  admin: { id: 'admin-id', app_metadata: { catdai_is_admin: true } },
  member: { id: 'member-id', app_metadata: {}, user_metadata: { catdai_is_admin: true } },
};
const supabaseAdmin = {
  auth: { getUser: async token => {
    authCalls.push(token);
    if (token === 'outage') throw new Error('auth unavailable');
    return { data: { user: users[token] }, error: users[token] ? null : new Error('invalid token') };
  } },
  from(table) {
    let operation;
    const query = new Proxy({}, { get(_, key) {
      if (key === 'then') return resolve => resolve({ data: operation ? [{ id: 1 }] : null, error: null });
      if (key === 'single') return async () => ({ data: operation ? { id: 1 } : null, error: null });
      if (key === 'maybeSingle') return async () => ({ data: null, error: null });
      if (['insert', 'upsert', 'update', 'delete'].includes(key)) return row => {
        operation = key; writes.push({ table, operation, row }); return query;
      };
      return () => query;
    } });
    return query;
  },
  rpc: async (name, args) => {
    writes.push({ rpc: name, args });
    return { data: [{ allowed: true, source: 'paid', remaining_uses: 2, usage_event_id: 'credit-use' }], error: null };
  },
};
const mocks = {
  'node:async_hooks': { AsyncLocalStorage }, 'node:crypto': { default: crypto, ...crypto },
  'next/server': { NextResponse }, '@/lib/supabase-admin': { supabaseAdmin },
  '@/lib/rate-limit': { rateLimit: () => ({ check: () => ({ allowed: true, remaining: 10 }) }) },
  '@/lib/payment-provider': { getPaymentProvider: () => 'maib' },
  '@/lib/news-upvotes': { isValidNewsPostId: () => true },
  '@/lib/news-views': { fetchNewsViewCounts: async () => ({}) },
  '@/lib/seo': { getCanonicalSiteUrl: () => 'https://catdai.test' },
};
const context = vm.createContext({ console: { error() {} }, process: { env: { NODE_ENV: 'production', ADMIN_TOKEN: 'test-secret' } },
  Date, Buffer, URL, URLSearchParams, Headers, Request, Response, setTimeout, clearTimeout });
const modules = new Map();
async function moduleFor(id) {
  if (modules.has(id)) return modules.get(id);
  const mock = mocks[id];
  const mod = mock ? new vm.SyntheticModule(Object.keys(mock), function () {
    for (const [key, value] of Object.entries(mock)) this.setExport(key, value);
  }, { context }) : new vm.SourceTextModule(await fs.readFile(id.startsWith('@/') ? `src/${id.slice(2)}${path.extname(id) ? "" : ".js"}` : id, 'utf8'), { context, identifier: id });
  modules.set(id, mod); return mod;
}
async function load(id) {
  const mod = await moduleFor(id);
  if (mod.status === 'unlinked') await mod.link((id, parent) => moduleFor(id.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), id)) : id));
  await mod.evaluate(); return mod.namespace;
}
const request = (token, body = {}) => new Request('https://catdai.test/api/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
});
const { withStatisticsContext, shouldCollectStatistics } = await load('@/lib/statistics-context');
const { resolveAccessTier } = await load('@/lib/access-tier');
const decision = withStatisticsContext(async req => {
  const access = await resolveAccessTier(req);
  await Promise.resolve();
  return { collect: shouldCollectStatistics(), userId: access.user_id };
});
assert.equal((await decision(request('admin'))).collect, false);
assert.equal((await decision(request('member'))).collect, true, 'user_metadata cannot set the admin marker');
assert.equal((await decision(request())).collect, true);
assert.equal((await decision(request('invalid'))).collect, false);
assert.equal((await withStatisticsContext(() => shouldCollectStatistics())(request('outage'))), false);
const before = authCalls.length;
await decision(request('admin'));
assert.equal(authCalls.length - before, 1, 'auth lookup is shared within a request');
users.member.app_metadata.catdai_is_admin = true;
assert.equal((await decision(request('member'))).collect, false, 'next request sees a changed flag with the same bearer token');
users.member.app_metadata.catdai_is_admin = false;

// Concurrent and deferred work retains its own request policy.
const deferred = withStatisticsContext(async req => {
  await new Promise(resolve => setTimeout(resolve, 5));
  return { token: req.headers.get('authorization'), collect: shouldCollectStatistics() };
});
const concurrent = await Promise.all([deferred(request('admin')), deferred(request('member'))]);
assert.equal(concurrent[0].collect, false); assert.equal(concurrent[1].collect, true);
let background;
await withStatisticsContext(() => { background = new Promise(resolve => setTimeout(() => resolve(shouldCollectStatistics()), 5)); })(request('admin'));
assert.equal(await background, false);

// Actual shared writers: both event rows and aggregate counters are suppressed.
const { trackExternalApiUsage } = await load('@/lib/external-api-usage');
const { logCadastruSearchEvent } = await load('@/lib/cadastru-search-events');
const { logCalculatorUsageEvent } = await load('@/lib/calculator-usage-events');
const { logListingLinkAnalysisEvent } = await load('@/lib/listing-link-analysis-events');
const log = withStatisticsContext(async req => {
  await trackExternalApiUsage('cadastru_number', 'success', {});
  await logCadastruSearchEvent(req, 'number', { cadastralNumber: '0100104.003', resultType: 'full_data' });
  await logCalculatorUsageEvent(req, { calculator_usage: { apartment_price: 50000 }, data: { estimate: { market_rate: 500 } } });
  await logListingLinkAnalysisEvent(req, { status: 'success' });
});
writes.length = 0; await log(request('admin')); assert.equal(writes.length, 0);
await log(request('member'));
for (const table of ['external_api_usage_events', 'cadastru_search_events', 'calculator_usage_events', 'listing_link_analysis_events']) {
  assert.ok(writes.some(write => write.table === table), table);
}
assert.ok(writes.some(write => write.rpc === 'increment_external_api_usage'));

// Event-only endpoints accept excluded users without writing, including old
// evaluation journey tokens, which must not update historical analytics.
for (const route of ['activity/ping', 'ad-source-events', 'pdf-generation-events', 'market-trends-popup-events', 'payment-checkout-events']) {
  const { POST } = await load(`src/app/api/${route}/route.js`);
  writes.length = 0;
  const response = await POST(request('admin'));
  assert.equal(response.status, 200, route);
  assert.equal(writes.length, 0, route);
}
const { recordCadastruEvaluationStep, createCadastruEvaluationToken } = await load('@/lib/cadastru-evaluation-tracking');
const { recordSuggestionRecovery } = await load('@/lib/cadastru-suggestion-recovery');
writes.length = 0;
await withStatisticsContext(async () => {
  assert.equal(await recordCadastruEvaluationStep(createCadastruEvaluationToken(1), 'click'), false);
  await recordSuggestionRecovery({ eventId: 1 }, { address: {}, lookupSource: 'api' });
})(request('admin'));
assert.equal(writes.length, 0);
const news = await load('src/app/api/news/views/route.js');
writes.length = 0;
const newsResponse = await news.POST(request('admin', { post_id: 'news-id' }));
assert.equal(newsResponse.status, 200); assert.equal(writes.length, 0);
assert.equal(newsResponse.cookies.getAll().length, 0, 'admins receive no news visitor cookie');

// Feature data still saves, with a fixed creation-time statistics decision.
for (const [route, table, body] of [
  ['favorites', 'user_favorites', { url_path: '/evaluare?rooms=2' }],
  ['share', 'shared_links', { city: 'Chișinău', district: 'Botanica', rooms: 2 }],
  ['listing-alerts', 'user_listing_alerts', { base_filters: {}, alert_filters: {} }],
]) {
  const { POST } = await load(`src/app/api/${route}/route.js`);
  for (const token of ['admin', 'member']) {
    writes.length = 0;
    const response = await POST(request(token, body));
    assert.ok(response.ok, `${route}: ${await response.clone().text()}`);
    assert.equal(writes.find(write => write.table === table && write.operation === 'insert').row.collect_statistics, token === 'member');
  }
}
// Actual credit accounting is intentionally outside the statistics predicate.
const { consumePaidFeatureCredit } = await load('@/lib/paid-feature-usage');
const { consumeFreeMonthlyFeatureUsage } = await load('@/lib/free-monthly-feature-usage');
writes.length = 0;
await withStatisticsContext(async () => {
  await consumePaidFeatureCredit({ userId: 'admin-id', featureKey: 'sale_estimate', idempotencyKey: 'paid-test' });
  await consumeFreeMonthlyFeatureUsage({ userId: 'admin-id', featureKey: 'sale_estimate', idempotencyKey: 'free-test' });
})(request('admin'));
assert.ok(writes.some(write => write.rpc === 'consume_user_credit'));
assert.ok(writes.some(write => write.rpc === 'consume_free_monthly_credit'));

// Browser requests carry auth before the server decides what to record.
let clientToken = 'admin', sessionError = null;
mocks['@/lib/supabase'] = { supabase: { auth: { getSession: async () => ({
  data: { session: clientToken ? { access_token: clientToken } : null }, error: sessionError,
}) } } };
const browserRequests = [];
context.fetch = async (url, options) => {
  browserRequests.push({ url, options });
  return Response.json({ ok: true });
};
const { fetchWithStatisticsAuth } = await load('@/lib/statistics-client');
await fetchWithStatisticsAuth('/api/test', { headers: { 'Content-Type': 'application/json' } });
assert.equal(browserRequests.at(-1).options.headers.get('Authorization'), 'Bearer admin');
assert.equal(browserRequests.at(-1).options.headers.get('Content-Type'), 'application/json');
clientToken = null;
await fetchWithStatisticsAuth('/api/test');
assert.equal(browserRequests.at(-1).options.headers.has('Authorization'), false);
sessionError = new Error('session unavailable');
const requestCount = browserRequests.length;
await assert.rejects(fetchWithStatisticsAuth('/api/test'), /session unavailable/);
assert.equal(browserRequests.length, requestCount, 'session failures never become anonymous tracking requests');
sessionError = null;

// Migration preserves existing eligibility and filters new excluded records.
const db = new PGlite();
for (const table of ['user_favorites', 'shared_links', 'user_listing_alerts']) {
  await db.exec(`create table ${table} (id int primary key); insert into ${table} values (1);`);
}
const migration = await fs.readFile('supabase/migrations/20261019132539_admin_statistics_exclusion.sql', 'utf8');
await db.exec(migration); await db.exec(migration);
for (const table of ['user_favorites', 'shared_links', 'user_listing_alerts']) {
  await db.exec(`insert into ${table} values (2,false),(3,true);`);
  assert.equal((await db.query(`select count(*)::int n from ${table} where collect_statistics`)).rows[0].n, 2);
  assert.equal((await db.query(`select collect_statistics from ${table} where id=1`)).rows[0].collect_statistics, true);
}
await db.close();
console.log('Admin statistics checks passed: current auth, isolation/background writes, event suppression, functional data, paid/free credit usage, authenticated browser requests and historical schema eligibility.');
