// Isolated deletion checks; no network or live database writes.
// pnpm exec node --experimental-vm-modules scripts/test-admin-api-log-deletion.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

let authorized = true;
let databaseError = null;
const calls = [];
const json = (data, { status = 200 } = {}) => Response.json(data, { status });
const mocks = {
  "next/server": { NextResponse: { json } },
  "@/lib/admin-auth": {
    requireAdminApiAuth: () => authorized ? null : json({ error: "Unauthorized" }, { status: 401 }),
  },
  "@/lib/supabase-admin": {
    supabaseAdmin: {
      async rpc(name, params) {
        assert.ok(["delete_external_api_log", "delete_failed_external_api_logs"].includes(name));
        calls.push({ name, id: params.p_event_id });
        return { data: 1, error: databaseError };
      },
    },
  },
};
const context = vm.createContext({ console: { error() {} }, Date });
const route = new vm.SourceTextModule(await fs.readFile("src/app/api/admin/stats/route.js", "utf8"), { context });
await route.link((id) => {
  const mock = mocks[id];
  assert.ok(mock, `Unexpected import: ${id}`);
  return new vm.SyntheticModule(Object.keys(mock), function () {
    for (const [key, value] of Object.entries(mock)) this.setExport(key, value);
  }, { context });
});
await route.evaluate();
const remove = (params = "") => route.namespace.DELETE({ nextUrl: new URL(`https://catdai.md/api/admin/stats?${params}`) });

authorized = false;
assert.equal((await remove("allFailedApiEvents=1")).status, 401);
assert.equal(calls.length, 0, "Unauthorized deletion never reaches the database");
authorized = true;
for (const params of ["", "failedApiEventId=", "failedApiEventId=0", "failedApiEventId=-1", "failedApiEventId=abc", "failedApiEventId=1.5", "failedApiEventId=9007199254740992", "apiEventId=", "apiEventId=0", "apiEventId=abc", "apiEventId=1.5", "apiEventId=9007199254740992", "apiEventId=1&failedApiEventId=2", "allFailedApiEvents=0", "allFailedApiEvents=1&failedApiEventId=1", "allFailedApiEvents=1&apiEventId=1"]) {
  assert.equal((await remove(params)).status, 400, params);
}
assert.equal(calls.length, 0, "Invalid deletion scopes never reach the database");

assert.equal((await remove("failedApiEventId=1")).status, 200);
assert.deepEqual(calls, [{ name: "delete_failed_external_api_logs", id: 1 }], "Legacy failed-only deletion remains supported");
assert.equal((await remove("apiEventId=2")).status, 200);
assert.deepEqual(calls.at(-1), { name: "delete_external_api_log", id: 2 }, "Single deletion uses the any-status transactional RPC");
assert.equal((await remove("allFailedApiEvents=1&period=day")).status, 200);
assert.deepEqual(calls.at(-1), { name: "delete_failed_external_api_logs", id: null }, "Bulk deletion remains failed-only with no date or display limit");

databaseError = { message: "Database unavailable" };
assert.equal((await remove("allFailedApiEvents=1")).status, 500);
for (const code of ["42883", "PGRST202"]) {
  databaseError = { code, message: "Function missing" };
  const response = await remove("apiEventId=1");
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /db\/external_api_usage_events.sql/);
}
databaseError = null;
assert.equal((await remove("allFailedApiEvents=1")).status, 200);
console.log("Admin API log deletion checks passed.");

// Exercise the actual SQL against isolated PostgreSQL, including UTC dates and repeat deletion.
const { PGlite } = await import("@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec("create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role;");
  await db.exec(await fs.readFile("db/external_api_usage_daily.sql", "utf8"));
  const sql = await fs.readFile("db/external_api_usage_events.sql", "utf8");
  await db.exec(sql);
  await db.exec(sql);
  await db.exec(`
    set timezone = 'Europe/Chisinau';
    insert into external_api_usage_daily (usage_date, service, status, count) values
      ('2026-10-09', 'cadastru_address', 'success', 3),
      ('2026-10-09', 'cadastru_address', 'failure', 2),
      ('2026-10-10', 'cadastru_address', 'success', 5);
    insert into external_api_usage_events (id, service, status, created_at) values
      (1, 'cadastru_address', 'success', '2026-10-09 23:30:00+00'),
      (2, 'cadastru_address', 'failure', '2026-10-09 12:00:00+00'),
      (3, '999_listing', 'success', '2026-10-09 12:00:00+00');
  `);
  const deleted = async (id) => (await db.query("select delete_external_api_log($1) as count", [id])).rows[0].count;
  const counts = async () => (await db.query("select status, count from external_api_usage_daily order by usage_date, status")).rows;
  assert.equal(Number(await deleted(1)), 1);
  assert.deepEqual(await counts(), [{ status: "failure", count: 2 }, { status: "success", count: 2 }, { status: "success", count: 5 }]);
  assert.equal(Number(await deleted(1)), 0, "Repeated deletion cannot decrement counters twice");
  assert.equal(Number(await deleted(2)), 1);
  assert.deepEqual(await counts(), [{ status: "failure", count: 1 }, { status: "success", count: 2 }, { status: "success", count: 5 }]);
  assert.equal(Number(await deleted(3)), 1, "Aggregate row is not required to delete request details");
  await assert.rejects(deleted(null), /Invalid API log id/);
  await assert.rejects(deleted(0), /Invalid API log id/);
  await db.exec("select delete_failed_external_api_logs();");
  assert.deepEqual(await counts(), [{ status: "success", count: 2 }, { status: "success", count: 5 }], "Bulk failed cleanup preserves success counters");
  const privileges = (await db.query("select has_function_privilege('anon', 'delete_external_api_log(bigint)', 'execute') as anon, has_function_privilege('authenticated', 'delete_external_api_log(bigint)', 'execute') as authenticated, has_function_privilege('service_role', 'delete_external_api_log(bigint)', 'execute') as service_role")).rows[0];
  assert.deepEqual(privileges, { anon: false, authenticated: false, service_role: true });
  console.log("Admin API log deletion SQL checks passed.");
} finally {
  await db.close();
}
