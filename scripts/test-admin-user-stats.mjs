// Isolated dashboard checks; no network or live database writes.
// pnpm exec node --experimental-vm-modules scripts/test-admin-user-stats.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

let now = Date.parse("2026-10-18T10:00:00Z");
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
let authorized = true;
let activityError = null;
let failingUserPage = null;
let users = [
  { id: "returning", created_at: "2026-09-01T12:00:00Z" },
  { id: "new", created_at: "2026-10-17T21:00:00Z" },
  { id: "yesterday", created_at: "2026-10-17T20:59:59Z" },
  { id: "never-visited", created_at: "2026-08-01T12:00:00Z" },
];
const activity = [
  { user_id: "returning", last_seen_at: "2026-10-18T09:00:00Z" },
  { user_id: "new", last_seen_at: "2026-10-17T21:00:00Z" },
  { user_id: "yesterday", last_seen_at: "2026-10-17T20:59:59Z" },
];
const activityQueries = [];
const json = (data, { status = 200 } = {}) => Response.json(data, { status });
const mocks = {
  "next/server": { NextResponse: { json } },
  "@/lib/admin-auth": { requireAdminApiAuth: () => authorized ? null : json({ error: "Unauthorized" }, { status: 401 }) },
  "@/lib/admin-cadastru-favorites": { loadCadastruFavorites: async (rows) => rows },
  "@/lib/cadastru-share-statistics": { loadCadastruShareStatistics: async (rows) => rows },
  "@/lib/supabase-admin": {
    supabaseAdmin: {
      auth: { admin: { listUsers: async ({ page, perPage }) => page === failingUserPage
        ? { data: null, error: { message: "User read failed" } }
        : { data: { users: users.slice((page - 1) * perPage, page * perPage) } } } },
      from(table) {
        const query = { filters: [] };
        if (table === "user_activity") activityQueries.push(query);
        const builder = {
          select(columns, options) { Object.assign(query, { columns, options }); return builder; },
          gte(column, value) { query.filters.push([column, value]); return builder; },
          in() { return builder; },
          eq() { return builder; },
          order() { return builder; },
          range() { return builder; },
          then(resolve, reject) {
            let result = { data: [], count: 0, error: null };
            if (table === "user_activity") {
              const matches = activity.filter((row) => query.filters.every(([column, since]) => Date.parse(row[column]) >= Date.parse(since)));
              result = { data: null, count: activityError ? null : matches.length, error: activityError };
            }
            return Promise.resolve(result).then(resolve, reject);
          },
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
const get = (params = "period=day&fresh=1") => route.namespace.GET({ nextUrl: new URL(`https://catdai.md/api/admin/stats?${params}`) });

authorized = false;
assert.equal((await get()).status, 401);
assert.equal(activityQueries.length, 0);
authorized = true;
let response = await (await get()).json();
assert.equal(response.activeUsers, 2, "Return visits and the local midnight boundary count, yesterday and missing visits do not");
assert.equal(response.newUsers, 1, "New registrations use local midnight");
assert.equal(response.totalUsers, 4, "Total users includes every registration");
assert.deepEqual(JSON.parse(JSON.stringify(activityQueries.at(-1))), {
  columns: "*", options: { count: "exact", head: true },
  filters: [["last_seen_at", "2026-10-17T21:00:00.000Z"]],
}, "Count existing activity rows without loading visits or adding tracking");
for (const period of ["week", "month", "all"]) {
  response = await (await get(`period=${period}&fresh=1`)).json();
  assert.equal(response.activeUsers, 3);
  assert.equal(response.newUsers, period === "all" ? 4 : 2);
  assert.equal(response.totalUsers, 4);
}
activityError = { message: "Activity read failed" };
assert.equal((await (await get()).json()).activeUsers, null, "Read failure cannot appear as zero");
activityError = null;
assert.equal((await (await get()).json()).activeUsers, 2, "Hard refresh recovers after a failure");
users = Array.from({ length: 1001 }, (_, index) => ({ id: String(index), created_at: "2026-10-18T09:00:00Z" }));
response = await (await get()).json();
assert.equal(response.totalUsers, 1001);
assert.equal(response.newUsers, 1001);
failingUserPage = 2;
assert.equal((await get()).status, 500, "A failed user page cannot return partial registration totals");
failingUserPage = null;
for (const [date, midnight] of [
  ["2026-03-29T10:00:00Z", "2026-03-28T22:00:00.000Z"],
  ["2026-10-25T10:00:00Z", "2026-10-24T21:00:00.000Z"],
]) {
  now = Date.parse(date);
  assert.equal((await (await get()).json()).periodSince, midnight, "Today remains correct on DST transition dates");
}
now = Date.parse("2026-10-18T20:59:59Z");
await get("period=day");
now += 2000;
assert.equal((await (await get("period=day")).json()).periodSince, "2026-10-18T21:00:00.000Z", "Cached Today counts reset across local midnight");
console.log("Admin user stats checks passed.");
