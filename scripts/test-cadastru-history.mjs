// pnpm exec node --experimental-vm-modules scripts/test-cadastru-history.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import * as paidHistory from "../src/lib/cadastru-paid-history.js";

let userId = "owner";
let failedTable = null;
const queriedTables = [];
const date = (day) => `2026-10-${String(day).padStart(2, "0")}T12:00:00.000Z`;
const tables = {
  estimate_log: [28, 27, 26].map((day) => ({ id: `estimate-${day}`, user_id: "owner", created_at: date(day) })),
  cadastru_search_events: [
    { id: "duplicate", user_id: "owner", lookup_id: "paid-lookup", created_at: date(24) },
    ...[23, 22, 21].map((day) => ({ id: day, user_id: "owner", search_type: "number", cadastral_number: `0100201.${day}`, result_type: "full_data", created_at: date(day) })),
    { id: "other-user", user_id: "other", created_at: date(28) },
  ],
  user_feature_usage_events: [
    ...[28, 27, 26].map((day) => ({ id: `paid-estimate-${day}`, user_id: "owner", source: "paid_credit", feature_key: "sale_estimate", metadata: {}, created_at: date(day) })),
    { id: "paid", user_id: "owner", source: "paid_credit", feature_key: "cadastru_lookup", created_at: date(24), metadata: { cadastral_number: "0100201.024", lookup_id: "paid-lookup", search_type: "number", result_value: "Chișinău, str. Test 24" } },
  ],
};
const supabaseAdmin = {
  from(table) {
    queriedTables.push(table);
    const filters = [];
    let count = Infinity;
    const query = {
      select() { return query; },
      eq(key, value) { filters.push((row) => row[key] === value); return query; },
      is(key, value) { filters.push((row) => (row[key] ?? null) === value); return query; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
      lt(key, value) { filters.push((row) => row[key] < value); return query; },
      order() { return query; },
      limit(value) { count = value; return query; },
      then(resolve) {
        return Promise.resolve(resolve(table === failedTable
          ? { data: null, error: { message: "Storage unavailable" } }
          : { data: tables[table].filter((row) => filters.every((filter) => filter(row))).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, count), error: null }));
      },
    };
    return query;
  },
};
const context = vm.createContext({ console: { error() {} }, URL, Buffer, Date });
const mocks = {
  "@/lib/supabase-admin": { supabaseAdmin },
  "@/lib/access-tier": { resolveAccessTier: async () => ({ user_id: userId }) },
  "@/lib/cadastru-paid-history": paidHistory,
  "@/lib/evaluation-snapshots": {
    PAID_EVALUATION_FEATURE_KEYS: ["sale_estimate", "rent_estimate"],
    normalizePaidEvaluationSnapshot: (row) => row.feature_key === "sale_estimate"
      ? { result: { input: {}, estimate: {} }, createdAt: row.created_at, estimateType: "sale" } : null,
  },
  "next/server": { NextResponse: { json: Response.json } },
};
const route = new vm.SourceTextModule(await fs.readFile("src/app/api/profile/history/route.js", "utf8"), { context });
await route.link((name) => new vm.SyntheticModule(Object.keys(mocks[name]), function () {
  for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
}, { context }));
await route.evaluate();
const get = (params = "") => route.namespace.GET(new Request(`https://catdai.test/api/profile/history?${params}`));

const first = await (await get("type=cadastru&limit=2")).json();
assert.deepEqual(first.history.map((row) => row.id), ["paid-cadastru-paid", "cadastru-23"]);
assert(first.nextCursor);
assert(first.history.every((row) => row.type === "cadastru"));
assert(!queriedTables.includes("estimate_log"), "Cadastru history skips valuation queries");
const second = await (await get(`type=cadastru&limit=2&cursor=${first.nextCursor}`)).json();
assert.deepEqual(second.history.map((row) => row.id), ["cadastru-22", "cadastru-21"]);
assert.equal(second.nextCursor, null);
const mixed = await (await get()).json();
assert(mixed.history.some((row) => row.type === "estimate"), "Default profile history remains mixed");
assert.equal((await get("type=cadastru&cursor=invalid")).status, 400);
userId = "other";
assert.deepEqual((await (await get("type=cadastru")).json()).history.map((row) => row.id), ["cadastru-other-user"]);
userId = null;
queriedTables.length = 0;
assert.deepEqual((await (await get("type=cadastru")).json()).history, []);
assert.equal(queriedTables.length, 0, "Unauthenticated reads query no history");
userId = "owner";
failedTable = "cadastru_search_events";
assert.equal((await get("type=cadastru")).status, 503, "Storage errors can be retried");
console.log("Cadastru history: filtering before pagination, paid deduplication, mixed profile feed, owner isolation and retry errors passed.");
