// pnpm exec node --experimental-vm-modules scripts/test-payments-today.mjs
import assert from "node:assert/strict";
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";

let now = Date.parse("2026-11-08T10:00:00Z");
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
}
const adminId = "00000000-0000-4000-8000-000000000001";
let users = [{ id: adminId, app_metadata: { catdai_is_admin: true } }];
let count = 7;
let failUsers = false;
let failCount = false;
let throwCount = false;
const calls = [];
const supabaseAdmin = createClient("https://test.supabase.co", "test-service-key", {
  global: { fetch: async (input, options) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.pathname === "/auth/v1/admin/users") {
      if (failUsers) return Response.json({ message: "Private auth error" }, { status: 500 });
      const page = Number(url.searchParams.get("page"));
      const size = Number(url.searchParams.get("per_page"));
      return Response.json({ users: users.slice((page - 1) * size, page * size) });
    }
    assert.equal(url.pathname, "/rest/v1/reporting_payment_orders");
    assert.equal(options.method, "HEAD", "Only the aggregate count is requested");
    assert.match(new Headers(options.headers).get("prefer"), /count=exact/);
    if (throwCount) throw new Error("Private network error");
    if (failCount) return new Response(null, { status: 500 });
    return new Response(null, { headers: count === null ? {} : { "content-range": `*/${count}` } });
  } },
});
const env = { PAYMENTS_STATS_TOKEN: "test-only-token-with-at-least-32-characters" };
const context = vm.createContext({ Buffer, Date: FixedDate, process: { env }, console: { error() {} } });
const periods = new vm.SourceTextModule(await fs.readFile("src/lib/admin-periods.js", "utf8"), { context });
await periods.link(() => { throw new Error("Unexpected period dependency"); });
await periods.evaluate();
const payments = new vm.SourceTextModule(await fs.readFile("src/lib/admin-payments.js", "utf8"), { context });
await payments.link((id) => { assert.equal(id, "./admin-periods"); return periods; });
await payments.evaluate();
const route = new vm.SourceTextModule(await fs.readFile("src/app/api/payments/today/route.js", "utf8"), { context });
await route.link((id) => {
  if (id === "@/lib/admin-periods") return periods;
  if (id === "@/lib/admin-payments") return payments;
  const mocks = {
    "node:crypto": { timingSafeEqual },
    "next/server": { NextResponse: { json: (value, options) => Response.json(value, options) } },
    "@/lib/supabase-admin": { supabaseAdmin },
  };
  assert.ok(mocks[id], `Unexpected import: ${id}`);
  return new vm.SyntheticModule(Object.keys(mocks[id]), function () {
    for (const [key, value] of Object.entries(mocks[id])) this.setExport(key, value);
  }, { context });
});
await route.evaluate();

async function get(authorization = `Bearer ${env.PAYMENTS_STATS_TOKEN}`, suffix = "") {
  const response = await route.namespace.GET(new Request(`https://catdai.md/api/payments/today${suffix}`, {
    headers: authorization === null ? {} : { Authorization: authorization },
  }));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return response;
}
for (const authorization of [null, "Basic wrong", "Bearer wrong", `Bearer ${"x".repeat(env.PAYMENTS_STATS_TOKEN.length)}`, `Bearer ${env.PAYMENTS_STATS_TOKEN} extra`]) {
  const response = await get(authorization);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("www-authenticate"), "Bearer");
}
assert.equal((await get(null, `?token=${env.PAYMENTS_STATS_TOKEN}`)).status, 401, "URL tokens are rejected");
assert.equal(calls.length, 0, "Unauthorized requests never read the database or users");
const token = env.PAYMENTS_STATS_TOKEN;
delete env.PAYMENTS_STATS_TOKEN;
assert.equal((await get()).status, 503);
assert.equal(calls.length, 0, "Missing server configuration fails closed");
env.PAYMENTS_STATS_TOKEN = token;

let response = await get();
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { value: 7 });
let query = calls.at(-1).url.searchParams;
assert.deepEqual(query.getAll("paid_at"), ["gte.2026-11-07T22:00:00.000Z", "lte.2026-11-08T10:00:00.000Z"]);
assert.equal(query.get("status"), "in.(paid,partially_refunded,refund_pending,refunded,chargeback)");
assert.equal(query.get("or"), `(user_id.is.null,user_id.not.in.(${adminId}))`, "Deleted buyers remain included");

count = 0;
assert.deepEqual(await (await get()).json(), { value: 0 }, "Fresh reads reflect zero payments");
users = Array.from({ length: 1000 }, (_, i) => ({ id: `buyer-${i}`, user_metadata: { catdai_is_admin: true } }));
users.push({ id: adminId, app_metadata: { catdai_is_admin: true } });
const beforePaging = calls.length;
await get();
assert.equal(calls.length - beforePaging, 3, "Every buyer page is loaded before counting");
assert.equal(calls.at(-1).url.searchParams.get("or"), `(user_id.is.null,user_id.not.in.(${adminId}))`);
users = [{ id: "buyer", user_metadata: { catdai_is_admin: true } }];
await get();
assert.equal(calls.at(-1).url.searchParams.get("or"), null, "User-editable metadata does not exclude buyers");

for (const [date, start] of [
  ["2026-11-08T21:59:59Z", "2026-11-07T22:00:00.000Z"],
  ["2026-11-08T22:00:00Z", "2026-11-08T22:00:00.000Z"],
  ["2026-03-29T12:00:00Z", "2026-03-28T22:00:00.000Z"],
  ["2026-10-25T12:00:00Z", "2026-10-24T21:00:00.000Z"],
]) {
  now = Date.parse(date);
  await get();
  query = calls.at(-1).url.searchParams;
  assert.equal(query.getAll("paid_at")[0], `gte.${start}`, `Chișinău day boundary for ${date}`);
}

failUsers = true;
const beforeFailure = calls.length;
response = await get();
assert.equal(response.status, 503);
assert.equal(calls.length - beforeFailure, 1, "Buyer lookup failures prevent partial counts");
failUsers = false;
for (const failure of ["error", "throw", "missing-count"]) {
  failCount = failure === "error";
  throwCount = failure === "throw";
  count = failure === "missing-count" ? null : 7;
  response = await get();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Payment statistics are unavailable" }, "Private errors are not exposed");
}
console.log("Payment counter checks passed.");
