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
        assert.equal(name, "delete_failed_external_api_logs");
        calls.push(params.p_event_id);
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
for (const params of ["", "failedApiEventId=", "failedApiEventId=0", "failedApiEventId=-1", "failedApiEventId=abc", "failedApiEventId=1.5", "failedApiEventId=9007199254740992", "allFailedApiEvents=0", "allFailedApiEvents=1&failedApiEventId=1"]) {
  assert.equal((await remove(params)).status, 400, params);
}
assert.equal(calls.length, 0, "Invalid deletion scopes never reach the database");

assert.equal((await remove("failedApiEventId=1")).status, 200);
assert.deepEqual(calls, [1], "Single deletion uses the transactional RPC with the selected id");
assert.equal((await remove("allFailedApiEvents=1&period=day")).status, 200);
assert.deepEqual(calls, [1, null], "Bulk deletion passes no date or display limit to the RPC");

databaseError = { message: "Database unavailable" };
assert.equal((await remove("allFailedApiEvents=1")).status, 500);
for (const code of ["42883", "PGRST202"]) {
  databaseError = { code, message: "Function missing" };
  const response = await remove("failedApiEventId=1");
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /db\/external_api_usage_events.sql/);
}
databaseError = null;
assert.equal((await remove("allFailedApiEvents=1")).status, 200);
console.log("Admin API log deletion checks passed.");
