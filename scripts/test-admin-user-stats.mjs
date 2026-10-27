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
let missingStats = false;
let failingUserPage = null;
let users = [
  { id: "returning", created_at: "2026-09-01T12:00:00Z" },
  { id: "new", created_at: "2026-10-17T21:00:00Z" },
  { id: "yesterday", created_at: "2026-10-17T20:59:59Z" },
  { id: "never-visited", created_at: "2026-08-01T12:00:00Z" },
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
      async rpc(name, args) {
        if (name === "admin_external_api_usage_since") return { data: [], error: null };
        assert.equal(name, "admin_active_user_stats");
        activityQueries.push(args);
        const today = args.p_since === "2026-10-17T21:00:00.000Z";
        return { data: missingStats ? [] : [{
          active_users: today ? 5 : 6,
          new_registered_users: today ? 1 : args.p_since ? 2 : 4,
          old_registered_users: today ? 1 : args.p_since ? 1 : 0,
        }], error: activityError };
      },
      from(table) {
        const query = { filters: [] };
        const builder = {
          select(columns, options) { Object.assign(query, { columns, options }); return builder; },
          gte(column, value) { query.filters.push([column, value]); return builder; },
          is() { return builder; },
          in() { return builder; },
          eq() { return builder; },
          order() { return builder; },
          range() { return builder; },
          then(resolve, reject) {
            const result = { data: [], count: 0, error: null };
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
assert.equal(response.activeUsers, 5, "Total includes anonymous visitors and registered users");
assert.equal(response.newUsers, 1, "New registrations use local midnight");
assert.equal(response.oldUsers, 1, "Returning registered users are shown separately");
assert.equal(response.totalUsers, 4, "Total users includes every registration");
assert.deepEqual(JSON.parse(JSON.stringify(activityQueries.at(-1))), {
  p_since: "2026-10-17T21:00:00.000Z",
}, "Aggregate every visitor with the selected local-midnight cutoff");
for (const period of ["week", "month", "all"]) {
  response = await (await get(`period=${period}&fresh=1`)).json();
  assert.equal(response.activeUsers, 6);
  assert.equal(response.newUsers, period === "all" ? 4 : 2);
  assert.equal(response.oldUsers, period === "all" ? 0 : 1);
  assert.equal(response.totalUsers, 4);
}
activityError = { message: "Activity read failed" };
assert.equal((await (await get()).json()).activeUsers, null, "Read failure cannot appear as zero");
assert.equal((await (await get()).json()).newUsers, null);
assert.equal((await (await get()).json()).oldUsers, null);
activityError = null;
assert.equal((await (await get()).json()).activeUsers, 5, "Hard refresh recovers after a failure");
missingStats = true;
assert.equal((await (await get()).json()).activeUsers, null, "Missing aggregation cannot appear as zero");
missingStats = false;
users = Array.from({ length: 1001 }, (_, index) => ({ id: String(index), created_at: "2026-10-18T09:00:00Z" }));
response = await (await get()).json();
assert.equal(response.totalUsers, 1001);
assert.equal(response.newUsers, 1, "The breakdown comes from eligible active accounts, not every auth account");
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
