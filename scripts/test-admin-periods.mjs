// Isolated calendar and estimation-query checks; no network or live writes.
// pnpm exec node --experimental-vm-modules scripts/test-admin-periods.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

let now = Date.parse("2026-11-02T10:00:00Z");
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const context = vm.createContext({ Date: FixedDate, URLSearchParams, console });
const periods = new vm.SourceTextModule(await fs.readFile("src/lib/admin-periods.js", "utf8"), { context });
await periods.link(() => { throw new Error("Unexpected dependency"); });
await periods.evaluate();
const { adminPeriod, ADMIN_PERIOD_OPTIONS } = periods.namespace;
assert.deepEqual(Array.from(ADMIN_PERIOD_OPTIONS, ({ label }) => label), ["1 day", "7 days", "This month", "Previous month", "All time"]);
for (const [date, period, since, until = null] of [
  ["2026-11-02T10:00:00Z", "month", "2026-10-31T22:00:00.000Z"],
  ["2026-11-02T10:00:00Z", "previous_month", "2026-09-30T21:00:00.000Z", "2026-10-31T22:00:00.000Z"],
  ["2026-04-10T10:00:00Z", "previous_month", "2026-02-28T22:00:00.000Z", "2026-03-31T21:00:00.000Z"],
  ["2026-01-01T00:00:00Z", "previous_month", "2025-11-30T22:00:00.000Z", "2025-12-31T22:00:00.000Z"],
  ["2028-03-01T00:00:00Z", "previous_month", "2028-01-31T22:00:00.000Z", "2028-02-29T22:00:00.000Z"],
  ["2026-10-31T22:00:00Z", "month", "2026-10-31T22:00:00.000Z"],
  ["2026-11-02T10:00:00Z", "week", "2026-10-26T10:00:00.000Z"],
  ["2026-03-29T10:00:00Z", "day", "2026-03-28T22:00:00.000Z"],
  ["2026-10-25T10:00:00Z", "day", "2026-10-24T21:00:00.000Z"],
  ["2026-11-02T10:00:00Z", "__proto__", null],
]) {
  const result = adminPeriod(period, new Date(date));
  assert.equal(result.since, since, `${period} at ${date}`);
  assert.equal(result.until, until);
}

let legacy = false;
const queries = [];
const mocks = {
  "@/lib/admin-periods": periods.namespace,
  "@/lib/admin-auth": { requireAdminApiAuth: () => null },
  "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
  "@/lib/supabase-admin": { supabaseAdmin: {
    auth: { admin: { listUsers: async () => ({ data: { users: [] } }) } },
    from(table) {
      const query = { table, filters: [] };
      queries.push(query);
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        eq() { return builder; }, neq() { return builder; }, order() { return builder; }, limit() { return builder; },
        gte(column, value) { query.filters.push(["gte", column, value]); return builder; },
        lt(column, value) { query.filters.push(["lt", column, value]); return builder; },
        then(resolve, reject) {
          const result = legacy && table === "estimate_log" && query.columns.includes("estimate_type")
            ? { error: { code: "42703", message: "estimate_type missing" } } : { data: [], error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  } },
};
const route = new vm.SourceTextModule(await fs.readFile("src/app/api/admin/estimations/route.js", "utf8"), { context });
await route.link((id) => {
  assert.ok(mocks[id], `Unexpected import ${id}`);
  return new vm.SyntheticModule(Object.keys(mocks[id]), function () {
    for (const [key, value] of Object.entries(mocks[id])) this.setExport(key, value);
  }, { context });
});
await route.evaluate();
const get = (period) => route.namespace.GET({ nextUrl: new URL(`https://catdai.test/api/admin/estimations?period=${period}`) });
assert.equal((await get("previous_month")).status, 200);
assert.deepEqual(queries.find(({ table }) => table === "estimate_log").filters, [
  ["gte", "created_at", "2026-09-30T21:00:00.000Z"],
  ["lt", "created_at", "2026-10-31T22:00:00.000Z"],
]);
now = Date.parse("2026-11-30T21:59:30Z");
await get("month");
now += 60000;
const before = queries.length;
legacy = true;
assert.equal((await get("month")).status, 200);
const reads = queries.slice(before).filter(({ table }) => table === "estimate_log");
assert.equal(reads.length, 2, "Cache rolls over at midnight and legacy schema retries");
for (const read of reads) assert.deepEqual(read.filters, [["gte", "created_at", "2026-11-30T22:00:00.000Z"]]);
console.log("Admin calendar periods passed: month/year/leap/DST boundaries, estimation bounds, legacy schema and cache rollover.");
