// Isolated reporting regressions; no network, bank operations or database writes.
// pnpm exec node --experimental-vm-modules scripts/test-admin-payment-report.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

let now = Date.parse("2026-10-31T10:00:00Z");
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
let authorized = true;
let orders = [];
let searches = [];
let checkoutEvents = [];
let failingFunnelPage = null;
let failingPage = null;
let failDetails = false;
let failingUserPage = null;
let reads = 0;
let userReads = 0;
let cacheReads = 0;
const cachedReports = new Map();
const cacheWrites = [];
const buyer = { id: "buyer", email: "buyer@example.com", user_metadata: { full_name: "Buyer", catdai_is_admin: true } };
const admin = { id: "admin", app_metadata: { catdai_is_admin: true } };
let users = [buyer, { id: "guest", is_anonymous: true }, admin];
const context = vm.createContext({ console: { error() {} }, Date: FixedDate, URL });
const periods = new vm.SourceTextModule(await fs.readFile("src/lib/admin-periods.js", "utf8"), { context });
await periods.link(() => { throw new Error("Unexpected period dependency"); });
await periods.evaluate();
const helper = new vm.SourceTextModule(await fs.readFile("src/lib/admin-payments.js", "utf8"), { context });
await helper.link((id) => { assert.equal(id, "./admin-periods"); return periods; });
await helper.evaluate();
const { paymentPeriod } = helper.namespace;
assert.equal(paymentPeriod("day").since, "2026-10-30T22:00:00.000Z");
assert.equal(paymentPeriod("day", new Date("2026-10-25T12:00:00Z")).since, "2026-10-24T21:00:00.000Z", "Autumn clock change uses the offset at midnight");
assert.equal(paymentPeriod("day", new Date("2026-03-29T12:00:00Z")).since, "2026-03-28T22:00:00.000Z", "Spring clock change uses the offset at midnight");
assert.equal(paymentPeriod("week").since, "2026-10-24T10:00:00.000Z");
assert.equal(paymentPeriod("month").since, "2026-09-30T21:00:00.000Z");
assert.equal(paymentPeriod("__proto__").period, "all");

const mocks = {
  "@/lib/cache": {
    getSharedCache: async (key) => {
      cacheReads++;
      const entry = cachedReports.get(key);
      return entry && entry.expiresAt > now ? { value: entry.value } : null;
    },
    setSharedCache: async (key, value, ttl) => {
      cacheWrites.push({ key, ttl });
      cachedReports.set(key, { value: JSON.parse(JSON.stringify(value)), expiresAt: now + ttl * 1000 });
      return true;
    },
  },
  "next/server": { NextResponse: { json: (value, options) => Response.json(value, options) } },
  "@/lib/admin-auth": { requireAdminApiAuth: () => authorized ? null : Response.json({ error: "Unauthorized" }, { status: 401 }) },
  "@/lib/supabase-admin": { supabaseAdmin: {
    auth: { admin: { listUsers: async ({ page, perPage }) => {
      userReads++;
      return page === failingUserPage ? { data: null, error: { message: "User read failed" } }
        : { data: { users: users.slice((page - 1) * perPage, page * perPage) } };
    } } },
    from(table) {
      reads++;
      const filters = [];
      const sort = [];
      let start = 0;
      let end = Infinity;
      const query = {
        select() { return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        is(key, value) { filters.push((row) => row[key] === value); return query; },
        or(expression) {
          assert.equal(expression, "result_cadastru.eq.true,result_type.in.(full_data,apartment_only,land_only,address_only)");
          filters.push((row) => row.result_cadastru || ["full_data", "apartment_only", "land_only", "address_only"].includes(row.result_type));
          return query;
        },
        not(key, operator, value) { assert.equal(operator, "is"); filters.push((row) => row[key] !== value); return query; },
        lt(key, value) { filters.push((row) => row[key] < value); return query; },
        gte(key, value) { filters.push((row) => row[key] >= value); return query; },
        order(key, { ascending = true } = {}) { sort.push([key, ascending]); return query; },
        range(from, to) { start = from; end = to; return query; },
        then(resolve, reject) {
          let rows;
          if (table === "maib_payment_orders") {
            if (failDetails) return Promise.resolve({ data: null, error: { message: "Details failed" } }).then(resolve, reject);
            rows = orders.filter((row) => row.provider === "maib").map((row) => ({ id: row.id, receipt_email: "receipt@example.com", product_title: "Saved purchase title" }));
          } else if (table === "cadastru_search_events" || table === "payment_checkout_events") {
            if (start === failingFunnelPage) return Promise.resolve({ data: null, error: { message: "Funnel read failed" } }).then(resolve, reject);
            rows = table === "cadastru_search_events" ? searches : checkoutEvents;
          } else {
            assert.equal(table, "reporting_payment_orders");
            if (start === failingPage) return Promise.resolve({ data: null, error: { message: "Read failed" } }).then(resolve, reject);
            rows = orders.filter((row) => row.provider === "paddle" || row.environment === "production");
          }
          rows = rows.filter((row) => filters.every((filter) => filter(row))).sort((a, b) => {
            for (const [key, ascending] of sort) {
              if (a[key] !== b[key]) return (a[key] > b[key] ? 1 : -1) * (ascending ? 1 : -1);
            }
            return 0;
          });
          return Promise.resolve({ data: rows.slice(start, end + 1), error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  } },
};
function mockModule(id) {
  assert.ok(mocks[id], `Unexpected import ${id}`);
  return new vm.SyntheticModule(Object.keys(mocks[id]), function () {
    for (const [key, value] of Object.entries(mocks[id])) this.setExport(key, value);
  }, { context });
}
const funnelDeps = { "@/lib/admin-periods": periods };
for (const name of ["guest-checkout.mjs", "visitor.js"]) {
  const dependency = new vm.SourceTextModule(await fs.readFile(`src/lib/${name}`, "utf8"), { context });
  await dependency.link(() => { throw new Error("Unexpected funnel helper dependency"); });
  await dependency.evaluate();
  funnelDeps[`@/lib/${name.replace(/\.js$/, "")}`] = dependency;
}
const funnel = new vm.SourceTextModule(await fs.readFile("src/lib/admin-cadastru-payment-funnel.js", "utf8"), { context });
await funnel.link((id) => funnelDeps[id] || mockModule(id));
await funnel.evaluate();
const route = new vm.SourceTextModule(await fs.readFile("src/app/api/admin/payments/route.js", "utf8"), { context });
await route.link((id) => {
  if (id === "@/lib/admin-payments") return helper;
  if (id === "@/lib/admin-cadastru-payment-funnel") return funnel;
  return mockModule(id);
});
await route.evaluate();
const get = (params = "", fresh = true) => route.namespace.GET({ nextUrl: new URL(`https://catdai.md/api/admin/payments?${params}${fresh ? "&fresh=1" : ""}`) });
const payment = (id, fields = {}) => ({ id, provider: "maib", environment: "production", user_id: "buyer", product_key: "credits_10", status: "paid", amount_minor: 7900, refunded_minor: 0, currency_code: "MDL", paid_at: "2026-10-31T08:00:00Z", transaction_id: `bank-${id}`, ...fields });

authorized = false;
assert.equal((await get()).status, 401);
assert.equal(reads, 0, "Authorization precedes every read");
assert.equal(userReads, 0);
assert.equal(cacheReads, 0);
authorized = true;
for (const params of ["page=-1", "page=0", "page=1.5", "page=1000000", "currency=MDL,EUR"]) {
  assert.equal((await get(params)).status, 400);
}
assert.equal(reads, 0);
assert.equal(userReads, 0);
assert.equal(cacheReads, 0);
let response = await get();
assert.equal(response.headers.get("cache-control"), "private, no-store");
let report = await response.json();
assert.equal(report.totals.count, 0);
assert.equal(report.totals.averageMinor, null);
assert.equal(report.currency, "MDL");
assert.equal(report.pageCount, 1);
assert.deepEqual(report.cadastruFunnel, { searched: 0, checkoutStarted: 0, proceededToPayment: 0, purchased: 0 });

orders = [
  payment("paid"),
  payment("partial", { status: "partially_refunded", refunded_minor: 1900, user_id: "guest" }),
  payment("returned", { status: "refunded", refunded_minor: 7900, user_id: null }),
  payment("paddle-dispute", { provider: "paddle", status: "chargeback", refunded_minor: 0 }),
  payment("paddle-refund", { provider: "paddle", status: "refunded", refunded_minor: 0 }),
  payment("paddle-eur", { provider: "paddle", currency_code: "EUR", amount_minor: 2000 }),
  payment("old", { paid_at: "2026-10-30T21:59:59Z" }),
  payment("sandbox", { environment: "sandbox" }),
  payment("admin-paid", { user_id: admin.id }),
  payment("admin-partial", { user_id: admin.id, status: "partially_refunded", refunded_minor: 1900 }),
  payment("admin-returned", { user_id: admin.id, status: "refunded", refunded_minor: 7900 }),
  payment("admin-paddle", { user_id: admin.id, provider: "paddle", status: "chargeback" }),
  payment("admin-currency", { user_id: admin.id, currency_code: "USD", product_key: "admin-only" }),
  ...["pending", "failed", "expired", "canceled", "registered"].map((status) => payment(status, { status })),
  payment("unconfirmed", { paid_at: null }),
];
report = await (await get("period=day")).json();
assert.equal(report.totals.count, 5);
assert.equal(report.totals.grossMinor, 39500);
assert.equal(report.totals.reversedMinor, 25600);
assert.equal(report.totals.retainedMinor, 13900);
assert.equal(report.totals.reversedCount, 4);
assert.equal(report.totals.averageMinor, 7900);
assert.ok(report.orders.every((row) => row.user_id !== admin.id));
assert.equal(report.products.length, 1, "Admin-only products and currencies do not enter the report");
assert.equal(report.products[0].retainedMinor, 13900);
assert.deepEqual(report.currencies, ["EUR", "MDL"]);
assert.equal(report.orders.find((row) => row.id === "partial").email, "receipt@example.com", "Guest purchases use their receipt snapshot");
assert.equal(report.orders.find((row) => row.id === "returned").email, "receipt@example.com", "Deleted accounts retain receipt emails");
assert.equal(report.orders.find((row) => row.id === "paid").productTitle, "Saved purchase title");
assert.equal(report.orders.find((row) => row.id === "paddle-dispute").retained, 0);
report = await (await get("period=day&currency=EUR")).json();
assert.equal(report.totals.count, 1);
assert.equal(report.totals.grossMinor, 2000, "Currencies are never summed together");
assert.equal(report.orders[0].email, "buyer@example.com");
assert.equal((await (await get()).json()).totals.count, 6, "All time includes earlier MDL payments");
admin.app_metadata.catdai_is_admin = false;
assert.equal((await (await get()).json()).totals.count, 10, "Unmarked admins are counted again on refresh");
admin.app_metadata.catdai_is_admin = true;

orders = Array.from({ length: 1001 }, (_, i) => payment(String(i).padStart(4, "0"), { user_id: null }));
orders.unshift(payment("admin-first", { user_id: admin.id, paid_at: "2026-10-31T09:00:00Z" }));
users = [...Array.from({ length: 1000 }, (_, i) => ({ id: `other-${i}` })), admin];
report = await (await get("page=21")).json();
assert.equal(report.totals.count, 1001, "Totals read beyond the 1000-row API limit");
assert.equal(report.orders.length, 1);
assert.equal(report.pageCount, 21);
assert.equal(report.orders[0].id, "0000", "Stable payment/id/provider order spans pages");
assert.equal((await (await get()).json()).orders[0].id, "1000", "Admin filtering happens before pagination, even with admins on a later auth page");
assert.equal((await (await get("page=99")).json()).page, 21, "A shortened result clamps to the last page");
for (failingPage of [0, 1000]) {
  response = await get();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).totals, undefined, "Failed reads never expose partial totals");
}
failingPage = null;
for (failingUserPage of [1, 2]) {
  response = await get();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).totals, undefined, "Failed user reads cannot count unidentified admins");
}
failingUserPage = null;
failDetails = true;
assert.equal((await get()).status, 503);
failDetails = false;
orders = [payment("invalid", { refunded_minor: 8000 })];
assert.equal((await get()).status, 503, "Malformed stored amounts cannot become misleading totals");
orders = [payment("recovered")];
assert.equal((await (await get()).json()).totals.count, 1);

cachedReports.clear();
orders = [payment("cached")];
report = await (await get("", false)).json();
assert.equal(cacheWrites.at(-1).ttl, 1200, "Reports expire after exactly 20 minutes");
const cachedAt = report.updatedAt;
orders.push(payment("new"));
const readsBeforeCacheHit = reads;
const usersBeforeCacheHit = userReads;
now += 1199 * 1000;
report = await (await get("", false)).json();
assert.equal(report.totals.count, 1, "Cache is retained for the full 20-minute window");
assert.equal(report.updatedAt, cachedAt, "Cache hits preserve the report timestamp");
assert.equal(reads, readsBeforeCacheHit);
assert.equal(userReads, usersBeforeCacheHit, "Cache hits skip both payment and buyer reads");
const cacheReadsBeforeUnauthorized = cacheReads;
authorized = false;
assert.equal((await get("", false)).status, 401);
assert.equal(cacheReads, cacheReadsBeforeUnauthorized, "Populated caches still require admin auth");
authorized = true;
now += 1000;
report = await (await get("", false)).json();
assert.equal(report.totals.count, 2, "Expired reports read the database again");
assert.notEqual(report.updatedAt, cachedAt);
orders.push(payment("refreshed"));
assert.equal((await (await get()).json()).totals.count, 3, "Refresh bypasses an unexpired cache");
assert.equal((await (await get("", false)).json()).totals.count, 3, "Refresh replaces the cached report");
for (const params of ["period=week", "currency=EUR", "page=2"]) {
  const before = reads;
  response = await get(params, false);
  assert.equal(response.status, 200);
  assert.ok(reads > before, "Period, currency and page use separate cache entries");
  if (params === "currency=EUR") assert.equal((await response.json()).totals.count, 0);
}
const writesBeforeFailure = cacheWrites.length;
failingPage = 0;
assert.equal((await get("period=month", false)).status, 503);
assert.equal(cacheWrites.length, writesBeforeFailure, "Failures never enter the cache");
failingPage = null;
assert.equal((await get("period=month", false)).status, 200, "A failed request can immediately recover");

now = Date.parse("2026-10-31T21:59:30Z");
orders = [payment("before-midnight", { paid_at: "2026-10-31T21:59:00Z" })];
assert.equal((await (await get("period=day", false)).json()).orders[0].id, "before-midnight");
now += 60000;
orders.push(payment("after-midnight", { paid_at: "2026-10-31T22:00:00Z" }));
report = await (await get("period=day", false)).json();
assert.equal(report.totals.count, 1, "Today changes at local midnight even before cache expiry");
assert.equal(report.orders[0].id, "after-midnight");
orders = [
  payment("before-month", { paid_at: "2026-09-30T20:59:59.999Z" }),
  payment("start-month", { paid_at: "2026-09-30T21:00:00.000Z" }),
  payment("end-month", { paid_at: "2026-10-31T21:59:59.999Z" }),
  payment("next-month", { paid_at: "2026-10-31T22:00:00.000Z" }),
];
report = await (await get("period=previous_month")).json();
assert.deepEqual(report.orders.map((row) => row.id), ["end-month", "start-month"], "Previous month includes its start and excludes this month's start");
assert.equal(report.until, "2026-10-31T22:00:00.000Z");
// Cache entries must roll over with the calendar even within the 20-minute TTL.
now = Date.parse("2026-11-30T21:59:30Z");
await get("period=month", false);
await get("period=previous_month", false);
const beforeMonthChange = reads;
now += 60000;
await get("period=month", false);
await get("period=previous_month", false);
assert.ok(reads >= beforeMonthChange + 2, "Both month caches roll over at Chișinău midnight");
console.log("Admin payment report checks passed.");

now = Date.parse("2026-11-10T12:00:00Z");
users = [buyer, { id: "guest", is_anonymous: true }, admin];
const browser = (id) => `11111111-1111-4111-8111-${String(id).padStart(12, "0")}`;
const lookup = (id, fields = {}) => ({ id, result_type: "full_data", duplicate_of: null, created_at: "2026-11-10T07:00:00Z", ...fields });
const resultPath = "/ro/cadastru/rezultat?cadastral_number=0100201.999";
const checkoutPath = `/payment/maib/checkout?return_to=${encodeURIComponent(resultPath)}`;
const open = (id, fields = {}) => ({ id, event_type: "checkout_page_opened", product_key: "cadastru_lookup_single",
  path: checkoutPath, created_at: "2026-11-10T08:00:00Z", ...fields });

searches = [
  ...Array.from({ length: 1000 }, (_, id) => lookup(id, { user_id: "buyer", visitor: { device_id: browser(id % 2) } })),
  lookup(1000, { visitor: { device_id: browser(2) }, result_type: "no_data", result_cadastru: true }),
  lookup(1001, { visitor: { device_id: browser(3) } }),
  lookup(1002, { user_id: "early-payment" }),
  lookup(1003, { user_id: "pricing-only" }),
  lookup(1004, { user_id: "wrong-order", created_at: "2026-11-10T09:00:00Z" }),
  lookup(1005, { user_id: "before-period", created_at: "2026-11-09T21:59:59Z" }),
  lookup(1006, { user_id: "no-data", result_type: "no_data" }),
  lookup(1007, { user_id: "duplicate", duplicate_of: 1 }),
  lookup(1008, { user_id: "bot", visitor: { device_type: "Bot" } }),
  lookup(1009, { user_id: "admin" }),
  lookup(1010),
  lookup(1011, { user_id: "no-checkout" }),
];
checkoutEvents = [
  open(1, { user_id: "buyer", event_type: "checkout_popup_opened", path: resultPath }),
  open(2, { user_id: "buyer" }),
  open(3, { device_id: browser(2) }),
  open(4, { user_id: "guest", device_id: browser(2), event_type: "checkout_order_created" }),
  open(5, { user_id: "shared-a", device_id: browser(3) }),
  open(6, { user_id: "shared-b", device_id: browser(3) }),
  open(7, { user_id: "early-payment" }),
  open(8, { user_id: "pricing-only", path: checkoutPath + "&checkout_source=pricing" }),
  open(9, { user_id: "wrong-order" }),
  open(10, { user_id: "before-period" }),
  open(11, { user_id: "no-data" }),
  open(12, { user_id: "admin" }),
  open(13, { user_id: "guest", device_id: browser(2), event_type: "maib_continue_clicked", created_at: "2026-11-10T08:10:00Z" }),
  open(14, { user_id: "guest", device_id: browser(2), event_type: "maib_continue_clicked", created_at: "2026-11-10T08:11:00Z" }),
  open(15, { user_id: "early-payment", event_type: "maib_continue_clicked", created_at: "2026-11-10T08:10:00Z" }),
  open(16, { user_id: "buyer", event_type: "maib_continue_clicked", created_at: "2026-11-10T07:50:00Z" }),
  open(17, { user_id: "buyer", event_type: "maib_continue_clicked", path: checkoutPath + "&checkout_source=pricing" }),
  open(18, { user_id: "no-checkout", event_type: "maib_continue_clicked" }),
];
const paid = (id, fields) => payment(id, { paid_at: "2026-11-10T09:00:00Z", ...fields });
orders = [
  paid("buyer-one", { currency_code: "EUR", provider: "paddle" }),
  paid("buyer-two", { currency_code: "EUR", provider: "paddle" }),
  paid("guest-package", { user_id: "guest" }),
  paid("too-early", { user_id: "early-payment", paid_at: "2026-11-10T07:30:00Z" }),
  paid("sandbox-only", { user_id: "early-payment", environment: "sandbox" }),
  paid("shared-browser", { user_id: "shared-b" }),
  paid("pricing", { user_id: "pricing-only" }),
  paid("wrong-order", { user_id: "wrong-order" }),
  paid("admin", { user_id: "admin" }),
  paid("no-checkout", { user_id: "no-checkout" }),
];
report = await (await get("period=day&currency=MDL")).json();
assert.deepEqual(report.cadastruFunnel, { searched: 7, checkoutStarted: 3, proceededToPayment: 2, purchased: 2 },
  "Pay submissions deduplicate after contextual checkout and remain separate from confirmed purchases");
assert.deepEqual((await (await get("period=day&currency=EUR")).json()).cadastruFunnel, report.cadastruFunnel);
failingFunnelPage = 1000;
const beforeFunnelFailure = cacheWrites.length;
report = await (await get("period=day")).json();
assert.equal(report.cadastruFunnel, null, "A failed event page cannot produce a partial funnel");
assert.ok(report.totals.count > 0, "Sales remain available if the funnel fails");
assert.equal(cacheWrites.length, beforeFunnelFailure, "An incomplete report is never cached");
console.log("Cadastru purchase funnel checks passed.");
