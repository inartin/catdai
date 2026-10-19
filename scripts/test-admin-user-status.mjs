import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { sharedPaidCreditBalance, sharedFreeMonthlyCredit } from "../src/lib/shared-credit-balance.mjs";

const id = "12345678-1234-1234-1234-123456789abc";
const user = { id, app_metadata: { provider: "google", catdai_admin_package_key: "pro_pack" } };
let authorized = true, origin = true, readError = null, updateError = null, reads = 0, writes = 0;
const query = new Proxy({}, {
  get: (_, key) => key === "then"
    ? (resolve) => resolve({ data: [], error: null })
    : () => query,
});
const mocks = {
  "next/server": { NextResponse: { json: Response.json } },
  "@/lib/admin-auth": { requireAdminApiAuth: () => authorized ? null : Response.json({}, { status: 401 }) },
  "@/lib/maib/http": { UUID: /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i, sameOrigin: () => origin },
  "@/lib/supabase-admin": { supabaseAdmin: {
    from: () => query,
    auth: { admin: {
      listUsers: async () => ({ data: { users: [user] } }),
      getUserById: async () => { reads++; return { data: { user }, error: readError }; },
      updateUserById: async (userId, data) => {
        writes++;
        assert.equal(userId, id);
        if (!updateError) user.app_metadata = data.app_metadata;
        return { error: updateError };
      },
    } },
  } },
  "@/lib/shared-credit-balance.mjs": { sharedPaidCreditBalance, sharedFreeMonthlyCredit },
  "@/lib/free-monthly-feature-usage": {
    FREE_MONTHLY_FEATURE_KEYS: [],
    getFreeMonthlyFeatureUsageWindow: () => ({ startIso: "2026-10-01", endIso: "2026-11-01" }),
  },
  "@/lib/payment-products": { PAYMENT_FEATURE_KEYS: [] },
};
const context = vm.createContext({ console: { error() {} }, Response, Date });
async function load(path) {
  const mod = new vm.SourceTextModule(await fs.readFile(path, "utf8"), { context });
  await mod.link(name => new vm.SyntheticModule(Object.keys(mocks[name]), function () {
    for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
  }, { context }));
  await mod.evaluate();
  return mod.namespace;
}
const route = await load("src/app/api/admin/users/[id]/admin/route.js");
const usersRoute = await load("src/app/api/admin/users/route.js");
const patch = (body, userId = id) => route.PATCH({ json: async () => body }, { params: Promise.resolve({ id: userId }) });
const list = async () => (await (await usersRoute.GET({ nextUrl: new URL("https://catdai.test/api/admin/users?fresh=1") })).json()).users[0];

authorized = false;
assert.equal((await patch({ isAdmin: true })).status, 401);
authorized = true;
origin = false;
assert.equal((await patch({ isAdmin: true })).status, 403);
origin = true;
for (const body of [null, {}, { isAdmin: "true" }, { isAdmin: 1 }]) {
  assert.equal((await patch(body)).status, 400);
}
assert.equal((await patch({ isAdmin: true }, "invalid")).status, 400);
assert.equal((await route.PATCH({ json: async () => { throw new Error("bad json"); } }, { params: { id } })).status, 400);
assert.equal(reads, 0);
assert.equal(writes, 0);

// User-editable metadata must not control this marker.
user.user_metadata = { catdai_is_admin: true, isAdmin: true };
assert.equal((await list()).isAdmin, false);
let response = await patch({ isAdmin: true });
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { ok: true, isAdmin: true });
assert.equal((await list()).isAdmin, true, "saved marker survives reloading the users API");
assert.equal(user.app_metadata.provider, "google");
assert.equal(user.app_metadata.catdai_admin_package_key, "pro_pack");
response = await patch({ isAdmin: false });
assert.equal(response.status, 200);
assert.equal((await list()).isAdmin, false);

readError = { status: 404, message: "not found" };
assert.equal((await patch({ isAdmin: true })).status, 404);
readError = { status: 503, message: "unavailable" };
assert.equal((await patch({ isAdmin: true })).status, 500);
assert.equal(writes, 2);
readError = null;
updateError = { message: "update failed" };
assert.equal((await patch({ isAdmin: true })).status, 500);
assert.equal((await list()).isAdmin, false);
console.log("Admin marker auth, origin, validation, metadata preservation, persistence, removal and error checks passed.");
