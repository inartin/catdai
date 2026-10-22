// Isolated dashboard regression checks; no network or live database writes.
// pnpm exec node --experimental-vm-modules scripts/test-admin-payments.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const now = Date.parse("2026-10-18T10:00:00Z");
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
let authorized = true;
let orders = [];
let checkoutEvents = [];
let failingPage = null;
const queries = [];
const user = { id: "buyer", email: "buyer@example.com", user_metadata: { full_name: "Buyer" } };
const json = (data, { status = 200 } = {}) => Response.json(data, { status });
const mocks = {
  "next/server": { NextResponse: { json } },
  "@/lib/admin-auth": {
    requireAdminApiAuth: () => authorized ? null : json({ error: "Unauthorized" }, { status: 401 }),
  },
  "@/lib/admin-cadastru-favorites": { loadCadastruFavorites: async (rows) => rows },
  "@/lib/cadastru-share-statistics": { loadCadastruShareStatistics: async (rows) => rows },
  "@/lib/supabase-admin": {
    supabaseAdmin: {
      rpc: async () => ({ data: [], error: null }),
      auth: { admin: { listUsers: async () => ({ data: { users: [user] } }) } },
      from(table) {
        assert.notEqual(table, "reporting_feature_credit_balances", "Payments never depend on remaining credits");
        const query = { table, filters: [], orderBy: [], from: 0, to: Infinity };
        queries.push(query);
        const result = () => {
          if (!["reporting_payment_orders", "payment_checkout_events"].includes(table)) return { data: [], count: 0, error: null };
          if (table === "reporting_payment_orders" && query.from === failingPage) return { data: null, error: { message: "Payment read failed" } };
          // The reporting view excludes MAIB sandbox orders.
          let data = table === "payment_checkout_events" ? [...checkoutEvents]
            : orders.filter((row) => row.provider === "paddle" || row.environment === "production");
          for (const [op, column, value] of query.filters) {
            data = data.filter((row) => op === "in" ? value.includes(row[column]) : row[column] && Date.parse(row[column]) >= Date.parse(value));
          }
          data.sort((a, b) => {
            for (const [column, { ascending, nullsFirst }] of query.orderBy) {
              if (a[column] === b[column]) continue;
              if (a[column] == null) return nullsFirst ? -1 : 1;
              if (b[column] == null) return nullsFirst ? 1 : -1;
              return (a[column] < b[column] ? -1 : 1) * (ascending ? 1 : -1);
            }
            return 0;
          });
          return { data: data.slice(query.from, query.to + 1), error: null };
        };
        const builder = {
          select() { return builder; },
          eq() { return builder; },
          is() { return builder; },
          in(column, value) { query.filters.push(["in", column, Array.from(value)]); return builder; },
          gte(column, value) { query.filters.push(["gte", column, value]); return builder; },
          order(column, options) { query.orderBy.push([column, options]); return builder; },
          range(from, to) { Object.assign(query, { from, to }); return builder; },
          then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
        };
        return builder;
      },
    },
  },
};
const context = vm.createContext({ console: { error() {} }, Date: FixedDate });
const route = new vm.SourceTextModule(await fs.readFile("src/app/api/admin/stats/route.js", "utf8"), { context });
await route.link((id) => {
  const mock = mocks[id];
  assert.ok(mock, `Unexpected import: ${id}`);
  return new vm.SyntheticModule(Object.keys(mock), function () {
    for (const [key, value] of Object.entries(mock)) this.setExport(key, value);
  }, { context });
});
await route.evaluate();
const get = (params = "period=all&fresh=1") => route.namespace.GET({ nextUrl: new URL(`https://catdai.md/api/admin/stats?${params}`) });
const payment = (id, fields = {}) => ({
  id, provider: "maib", environment: "production", user_id: user.id,
  product_key: "cadastru_lookup_single", status: "paid", amount_minor: 1500,
  currency_code: "MDL", refunded_minor: 0,
  created_at: "2026-10-17T20:00:00Z", paid_at: "2026-10-18T09:22:00Z", ...fields,
});

authorized = false;
assert.equal((await get()).status, 401);
assert.equal(queries.length, 0, "Unauthorized reads never reach payment or user data");
authorized = true;
assert.deepEqual((await (await get()).json()).payments, { available: true, total: 0, orders: [] });

orders = [
  payment("first"),
  payment("repeat", { paid_at: "2026-10-18T09:23:00Z" }),
  payment("partial", { status: "partially_refunded", refunded_minor: 500 }),
  payment("deleted-user", { user_id: null }),
  payment("legacy", { provider: "paddle", environment: "legacy" }),
  payment("yesterday", { paid_at: "2026-10-17T20:59:59Z" }),
  payment("sandbox", { environment: "sandbox" }),
  ...["pending", "registered", "failed", "refunded", "chargeback", "canceled", "expired"].map((status) => payment(status, { status })),
];
let response = await (await get("period=day&fresh=1")).json();
assert.equal(response.payments.total, 5, "Count individual purchases, repeat buyers and deleted users without active credit balances");
assert.equal(response.payments.orders[0].id, "repeat", "Newest payment first");
assert.ok(response.payments.orders.every((row) => !["sandbox", "yesterday", "failed", "refunded", "chargeback"].includes(row.id)));
const first = response.payments.orders.find((row) => row.id === "first");
assert.equal(first.name, "Buyer");
assert.equal(first.email, user.email);
assert.equal(first.amount_minor, 1500);
assert.equal(response.payments.orders.find((row) => row.id === "partial").refunded_minor, 500);
assert.equal(response.payments.orders.find((row) => row.id === "deleted-user").email, null);
assert.equal(response.periodSince, "2026-10-17T21:00:00.000Z", "Today starts at Chișinău midnight");
assert.equal((await (await get()).json()).payments.total, 6, "All time includes older payments");
for (const period of ["week", "month"]) {
  assert.equal((await (await get(`period=${period}&fresh=1`)).json()).payments.total, 6);
}

orders = Array.from({ length: 1001 }, (_, id) => payment(String(id).padStart(4, "0")));
response = await (await get()).json();
assert.equal(response.payments.total, 1001, "Payments beyond the API page limit are counted and listed");
assert.equal(response.payments.orders.length, 1001);
for (failingPage of [0, 1000]) {
  response = await (await get()).json();
  assert.deepEqual(response.payments, { available: false, total: null, orders: [] }, "Any failed page is unavailable, never zero or a partial count");
}
failingPage = null;
orders = [payment("recovered")];
assert.equal((await (await get()).json()).payments.total, 1, "Hard refresh recovers after a database failure");

checkoutEvents = [
  ...["click-1", "retry"].map((id) => ({ id, event_type: "maib_continue_clicked", user_id: user.id, created_at: "2026-10-18T09:00:00Z" })),
  { id: "second-user", event_type: "maib_continue_clicked", user_id: "other", created_at: "2026-10-18T09:05:00Z" },
  { id: "old", event_type: "maib_continue_clicked", user_id: user.id, created_at: "2026-10-17T20:59:59Z" },
  { id: "open", event_type: "checkout_page_opened", user_id: user.id, created_at: "2026-10-18T09:00:00Z" },
  { id: "created", event_type: "checkout_order_created", user_id: user.id, created_at: "2026-10-18T09:00:00Z" },
];
response = await (await get("period=day&fresh=1")).json();
assert.equal(response.paymentCheckout.maibContinue.total, 3, "Count attempts separately from page opens and orders");
assert.equal(response.paymentCheckout.maibContinue.uniqueVisitors, 2, "Retries count once per user in the visitor total");
assert.equal(response.paymentCheckout.page.total, 1);
assert.equal((await (await get()).json()).paymentCheckout.maibContinue.total, 4, "All time includes older clicks");
console.log("Admin payment dashboard checks passed.");
