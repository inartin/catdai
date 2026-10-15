// Isolated route checks; no network or live database writes.
// pnpm exec node --experimental-vm-modules scripts/test-admin-user-cadastru-searches.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const userId = "11111111-1111-4111-8111-111111111111";
let authorized = true;
let databaseError = null;
let rows = [];
const queries = [];
const json = (data, { status = 200 } = {}) => Response.json(data, { status });
const mocks = {
  "next/server": { NextResponse: { json } },
  "@/lib/admin-auth": {
    requireAdminApiAuth: () => authorized ? null : json({ error: "Unauthorized" }, { status: 401 }),
  },
  "@/lib/supabase-admin": {
    supabaseAdmin: {
      from(table) {
        const query = { table, orders: [] };
        queries.push(query);
        const builder = {
          select(columns) { query.columns = columns; return builder; },
          eq(column, value) { query.filter = [column, value]; return builder; },
          order(column, options) { query.orders.push([column, options.ascending]); return builder; },
          range(from, to) { query.range = [from, to]; return { data: rows, error: databaseError }; },
        };
        return builder;
      },
    },
  },
};
const context = vm.createContext({ console: { error() {} } });
const route = new vm.SourceTextModule(await fs.readFile("src/app/api/admin/cadastru-searches/route.js", "utf8"), { context });
await route.link((id) => {
  const mock = mocks[id];
  assert.ok(mock, `Unexpected import: ${id}`);
  return new vm.SyntheticModule(Object.keys(mock), function () {
    for (const [key, value] of Object.entries(mock)) this.setExport(key, value);
  }, { context });
});
await route.evaluate();
const get = (params) => route.namespace.GET({ nextUrl: new URL(`https://catdai.md/api/admin/cadastru-searches?${params}`) });

authorized = false;
assert.equal((await get(`userId=${userId}`)).status, 401);
assert.equal(queries.length, 0, "Unauthorized reads never query user data");
authorized = true;
for (const params of ["", "userId=bad", `userId=${userId}&offset=-1`, `userId=${userId}&offset=1.5`, `userId=${userId}&offset=`, `userId=${userId}&offset=9007199254740991`]) {
  assert.equal((await get(params)).status, 400, params);
}
assert.equal(queries.length, 0, "Invalid input never queries the database");

assert.deepEqual(await (await get(`userId=${userId}`)).json(), { searches: [], hasMore: false });
assert.equal(queries[0].table, "cadastru_search_events");
assert.deepEqual(queries[0].filter, ["user_id", userId], "Filter directly by the requested user's id");
assert.deepEqual(queries[0].range, [0, 50], "Fetch one lookahead row without reading all users' searches");
assert.deepEqual(queries[0].orders, [["created_at", false], ["id", false]], "Stable newest-first ordering");
assert.ok(queries[0].columns.includes("search_address"));
assert.ok(queries[0].columns.includes("valuation_completed_at"));
assert.ok(!queries[0].columns.includes("search_request"), "Only table display fields are returned");

rows = Array.from({ length: 51 }, (_, index) => ({ id: 100 - index, user_id: userId }));
const firstPage = await (await get(`userId=${userId}`)).json();
assert.equal(firstPage.searches.length, 50);
assert.equal(firstPage.hasMore, true);
assert.equal(firstPage.searches.at(-1).id, 51);
rows = [{ id: 50, user_id: userId }];
assert.deepEqual(await (await get(`userId=${userId}&offset=50`)).json(), { searches: rows, hasMore: false });
assert.deepEqual(queries.at(-1).range, [50, 100]);
assert.deepEqual(queries.at(-1).filter, ["user_id", userId], "Later pages retain the user filter");

databaseError = { message: "Database unavailable" };
assert.equal((await get(`userId=${userId}`)).status, 500, "A failed query is not reported as an empty history");
console.log("Admin user Cadastru search checks passed.");
