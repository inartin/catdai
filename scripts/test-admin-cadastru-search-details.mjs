// Isolated matching, route and UI checks; no network, servers or database writes.
// pnpm exec node --experimental-vm-modules scripts/test-admin-cadastru-search-details.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const userId = "11111111-1111-4111-8111-111111111111";
const lookupId = "22222222-2222-4222-8222-222222222222";
const search = { id: 10, search_type: "address", user_id: userId,
  search_address: "Chișinău, bd Decebal 63 ap 59", created_at: "2026-10-16T10:00:05Z",
  search_request: { city: "Chișinău", road_type: "bulevard", street: "Decebal", house_number: "63", apartment_number: "59" },
  result_type: "full_data", result_value: "0100106.131.01.059", lookup_source: "api" };
const eventKey = (row, id = lookupId) => crypto.createHash("sha256").update(JSON.stringify([
  id, row.user_id || null, row.search_type, row.search_address || row.cadastral_number,
])).digest("hex");
const main = { id: 20, service: "cadastru_address", status: "success", user_id: userId,
  request_payload: search.search_request, response_payload: { ok: true, data: { address: "Decebal 63" } },
  response_headers: { "x-catdai-lookup-id": lookupId }, created_at: "2026-10-16T10:00:00Z", duration_ms: 5000 };
const secondary = { ...main, id: 21, service: "cadastru_nearby", endpoint: "/v1/public-transport",
  request_payload: { address: "Decebal 63" }, created_at: "2026-10-16T10:00:10Z" };

const context = vm.createContext({ console: { error() {} }, Date });
const cache = new Map();
const mocks = { "node:crypto": { default: crypto } };
async function load(file, extra = "") {
  if (cache.has(file)) return cache.get(file);
  const loadedModule = new vm.SourceTextModule(await fs.readFile(file, "utf8") + extra, { context });
  cache.set(file, loadedModule);
  await loadedModule.link(async (name) => {
    if (mocks[name]) return new vm.SyntheticModule(Object.keys(mocks[name]), function () {
      for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
    }, { context });
    assert.ok(name.startsWith("@/lib/"), name);
    return load(`src/lib/${name.slice(6)}.js`);
  });
  await loadedModule.evaluate();
  return loadedModule;
}
const { findCadastruSearchApiGroup: match } = (await load("src/lib/admin-cadastru-search-details.js")).namespace;
const keyed = { ...search, event_key: eventKey(search) };
const other = { ...main, id: 22, response_headers: { "x-catdai-lookup-id": crypto.randomUUID() } };
assert.equal(match(keyed, [main, secondary, other]).events.length, 2);
assert.equal(match(keyed, [secondary]).match, "lookup_id", "A cached primary can still link secondary calls");
assert.equal(match(keyed, [other]), null, "Keyed searches never borrow same-address calls from another search");
assert.equal(match(keyed, [{ ...main, user_id: "another-user" }]), null);
assert.equal(match({ ...keyed, user_id: null, event_key: eventKey({ ...search, user_id: null }) }, [main]), null,
  "Anonymous searches exclude known registered users' calls");

const legacy = { ...main, response_headers: {} };
assert.equal(match(search, [legacy], [search]).match, "inferred");
assert.equal(match({ ...search, search_request: null }, [legacy], [search]).match, "inferred", "Original full address works without structured fields");
assert.equal(match(search, [{ ...legacy, request_payload: { ...search.search_request, apartment_number: "60" } }]), null);
assert.equal(match(search, [{ ...legacy, request_payload: { ...search.search_request, apartment_number: undefined } }]), null,
  "Building searches cannot stand in for apartment searches");
assert.equal(match(search, [legacy, { ...legacy, id: 30 }]), null, "Repeated primaries remain ambiguous");
assert.equal(match(search, [legacy], [search, { ...search, id: 11 }]), null, "Repeated searches remain ambiguous");
assert.equal(match(search, [{ ...legacy, user_id: null }], [search, { ...search, id: 11, user_id: "another-user" }]), null,
  "Unattributed worker logs cannot choose between different users' identical searches");
assert.equal(match(search, [{ ...legacy, created_at: "2026-10-16T09:59:00Z" }]), null);
assert.equal(match({ ...search, search_address: null, search_request: null }, [legacy]), null);
const numberSearch = { ...search, search_type: "number", cadastral_number: "0100106.131.01.059", search_address: null };
assert.equal(match(numberSearch, [{ ...legacy, service: "cadastru_number", request_payload: { cadastral_number: numberSearch.cadastral_number } }]).match, "inferred");

let authorized = true;
let savedSearch = keyed;
let storedEvents = [main, secondary, other];
let queryError = null;
const queries = [];
const json = (data, { status = 200 } = {}) => Response.json(data, { status });
mocks["next/server"] = { NextResponse: { json } };
mocks["@/lib/admin-auth"] = { requireAdminApiAuth: () => authorized ? null : json({ error: "Unauthorized" }, { status: 401 }) };
mocks["@/lib/supabase-admin"] = { supabaseAdmin: {
  from(table) {
    const query = { table, filters: [], orders: [] };
    queries.push(query);
    const builder = {
      select(columns) { query.columns = columns; return builder; },
      eq(column, value) { query.filters.push(["eq", column, value]); return builder; },
      in(column, value) { query.filters.push(["in", column, value]); return builder; },
      gte(column, value) { query.filters.push(["gte", column, value]); return builder; },
      lte(column, value) { query.filters.push(["lte", column, value]); return builder; },
      order(column, value) { query.orders.push([column, value.ascending]); return builder; },
      maybeSingle() { return { data: savedSearch, error: queryError }; },
      range(from, to) {
        query.range = [from, to];
        const rows = table === "cadastru_search_events" ? [savedSearch] : storedEvents;
        const filtered = rows.filter((row) => query.filters.every(([op, column, value]) => {
          const actual = column.startsWith("response_headers->>") ? row.response_headers?.[column.slice(19)] : row[column];
          return op === "eq" ? actual === value : op === "in" ? value.includes(actual)
            : op === "gte" ? actual >= value : actual <= value;
        }));
        return { data: filtered.slice(from, to + 1), error: queryError };
      },
    };
    return builder;
  },
} };
const route = (await load("src/app/api/admin/cadastru-searches/[id]/route.js")).namespace;
const get = (id = "10") => route.GET({}, { params: Promise.resolve({ id }) });
authorized = false;
assert.equal((await get()).status, 401);
assert.equal(queries.length, 0);
authorized = true;
for (const id of ["0", "-1", "x", "1.5", "9007199254740992"]) assert.equal((await get(id)).status, 400);
assert.equal(queries.length, 0);
savedSearch = null;
assert.equal((await get()).status, 404);
savedSearch = keyed;
// The saved search and sibling logs can be older than the dashboard's current period.
const late = { ...secondary, id: 23, created_at: "2026-10-16T12:00:00Z" };
storedEvents = [main, secondary, other, late, { ...secondary, id: 24, user_id: "someone-else" }];
let response = await get();
assert.equal(response.status, 200);
let details = await response.json();
assert.deepEqual(details.events.map((event) => event.id), [20, 21, 23], "All same-UUID calls load beyond the discovery window; conflicting users stay excluded");
assert.deepEqual(details.events[0].response_payload, main.response_payload);
assert.equal(details.search.event_key, undefined);
assert.equal(details.search.result_value, search.result_value);
assert.equal(details.match, "lookup_id");
assert.ok(queries.some((query) => query.filters.some(([op, column, value]) => op === "eq"
  && column === "response_headers->>x-catdai-lookup-id" && value === lookupId)));
storedEvents = Array.from({ length: 205 }, (_, index) => ({ ...secondary, id: 100 + index }));
details = await (await get()).json();
assert.equal(details.events.length, 205, "Search calls are paginated beyond the dashboard's latest-200 limit");
savedSearch = { ...keyed, lookup_id: lookupId, created_at: "2026-10-17T12:00:00Z" };
storedEvents = [main, secondary, other, late];
assert.deepEqual((await (await get()).json()).events.map(event => event.id), [20, 21, 23],
  "stored lookup ID links calls even when login or delayed requests fall outside the discovery window");
storedEvents = [];
assert.deepEqual((await (await get()).json()).events, []);
savedSearch = search;
storedEvents = [legacy];
assert.equal((await (await get()).json()).match, "inferred");
queryError = { message: "database unavailable" };
assert.equal((await get()).status, 500, "Read failures never masquerade as empty details");

// Exercise the rendered rows and their handlers with a minimal hook harness.
const require = createRequire(import.meta.url);
const { transform, loadBindings } = require("next/dist/build/swc");
await loadBindings();
let states = [];
let stateIndex = 0;
let effects = [];
const jsx = (type, props) => ({ type, props });
const pageContext = vm.createContext({ console, AbortController, fetch: async () => Response.json(details) });
const { code } = await transform(await fs.readFile("src/app/admin/page.js", "utf8")
  + "\nexport { CadastruSearchTable, CadastruSearchDetails, ExternalApiEventTable };", {
  filename: "src/app/admin/page.js", jsc: { parser: { syntax: "ecmascript", jsx: true },
    transform: { react: { runtime: "automatic" } } }, module: { type: "es6" },
});
const page = new vm.SourceTextModule(code, { context: pageContext });
await page.link((name) => {
  const exports = name === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "Fragment" }
    : name === "react" ? { Fragment: "Fragment", useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    }, useEffect: (callback) => effects.push(callback), useCallback: (fn) => fn, useRef: () => ({}) }
    : name.startsWith("@/components/") ? { default: () => null }
    : { groupExternalApiEvents: () => [] };
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context: pageContext });
});
await page.evaluate();
function nodes(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => nodes(child, predicate));
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
}
function render(component, props, initial) {
  if (initial) states = initial;
  stateIndex = 0;
  effects = [];
  return component(props);
}
const { CadastruSearchTable, CadastruSearchDetails, ExternalApiEventTable } = page.namespace;
let deleted = null;
const props = { rows: [{ ...search, favorited: true, share_count: 7, unique_viewers: 3 }], onDelete: (row) => { deleted = row.id; } };
let tree = render(CadastruSearchTable, props, []);
assert.equal(nodes(tree, (node) => node.type === "th" && node.props.children === "Favorite").length, 1);
assert.equal(nodes(tree, (node) => node.type === "th" && node.props.children === "Shares").length, 1);
assert.equal(nodes(tree, (node) => node.type === "th" && node.props.children === "Unique viewers").length, 1);
assert.equal(nodes(tree, (node) => node.type === "td" && node.props.children === "7").length, 1);
assert.equal(nodes(tree, (node) => node.type === "td" && node.props.children === "3").length, 1);
assert.equal(nodes(tree, (node) => node.type === "td" && node.props.children === "Yes").length, 1);
let row = nodes(tree, (node) => node.type === "tr" && node.props.role === "button")[0];
assert.equal(row.props["aria-expanded"], false);
row.props.onKeyDown({ key: "Enter", preventDefault() {} });
tree = render(CadastruSearchTable, props);
assert.equal(nodes(tree, (node) => node.type === CadastruSearchDetails).length, 1);
assert.equal(nodes(tree, (node) => node.type === "td" && node.props.colSpan === 11).length, 1);
let stopped = false;
nodes(tree, (node) => node.type === "button")[0].props.onClick({ stopPropagation() { stopped = true; } });
assert.equal(deleted, search.id);
assert.equal(stopped, true);
assert.equal(states[0], search.id, "Delete does not toggle expansion");
row = nodes(tree, (node) => node.type === "tr" && node.props.role === "button")[0];
row.props.onKeyDown({ key: " ", preventDefault() {} });
assert.equal(nodes(render(CadastruSearchTable, props), (node) => node.type === CadastruSearchDetails).length, 0);
tree = render(CadastruSearchDetails, { row: search }, []);
assert.equal(nodes(tree, (node) => node.props.role === "status").length, 1);
tree = render(CadastruSearchDetails, { row: search }, [null, "Network error", 0, null]);
assert.equal(nodes(tree, (node) => node.props.role === "alert").length, 1);
nodes(tree, (node) => node.type === "button")[0].props.onClick();
assert.equal(states[1], null);
assert.equal(states[2], 1);
tree = render(CadastruSearchDetails, { row: search }, [{ search, events: [main], match: "lookup_id" }, null, 0, null]);
assert.equal(nodes(tree, (node) => node.type === ExternalApiEventTable).length, 1);
tree = render(ExternalApiEventTable, { rows: [main], expandedExternalApiEventId: main.id, setExpandedExternalApiEventId() {} }, []);
assert.equal(nodes(tree, (node) => node.type === "td" && node.props.colSpan === 8).length, 1);
assert.equal(nodes(tree, (node) => node.type === "button").length, 0, "Search details reuse the API view without adding log deletion controls");
tree = render(ExternalApiEventTable, { rows: [main], expandedExternalApiEventId: main.id, setExpandedExternalApiEventId() {},
  deletingExternalApiEventId: null, deleteExternalApiLogs() {} }, []);
assert.equal(nodes(tree, (node) => node.type === "td" && node.props.colSpan === 9).length, 1);
assert.equal(nodes(tree, (node) => node.type === "button").length, 1, "The External API table retains its delete action");
console.log("Admin Cadastru search details passed: UUID/legacy matching, ambiguity, auth, pagination, errors, row interaction and shared API details.");
