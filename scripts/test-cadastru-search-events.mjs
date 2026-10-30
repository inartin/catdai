// Real local PostgreSQL uniqueness + production logger; no network or live writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-search-events.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const userA = crypto.randomUUID(), userB = crypto.randomUUID();
await db.exec("create schema auth; create table auth.users(id uuid primary key);");
await db.query("insert into auth.users values ($1),($2)", [userA, userB]);
const schema = await fs.readFile("db/cadastru_search_events.sql", "utf8");
await db.exec(schema.split("-- Nullable for existing events")[0]);
await db.exec("insert into cadastru_search_events(search_type,search_address) values ('address','Legacy'),('address','Legacy');");
const migration = await fs.readFile("supabase/migrations/20261015104801_cadastru_search_event_deduplication.sql", "utf8");
await db.exec(migration);
await db.exec(migration);
assert.equal((await db.query("select count(*)::int n from cadastru_search_events")).rows[0].n, 2);

await db.exec(await fs.readFile("db/cadastru_records.sql", "utf8"));
// Upgrade the old constraints, preserving existing event types and rejecting unknown ones.
for (const table of ["cadastru_search_events", "cadastru_records"]) {
  await db.exec(`alter table ${table} drop constraint ${table}_result_type_check;
    alter table ${table} add constraint ${table}_result_type_check
    check (result_type in ('no_data','address_only','apartment_only','full_data'));`);
}
const landMigration = await fs.readFile("supabase/migrations/20261015111730_cadastru_land_result_type.sql", "utf8");
await db.exec(landMigration);
await db.exec(landMigration);
await db.exec("insert into cadastru_records(cadastral_number,result_type) values ('5520202.182','land_only');");
await assert.rejects(db.exec("insert into cadastru_records(cadastral_number,result_type) values ('5520202.183','unknown');"), /check constraint/);
await assert.rejects(db.exec("insert into cadastru_search_events(search_type,result_type) values ('number','unknown');"), /check constraint/);

await db.exec(await fs.readFile("supabase/migrations/20261018090933_cadastru_failed_search_results.sql", "utf8"));

await db.exec(`create role anon; create role authenticated; create role service_role;
  create table external_api_usage_daily(usage_date date, service text, status text, count bigint);
  create table external_api_usage_events(created_at timestamptz, service text, status text);`);
await db.exec(await fs.readFile("supabase/migrations/20261020093634_cadastru_search_journeys.sql", "utf8"));

await db.exec("alter table cadastru_search_events add column visitor jsonb;");
const errors = [];
let persist = true;
const environment = { NODE_ENV: "production", ADMIN_TOKEN: "isolated-test-secret" };
const admin = {
  from(table) {
    assert.equal(table, "cadastru_search_events");
    let row, key, updated, nullColumn, keyColumn = "event_key", selected = "id";
    const execute = async () => {
      try {
        const columns = Object.keys(updated || row || {});
        const values = columns.map(column => {
          const value = (updated || row)[column];
          return typeof value === "object" && value !== null ? JSON.stringify(value) : value;
        });
        const result = updated
          ? await db.query(`update cadastru_search_events set ${columns.map((c, i) => `${c}=$${i + 1}`).join(",")}
              where ${keyColumn}=$${columns.length + 1}${nullColumn ? ` and ${nullColumn} is null` : ""} returning id`, [...values, key])
          : row ? await db.query(`insert into cadastru_search_events (${columns.join(",")}) values (${columns.map((_, i) => `$${i + 1}`).join(",")}) returning id`, values)
          : await db.query(`select ${selected} from cadastru_search_events where ${keyColumn}=$1`, [key]);
        return { data: result.rows[0] || null, error: null };
      } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
    };
    return {
      insert(value) { row = { ...value }; return this; },
      update(value) { updated = value; return this; },
      select(value) { selected = value || "id"; return this; },
      eq(column, value) { keyColumn = column; key = value; return this; },
      is(column, value) { assert.equal(value, null); nullColumn = column; return this; },
      single: execute,
      maybeSingle: execute,
      then(resolve, reject) { return execute().then(result => ({ ...result, data: result.data ? [result.data] : [] })).then(resolve, reject); },
    };
  },
};
const context = vm.createContext({ crypto, Buffer, URL, console: { error: (...args) => errors.push(args) }, process: { env: environment } });
const modules = new Map();
const mocks = {
  "@/lib/visitor-browser": { getDeviceId: () => null },
  "@/lib/statistics-context": { getStatisticsVisitor: () => null, shouldCollectStatistics: () => true, withStatisticsContext: handler => handler },
  "node:crypto": { default: crypto },
  "@/lib/access-tier": { resolveAccessTier: async (request) => ({ user_id: request.userId }) },
  "@/lib/runtime-persistence": { shouldPersistRuntimeData: () => persist },
  "@/lib/supabase-admin": { supabaseAdmin: admin },
};
async function load(id) {
  if (modules.has(id)) return modules.get(id);
  const exports = mocks[id];
  const loadedModule = exports ? new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context }) : new vm.SourceTextModule(await fs.readFile(`src/${id.slice(2)}.js`, "utf8"), { context });
  modules.set(id, loadedModule);
  return loadedModule;
}
const logger = await load("@/lib/cadastru-search-events");
await logger.link(load);
await logger.evaluate();
const { logCadastruSearchEvent: log } = logger.namespace;
const { readCadastruEvaluationToken: eventId } = modules.get("@/lib/cadastru-evaluation-tracking").namespace;
const options = { lookupId: crypto.randomUUID(), searchAddress: "Chișinău, str Valea Trandafirilor 11",
  searchRequest: { city: "Chișinău", road_type: "strada", street: "Valea Trandafirilor", house_number: "11" },
  city: "Chișinău", district: "Centru", resultType: "address_only", lookupSource: "api" };
const search = (overrides = {}, userId = userA, type = "address") => log({ userId }, type, { ...options, ...overrides });
const tokens = await Promise.all(Array.from({ length: 3 }, () => search()));
assert(tokens.every(Boolean));
const id = eventId(tokens[0]);
assert(tokens.every((token) => eventId(token) === id), "three concurrent requests share one event");
const getRow = async (id) => (await db.query("select * from cadastru_search_events where id=$1", [id])).rows[0];
const original = await getRow(id);
const highwayRequest = { city: "Chișinău", road_type: "sos", street: "Hâncești", house_number: "140/2" };
const highwayId = eventId(await search({ lookupId: crypto.randomUUID(), searchRequest: highwayRequest,
  searchAddress: "Chișinău, sos Hâncești 140/2" }));
assert.deepEqual((await getRow(highwayId)).search_request, highwayRequest, "Șoseaua history retains replayable request fields");
await db.query("update cadastru_search_events set valuation_clicked_at=now(), valuation_completed_at=now() where id=$1", [id]);
assert.equal(eventId(await search()), id, "a completed replay returns the same signed event");
const replay = await getRow(id);
assert.equal(replay.created_at.toISOString(), original.created_at.toISOString());
assert(replay.valuation_clicked_at && replay.valuation_completed_at);
assert.notEqual(eventId(await search({ lookupId: crypto.randomUUID() })), id, "new submission counts separately");
assert.notEqual(eventId(await search({ searchAddress: "Chișinău, str Valea Trandafirilor 12" })), id, "different query stays separate");
assert.notEqual(eventId(await search({}, userB)), id, "shared URL cannot merge different users");
const anonymousId = eventId(await search({}, null));
assert.notEqual(anonymousId, id, "anonymous preview retains separate attribution");
assert.equal(eventId(await search({}, null)), anonymousId, "anonymous retries also dedupe");
assert.equal(eventId(await search({ lookupId: options.lookupId.toUpperCase() })), id);
assert.equal(eventId(await search({ resultType: "error" })), id);
assert.equal((await getRow(id)).result_type, "error", "failed delivery replaces premature lookup success");
await search();
assert.equal((await getRow(id)).result_type, "address_only", "successful retry repairs the outcome");
assert((await getRow(id)).valuation_clicked_at);
const noData = { lookupId: crypto.randomUUID(), resultType: "no_data" };
assert.equal(eventId(await search(noData)), eventId(await search(noData)), "no-result retries dedupe");
const number = { lookupId: crypto.randomUUID(), cadastralNumber: "0100104.003.01" };
assert.equal(eventId(await search(number, userA, "number")), eventId(await search(number, userA, "number")), "number searches dedupe");
const landId = eventId(await search({ ...number, lookupId: crypto.randomUUID(), resultType: "land_only",
  resultPayload: { lands: [{ cadastral_number: "5520202.182", area_m2: 1352 }] } }, userA, "number"));
assert.equal((await getRow(landId)).result_type, "land_only", "land result type survives logger normalization and database constraints");
for (const lookupId of [undefined, "invalid"]) {
  assert.notEqual(eventId(await search({ lookupId })), eventId(await search({ lookupId })), "legacy/invalid IDs retain existing behavior");
}

// Browser identity is separate from the URL and stays stable through OAuth.
const sessionId = crypto.randomUUID();
const journey = { ...number, lookupId: crypto.randomUUID(), resultType: "land_only", lookupSource: "api" };
const sessionSearch = (userId, session = sessionId, overrides = {}) => log({ userId,
  headers: { get: () => session } }, "number", { ...journey, ...overrides });
const firstId = eventId(await sessionSearch(null));
const started = await getRow(firstId);
const loginIds = await Promise.all([sessionSearch(userA, sessionId, { lookupSource: "cache" }), sessionSearch(null)]);
assert(loginIds.every(token => eventId(token) === firstId), "login and concurrent anonymous replay share one search");
const loggedIn = await getRow(firstId);
assert.equal(loggedIn.user_id, userA);
assert.equal(loggedIn.created_at.toISOString(), started.created_at.toISOString());
assert.equal(loggedIn.lookup_source, "api", "login cache reload does not relabel the initial API search");
assert.equal(loggedIn.lookup_id, journey.lookupId);
assert.notEqual(eventId(await sessionSearch(userB, crypto.randomUUID())), firstId, "copied URL in another browser stays separate");
assert.notEqual(eventId(await sessionSearch(userA, sessionId, { lookupId: crypto.randomUUID() })), firstId, "deliberate resubmission stays separate");
const cachedId = eventId(await sessionSearch(null, crypto.randomUUID(), { lookupSource: "cache" }));
assert.equal((await getRow(cachedId)).lookup_source, "cache", "cached results count as searches");
const retrySession = crypto.randomUUID();
const failedId = eventId(await sessionSearch(null, retrySession, { resultType: "error", lookupSource: null }));
assert.equal(eventId(await sessionSearch(null, retrySession)), failedId);
assert.equal((await getRow(failedId)).lookup_source, "api", "successful retry fills an initially unknown source");

// Exact local midnight excludes earlier calls in the same UTC boundary day.
await db.exec(`insert into external_api_usage_daily values
  ('2026-10-19','cadastru_number','success',99), ('2026-10-20','cadastru_number','success',3);
  insert into external_api_usage_events values
  ('2026-10-19 20:59:59+00','cadastru_number','success'),
  ('2026-10-19 21:00:00+00','cadastru_number','success'),
  ('2026-10-20 00:00:00+00','cadastru_number','success');`);
assert.equal(Number((await db.query("select count from admin_external_api_usage_since('2026-10-19 21:00:00+00')")).rows[0].count), 4);
assert.equal(Number((await db.query("select count from admin_external_api_usage_since(null)")).rows[0].count), 102);
await db.exec(`insert into external_api_usage_daily values ('2026-10-25','cadastru_number','success',2);
  insert into external_api_usage_events values ('2026-10-24 21:00:00+00','cadastru_number','success');`);
assert.equal(Number((await db.query("select count from admin_external_api_usage_since('2026-10-25 00:00:00 Europe/Chisinau')")).rows[0].count), 3, "DST midnight uses timestamp boundary");

// Verify the conservative repair using original legacy hashes, including preserved tokens.
await db.exec(`alter table external_api_usage_events add column response_headers jsonb;
  create table cadastru_shared_reports(search_event_id bigint);`);
const repairPairs = [];
for (const cadastralNumber of ["4145107.0337", "9420109.243"]) {
  const lookupId = crypto.randomUUID();
  const opts = { cadastralNumber, lookupId, resultType: "land_only", lookupSource: "api" };
  const originalId = eventId(await search(opts, null, "number"));
  const replayToken = await search(opts, userA, "number");
  const replayId = eventId(replayToken);
  repairPairs.push({ originalId, replayId, replayToken });
  await db.query("update cadastru_search_events set lookup_id=null,created_at='2026-10-20 06:46:14+00' where id=$1", [originalId]);
  await db.query("update cadastru_search_events set lookup_id=null,created_at='2026-10-20 06:46:38+00' where id=$1", [replayId]);
  await db.query("insert into external_api_usage_events(created_at,service,status,response_headers) values('2026-10-20 06:46:13+00',$1,'success',$2)",
    [cadastralNumber === "9420109.243" ? "cadastru_nearby" : "cadastru_number", JSON.stringify({ "x-catdai-lookup-id": lookupId })]);
  await db.query("insert into cadastru_shared_reports values ($1)", [replayId]);
}
await db.exec("insert into cadastru_records(cadastral_number,last_official_fetch_at,next_refresh_after) values ('9420109.243','2026-10-12 00:00:00+00','2026-11-11 00:00:00+00');");
const repairSql = await fs.readFile("supabase/migrations/20261020094041_cadastru_verified_journey_repair.sql", "utf8");
await db.exec(repairSql);
await db.exec(repairSql);
for (const { originalId, replayId, replayToken } of repairPairs) {
  assert.equal((await getRow(originalId)).user_id, userA);
  assert.equal(Number((await getRow(replayId)).duplicate_of), originalId);
  assert.equal(Number((await db.query("select count(*) n from cadastru_search_events where id in ($1,$2) and duplicate_of is null", [originalId,replayId])).rows[0].n), 1);
  assert.equal(Number((await db.query("select count(*) n from cadastru_shared_reports where search_event_id=$1", [originalId])).rows[0].n), 1);
  const { recordCadastruEvaluationStep } = modules.get("@/lib/cadastru-evaluation-tracking").namespace;
  assert.equal(await recordCadastruEvaluationStep(replayToken, "click"), true);
  assert((await getRow(originalId)).valuation_clicked_at, "old duplicate token updates original search");
}
assert.equal((await getRow(repairPairs[1].originalId)).lookup_source, "cache");
environment.NODE_ENV = "development";
assert.equal(await search(), undefined);
environment.NODE_ENV = "production";
persist = false;
assert.equal(await search(), undefined);
persist = true;
assert.equal(errors.length, 0, "expected duplicate requests do not report insert failures");

// App-first deployments still serve results if the additive migration is absent.
await db.exec("drop index idx_cadastru_search_events_event_key; alter table cadastru_search_events drop column event_key;");
assert(eventId(await search()), "older schema fallback still logs and returns an evaluation token");
assert.equal(errors.length, 0);
await db.close();
console.log("Search events passed: PostgreSQL uniqueness, concurrent retries, token/progress preservation, viewer/query isolation, deliberate repeats, no-data/number/legacy searches and rollout compatibility.");
