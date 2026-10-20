// Isolated route checks; no network or live database writes.
// pnpm exec node --experimental-vm-modules scripts/test-admin-user-cadastru-searches.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const userId = "11111111-1111-4111-8111-111111111111";
let authorized = true;
let databaseError = null;
let rows = [];
let favorites = [];
let favoritesError = null;
let shareStatsError = null;
let shareStats = [];
const queries = [];
const json = (data, { status = 200 } = {}) => Response.json(data, { status });
const mocks = {
  "next/server": { NextResponse: { json } },
  "@/lib/admin-auth": {
    requireAdminApiAuth: () => authorized ? null : json({ error: "Unauthorized" }, { status: 401 }),
  },
  "@/lib/supabase-admin": {
    supabaseAdmin: {
      async rpc(name, args) {
        assert.equal(name, "cadastru_share_statistics");
        assert.deepEqual(Array.from(args.p_search_ids), rows.slice(0, 50).map((row) => row.id));
        return { data: shareStats, error: shareStatsError };
      },
      from(table) {
        const query = { table, orders: [] };
        queries.push(query);
        const builder = {
          select(columns) { query.columns = columns; return builder; },
          eq(column, value) { query.filter = [column, value]; return builder; },
          in(column, value) { query.filter = [column, Array.from(value)]; return builder; },
          is(column, value) { assert.equal(column, "duplicate_of"); assert.equal(value, null); return builder; },
          order(column, options) { query.orders.push([column, options.ascending]); return builder; },
          range(from, to) {
            query.range = [from, to];
            return table === "user_favorites"
              ? { data: favorites.slice(from, to + 1), error: favoritesError }
              : { data: rows, error: databaseError };
          },
        };
        return builder;
      },
    },
  },
  "@/lib/cadastru-evaluation-tracking": { readCadastruEvaluationToken: () => null },
};
const context = vm.createContext({ console: { error() {} }, URL });
const modules = new Map();
async function load(file) {
  if (modules.has(file)) return modules.get(file);
  const loadedModule = new vm.SourceTextModule(await fs.readFile(file, "utf8"), { context });
  modules.set(file, loadedModule);
  await loadedModule.link((id) => {
    const mock = mocks[id];
    if (mock) return new vm.SyntheticModule(Object.keys(mock), function () {
      for (const [key, value] of Object.entries(mock)) this.setExport(key, value);
    }, { context });
    assert.ok(id.startsWith("@/lib/"), `Unexpected import: ${id}`);
    return load(`src/lib/${id.slice(6)}.js`);
  });
  await loadedModule.evaluate();
  return loadedModule;
}
const route = await load("src/app/api/admin/cadastru-searches/route.js");
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
assert.deepEqual(await (await get(`userId=${userId}&offset=50`)).json(), { searches: [{ ...rows[0], favorited: false, share_count: 0, unique_viewers: 0 }], hasMore: false });
const searchQuery = queries.findLast((query) => query.table === "cadastru_search_events");
assert.deepEqual(searchQuery.range, [50, 100]);
assert.deepEqual(searchQuery.filter, ["user_id", userId], "Later pages retain the user filter");

const number = "0100106.131.01.059";
rows = [
  { id: 1, user_id: userId, search_type: "number", cadastral_number: number },
  { id: 2, user_id: userId, search_type: "address", search_address: "Chișinău, bd Decebal 63 ap 59" },
  { id: 3, user_id: userId, search_type: "address", search_address: "Chișinău, bd Decebal 63 ap 60" },
  { id: 4, user_id: userId, search_type: "address", cadastral_number: number },
  { id: 5, user_id: userId, search_type: "number", cadastral_number: "5520202.182" },
];
favorites = [
  { id: 1, user_id: userId, url_path: `/ru/cadastru/rezultat?lang=ru&cadastral_number=${number}` },
  { id: 2, user_id: userId, url_path: "/ro/cadastru/rezultat?street=Decebal&house_number=63&source=address&city=Chisinau&road_type=bulevard&apartment_number=59" },
  { id: 3, user_id: "another-user", url_path: "/ro/cadastru/rezultat?cadastral_number=5520202.182" },
  { id: 4, user_id: userId, url_path: "/ro/evaluare?cadastral_number=5520202.182" },
  { id: 5, user_id: userId, url_path: "http://[invalid" },
];
const result = await (await get(`userId=${userId}`)).json();
shareStats = [{ search_event_id: 1, share_count: 4, unique_viewers: 2 }];
const sharedRows = (await (await get(`userId=${userId}`)).json()).searches;
assert.equal(sharedRows[0].share_count, 4);
assert.equal(sharedRows[0].unique_viewers, 2);
assert.equal(sharedRows[1].share_count, 0, "A repeated search has its own statistics");
shareStatsError = { message: "Share statistics unavailable" };
assert.equal((await get(`userId=${userId}`)).status, 500, "Failed statistics reads cannot show zero viewers");
shareStatsError = null;
assert.deepEqual(result.searches.map((row) => row.favorited), [true, true, false, true, false],
  "Match localized number/address bookmarks, retaining apartment, user and result type boundaries");
assert.deepEqual(queries.at(-1).filter, ["user_id", [userId]], "Only load bookmarks for the displayed users");
favorites = [];
assert.ok((await (await get(`userId=${userId}`)).json()).searches.every((row) => !row.favorited), "Removed bookmarks no longer match");
favorites = Array.from({ length: 1000 }, (_, id) => ({ id, user_id: userId, url_path: "/ro/evaluare?rooms=2" }));
favorites.push({ id: 1001, user_id: userId, url_path: `/ro/cadastru/rezultat?cadastral_number=${number}` });
assert.equal((await (await get(`userId=${userId}`)).json()).searches[0].favorited, true, "Bookmarks beyond the database row limit still match");
favoritesError = { message: "Favorites unavailable" };
assert.equal((await get(`userId=${userId}`)).status, 500, "Failed bookmark reads never report false No values");
favoritesError = null;

const { attachCadastruFavorites } = (await load("src/lib/admin-cadastru-favorites.js")).namespace;
assert.equal(attachCadastruFavorites([{ ...rows[0], user_id: null }], favorites)[0].favorited, false, "Anonymous searches cannot borrow registered bookmarks");

databaseError = { message: "Database unavailable" };
assert.equal((await get(`userId=${userId}`)).status, 500, "A failed query is not reported as an empty history");
console.log("Admin user Cadastru search checks passed.");
