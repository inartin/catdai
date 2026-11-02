// Isolated suggestion correlation/query checks; no network or database writes.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const lookup = "11111111-1111-4111-8111-111111111111";
const retry = "22222222-2222-4222-8222-222222222222";
const visitor = { device_id: "browser-one" };
const searches = [
  { id: 1, lookup_id: lookup, visitor, result_type: "no_data" },
  { id: 2, lookup_id: retry, visitor, result_type: "full_data" },
];
const activity = { clicked_at: "2026-11-02T08:23:00Z", retry_lookup_id: retry,
  resolved_address: "Bălți, str Tudor Vladimirescu 6 ap 16" };
let rows = [{ id: 10, visitor, service: "cadastru_address",
  response_headers: { "x-catdai-lookup-id": lookup }, suggestion_recovery: activity }];
let error = null;
const queries = [];
const context = vm.createContext({ console });
const source = await fs.readFile("src/lib/admin-cadastru-suggestion-activity.js", "utf8");
const mod = new vm.SourceTextModule(source, { context });
await mod.link(() => new vm.SyntheticModule(["supabaseAdmin"], function () {
  this.setExport("supabaseAdmin", { from(table) {
    assert.equal(table, "external_api_usage_events");
    const query = {};
    queries.push(query);
    const builder = {
      select(columns) { query.columns = columns; return builder; },
      eq(field, value) { assert.equal(field, "service"); assert.equal(value, "cadastru_address"); return builder; },
      not(field, op, value) { assert.equal(field, "suggestion_recovery"); assert.equal(op, "is"); assert.equal(value, null); return builder; },
      in(field, ids) { query.field = field; query.ids = Array.from(ids); return builder; },
      order(field) { assert.equal(field, "id"); return builder; },
      range(start, end) {
        query.range = [start, end];
        const selected = rows.filter(row => query.ids.includes(query.field.startsWith("response_headers")
          ? row.response_headers["x-catdai-lookup-id"] : row.suggestion_recovery.retry_lookup_id));
        return { data: selected.slice(start, end + 1), error };
      },
    };
    return builder;
  } });
}, { context }));
await mod.evaluate();
const { attachCadastruSuggestionActivity: attach, loadCadastruSuggestionActivity: load } = mod.namespace;
let result = await load(searches);
assert.equal(result[0].suggestion_activity.role, "original");
assert.equal(result[1].suggestion_activity.role, "retry");
assert.equal(result[0].suggestion_activity.recovered_at, undefined, "a selected suggestion is not recovery");
assert.equal(result[0].result_type, "no_data", "original search totals remain unchanged");
assert.equal(queries.length, 2);
assert(!queries.some(q => q.columns.includes("request_payload")), "summary reads do not download payloads");
rows[0].suggestion_recovery = { ...activity, recovered_at: "2026-11-02T08:23:01Z", lookup_source: "cache" };
result = await load(searches);
assert(result.every(row => row.suggestion_activity.recovered_at));
assert.equal(result[1].suggestion_activity.lookup_source, "cache");
assert.equal(attach([{ ...searches[0], visitor: { device_id: "other-browser" } }], rows)[0].suggestion_activity, undefined);
assert.equal(attach([{ ...searches[0], user_id: "user-b" }], [{ ...rows[0], user_id: "user-a" }])[0].suggestion_activity, undefined);
assert.equal(attach([{ ...searches[0], lookup_id: "another-search" }], rows)[0].suggestion_activity, undefined);
assert.equal(attach([{ ...searches[0], lookup_id: null }], rows)[0].suggestion_activity, undefined, "legacy addresses are never guessed");
const oldRows = rows;
rows = Array.from({ length: 205 }, (_, id) => ({ ...oldRows[0], id, suggestion_recovery: { ...activity,
  ...(id === 204 ? { recovered_at: "2026-11-02T08:24:00Z" } : {}) } }));
result = await load(searches);
assert(result[0].suggestion_activity.recovered_at, "all pages contribute to recovery");
assert(queries.some(q => q.range[0] === 200));
error = { code: "503", message: "offline" };
await assert.rejects(load(searches), /offline/, "read failures do not claim no click");
error = { code: "42703", message: "suggestion_recovery does not exist" };
assert.equal((await load(searches))[0].suggestion_activity, undefined, "old schemas remain readable");
console.log("Suggestion activity passed: selection vs recovery, original/retry links, cache, identity, pagination and read failures.");
