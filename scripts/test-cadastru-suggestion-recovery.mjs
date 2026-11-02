// Signed suggestion tracking with an isolated Postgres database; no live writes.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec(`create table external_api_usage_events (
  id integer primary key, service text, status text, suggestion_recovery jsonb
); insert into external_api_usage_events values (1, 'cadastru_address', 'failure', null);`);
let collect = true, persist = true;
const env = { NODE_ENV: "production", CADASTRU_EXTERNAL_API_SECRET: "test-only" };
const mocks = {
  "node:crypto": { default: crypto },
  "@/lib/statistics-context": { shouldCollectStatistics: () => collect },
  "@/lib/runtime-persistence": { shouldPersistRuntimeData: () => persist },
  "@/lib/supabase-admin": { supabaseAdmin: { from(table) {
    assert.equal(table, "external_api_usage_events");
    let activity;
    const filters = [], values = [];
    const q = {
      update(value) { activity = value.suggestion_recovery; return q; },
      eq(field, value) {
        assert(["id", "service", "status"].includes(field));
        values.push(value); filters.push(`${field} = $${values.length + 1}`); return q;
      },
      is(field, value) {
        assert.equal(value, null);
        assert(["suggestion_recovery", "suggestion_recovery->>recovered_at"].includes(field));
        filters.push(`${field === "suggestion_recovery" ? field : "suggestion_recovery->>'recovered_at'"} is null`);
        return q;
      },
      then(resolve, reject) {
        return db.query(`update external_api_usage_events set suggestion_recovery = $1::jsonb where ${filters.join(" and ")}`,
          [JSON.stringify(activity), ...values]).then(() => resolve({ error: null }), reject);
      },
    };
    return q;
  } } },
};
const context = vm.createContext({ console, Buffer, Date, process: { env } });
const mod = new vm.SourceTextModule(await fs.readFile("src/lib/cadastru-suggestion-recovery.js", "utf8"), { context });
await mod.link(name => new vm.SyntheticModule(Object.keys(mocks[name]), function () {
  for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
}, { context }));
await mod.evaluate();
const { createSuggestionRecoveryToken: create, readSuggestionRecoveryToken: read,
  recordSuggestionSelection: select, recordSuggestionRecovery: recover } = mod.namespace;
const address = { city: "Bălți", roadType: "str", street: "Tudor Vladimirescu", houseNumber: "6/16", apartmentNumber: "16" };
const correction = { ...address, houseNumber: "6" };
const token = create(1, address, [correction]);
const retryId = crypto.randomUUID();
const details = { address: { ...correction, resolvedAddress: "Bălți, str Tudor Vladimirescu 6 ap 16" }, lookupId: retryId };
const row = async () => (await db.query("select * from external_api_usage_events where id = 1")).rows[0];
const recovery = read(token, correction);
assert(recovery);
await select(recovery, details);
assert((await row()).suggestion_recovery.clicked_at, "a retry starts tracking before it finds data");
assert.equal((await row()).suggestion_recovery.recovered_at, undefined, "a failed/incomplete retry is only selected");
await recover(recovery, { ...details, lookupSource: "cache" });
const successful = await row();
assert(successful.suggestion_recovery.recovered_at);
assert.equal(successful.suggestion_recovery.retry_lookup_id, retryId);
assert.equal(successful.suggestion_recovery.lookup_source, "cache");
assert.equal(successful.status, "failure", "worker failure totals remain intact");
await select(read(token, correction), { ...details, lookupId: crypto.randomUUID() });
await recover(read(token, correction), { ...details, lookupSource: "api" });
assert.deepEqual(await row(), successful, "the first successful recovery cannot be overwritten");
await db.exec("update external_api_usage_events set suggestion_recovery = null");
assert.equal(read(token, { ...correction, apartmentNumber: "17" }), null);
assert.equal(read(token + "x", correction), null);
await select(null, details);
assert.equal((await row()).suggestion_recovery, null, "manual/invalid requests do not create click activity");
for (const mode of ["admin", "development", "persistence"]) {
  collect = mode !== "admin";
  env.NODE_ENV = mode === "development" ? "development" : "production";
  persist = mode !== "persistence";
  const attempt = read(token, correction);
  await select(attempt, details);
  await recover(attempt, { ...details, lookupSource: "api" });
  assert.equal((await row()).suggestion_recovery, null, `${mode} suppresses both writes`);
}
await db.close();
console.log("Suggestion tracking passed: signed selection, failed retries, cache recovery, first success, property identity, admin/development guards and Postgres JSON filters.");
