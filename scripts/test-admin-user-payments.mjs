import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { sharedPaidCreditBalance, sharedFreeMonthlyCredit } from "../src/lib/shared-credit-balance.mjs";

let authorized = true, paymentError = null;
const queries = [];
const users = [
  { id: "buyer" }, { id: "failed" }, { id: "pending" }, { id: "free" },
  { id: "manual", app_metadata: { catdai_admin_package_key: "extra_pack" } },
];
const order = (user_id, product_key, status, index) => ({
  id: String(index), user_id, product_key, status, provider: "maib", environment: "production",
  created_at: `2026-10-${String(index).padStart(2, "0")}T12:00:00Z`,
  paid_at: ["paid", "partially_refunded", "refund_pending", "refunded", "chargeback"].includes(status) ? "2026-10-10T12:00:00Z" : null,
});
let orders = [
  order("buyer", "cadastru_lookup_single", "paid", 9),
  order("buyer", "cadastru_lookup_single", "paid", 8),
  order("buyer", "standard_pack", "partially_refunded", 7),
  order("buyer", "pro_pack", "refunded", 6),
  order("buyer", "extra_pack", "chargeback", 5),
  order("buyer", "pdf_report_single", "refund_pending", 4),
  order("buyer", "pro_pack", "failed", 3),
  order("buyer", "extra_pack", "registered", 2),
  ...["failed", "payment_failed", "canceled", "expired", "checkout_closed"].map((status, i) => order("failed", "standard_pack", status, i + 1)),
  order("pending", "pro_pack", "creation_unknown", 1),
];
const mocks = {
  "next/server": { NextResponse: { json: Response.json } },
  "@/lib/admin-auth": { requireAdminApiAuth: () => authorized ? null : Response.json({}, { status: 401 }) },
  "@/lib/shared-credit-balance.mjs": { sharedPaidCreditBalance, sharedFreeMonthlyCredit },
  "@/lib/free-monthly-feature-usage": { FREE_MONTHLY_FEATURE_KEYS: [] },
  "@/lib/payment-products": { PAYMENT_FEATURE_KEYS: [] },
  "@/lib/supabase-admin": { supabaseAdmin: {
    auth: { admin: { listUsers: async () => ({ data: { users } }) } },
    from(table) {
      const query = { table, orders: [] };
      queries.push(query);
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        not() { return builder; }, is() { return builder; }, eq() { return builder; },
        order(column) { query.orders.push(column); return builder; },
        range(from, to) {
          query.range = [from, to];
          return { data: table === "reporting_payment_orders" ? orders.slice(from, to + 1) : [],
            error: table === "reporting_payment_orders" ? paymentError : null };
        },
      };
      return builder;
    },
  } },
  react: React, "react-dom": ReactDOM, "react/jsx-runtime": jsxRuntime,
};
const require = createRequire(import.meta.url);
const { transform, loadBindings } = require("next/dist/build/swc");
await loadBindings();
const context = vm.createContext({ console: { error() {} }, Response, Date, Intl });
const modules = new Map();
async function moduleFor(id) {
  if (modules.has(id)) return modules.get(id);
  const mock = mocks[id];
  let mod;
  if (mock) {
    mod = new vm.SyntheticModule(Object.keys(mock), function () {
      for (const [key, value] of Object.entries(mock)) this.setExport(key, value);
    }, { context });
  } else {
    const file = id.startsWith("@/") ? `src/${id.slice(2)}.js` : id;
    const source = await fs.readFile(file, "utf8");
    const { code } = await transform(source, { filename: file,
      jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "es6" } });
    mod = new vm.SourceTextModule(code, { context });
  }
  modules.set(id, mod);
  await mod.link((name) => moduleFor(name === "./admin-periods" ? "@/lib/admin-periods" : name));
  return mod;
}
const route = await moduleFor("src/app/api/admin/users/route.js");
await route.evaluate();
const get = (fresh = true) => route.namespace.GET({ nextUrl: new URL(`https://catdai.test/api/admin/users${fresh ? "?fresh=1" : ""}`) });
const list = async () => (await (await get()).json()).users;

authorized = false;
assert.equal((await get()).status, 401);
assert.equal(queries.length, 0);
authorized = true;
let result = await list();
const buyer = result.find((user) => user.id === "buyer");
assert.equal(buyer.packageKey, "standard_pack", "Failed, pending, refunded and disputed packages do not become the active package");
assert.deepEqual(buyer.paymentSummary, { total: 8, paid: 6, failed: 1, pending: 1,
  products: [{ key: "cadastru_lookup_single", count: 2 }, { key: "standard_pack", count: 1 },
    { key: "pro_pack", count: 1 }, { key: "extra_pack", count: 1 }, { key: "pdf_report_single", count: 1 }] });
assert.deepEqual(result.find((user) => user.id === "failed").paymentSummary, { total: 5, paid: 0, failed: 5, pending: 0, products: [] });
assert.equal(result.find((user) => user.id === "pending").paymentSummary.pending, 1);
assert.equal(result.find((user) => user.id === "free").paymentSummary, null);
assert.equal(result.find((user) => user.id === "manual").paymentSummary, null);
assert.equal(result.find((user) => user.id === "manual").packageKey, "extra_pack");
assert.deepEqual(queries.find((query) => query.table === "reporting_payment_orders").orders, ["created_at", "id", "provider"]);
assert.ok(!queries.some((query) => query.table === "payment_orders_all"), "Only the production reporting view supplies purchases");

orders = Array.from({ length: 1001 }, (_, index) => order("buyer", "cadastru_lookup_single", "paid", index + 1));
assert.equal((await list()).find((user) => user.id === "buyer").paymentSummary.paid, 1001);
assert.ok(queries.some((query) => query.table === "reporting_payment_orders" && query.range[0] === 1000));
for (const code of ["42P01", "42703", "57014"]) {
  paymentError = { code, message: "payment read unavailable" };
  assert.equal((await get()).status, 500, "Missing schema and provider failures must not look like users with no purchases");
}
authorized = false;
assert.equal((await get(false)).status, 401, "Authentication also precedes cached responses");

const ui = await moduleFor("@/components/admin/AdminUserPayments");
await ui.evaluate();
const Component = ui.namespace.default;
const render = (summary) => renderToStaticMarkup(React.createElement(Component, { summary }));
assert.equal(render(null), "");
assert.equal(render({ total: 0 }), "");
let html = render(buyer.paymentSummary);
assert.match(html, /Cadastru lookup/);
assert.match(html, /\+4/);
assert.match(html, /8 total/);
assert.match(html, /6 paid/);
assert.match(html, /1 failed/);
assert.match(html, /1 pending/);
html = render({ total: 2, paid: 0, failed: 2, pending: 0, products: [] });
assert.match(html, /No purchases/);
assert.doesNotMatch(html, /Start|Standard/);
let opened = false;
const element = Component({ summary: buyer.paymentSummary, onClick: () => { opened = true; } });
element.props.children.props.onClick();
assert.equal(opened, true, "Purchase summaries open the existing user popup");
console.log("Admin user purchase summaries: counts, products, empty cells, statuses, pagination, read failures, auth and UI passed.");
