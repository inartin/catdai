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

const errors = [];
let persist = true;
const environment = { NODE_ENV: "production", ADMIN_TOKEN: "isolated-test-secret" };
const admin = {
  from(table) {
    assert.equal(table, "cadastru_search_events");
    let row, key;
    return {
      insert(value) { row = { ...value }; return this; },
      select() { return this; },
      eq(column, value) { assert.equal(column, "event_key"); key = value; return this; },
      async single() {
        try {
          const columns = row && Object.keys(row);
          const result = row
            ? await db.query(`insert into cadastru_search_events (${columns.join(",")}) values (${columns.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
              columns.map((column) => typeof row[column] === "object" && row[column] !== null ? JSON.stringify(row[column]) : row[column]))
            : await db.query("select id from cadastru_search_events where event_key=$1", [key]);
          return { data: result.rows[0] || null, error: null };
        } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
      },
    };
  },
};
const context = vm.createContext({ crypto, Buffer, URL, console: { error: (...args) => errors.push(args) }, process: { env: environment } });
const modules = new Map();
const mocks = {
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
