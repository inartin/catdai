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
const context = vm.createContext({ console: { error() {} }, Date: FixedDate });
const helper = new vm.SourceTextModule(await fs.readFile("src/lib/admin-payments.js", "utf8"), { context });
await helper.link(() => { throw new Error("Unexpected helper dependency"); });
await helper.evaluate();
const { paymentPeriod } = helper.namespace;
assert.equal(paymentPeriod("day").since, "2026-10-30T22:00:00.000Z");
assert.equal(paymentPeriod("day", new Date("2026-10-25T12:00:00Z")).since, "2026-10-24T21:00:00.000Z", "Autumn clock change uses the offset at midnight");
assert.equal(paymentPeriod("day", new Date("2026-03-29T12:00:00Z")).since, "2026-03-28T22:00:00.000Z", "Spring clock change uses the offset at midnight");
assert.equal(paymentPeriod("week").since, "2026-10-24T10:00:00.000Z");
assert.equal(paymentPeriod("month").since, "2026-10-01T10:00:00.000Z");
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
        not(key, operator, value) { assert.equal(operator, "is"); filters.push((row) => row[key] !== value); return query; },
        gte(key, value) { filters.push((row) => row[key] >= value); return query; },
        order(key) { sort.push(key); return query; },
        range(from, to) { start = from; end = to; return query; },
        then(resolve, reject) {
          let rows;
          if (table === "maib_payment_orders") {
            if (failDetails) return Promise.resolve({ data: null, error: { message: "Details failed" } }).then(resolve, reject);
            rows = orders.filter((row) => row.provider === "maib").map((row) => ({ id: row.id, receipt_email: "receipt@example.com", product_title: "Saved purchase title" }));
          } else {
            assert.equal(table, "reporting_payment_orders");
            if (start === failingPage) return Promise.resolve({ data: null, error: { message: "Read failed" } }).then(resolve, reject);
            rows = orders.filter((row) => row.provider === "paddle" || row.environment === "production");
          }
          rows = rows.filter((row) => filters.every((filter) => filter(row))).sort((a, b) => {
            for (const key of sort) { if (a[key] !== b[key]) return a[key] > b[key] ? -1 : 1; }
            return 0;
          });
          return Promise.resolve({ data: rows.slice(start, end + 1), error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  } },
};
const route = new vm.SourceTextModule(await fs.readFile("src/app/api/admin/payments/route.js", "utf8"), { context });
await route.link((id) => {
  if (id === "@/lib/admin-payments") return helper;
  assert.ok(mocks[id], `Unexpected import ${id}`);
  return new vm.SyntheticModule(Object.keys(mocks[id]), function () {
    for (const [key, value] of Object.entries(mocks[id])) this.setExport(key, value);
  }, { context });
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
console.log("Admin payment report checks passed.");
