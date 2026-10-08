import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const features = ["sale_estimate", "rent_estimate", "listing_analysis", "cadastru_lookup", "yield_calculator", "pdf_report"];
const calls = [];
let deleteError = null;
let metadataUpdates = 0;
const query = {
  delete() { calls.push(["delete"]); return this; },
  eq(...args) { calls.push(["eq", ...args]); return this; },
  in(...args) { calls.push(["in", ...args]); return this; },
  gte(...args) { calls.push(["gte", ...args]); return this; },
  lt(...args) { calls.push(["lt", ...args]); return Promise.resolve({ error: deleteError }); },
};
const supabaseAdmin = {
  rpc(name, args) { calls.push(["rpc", name, args]); return Promise.resolve({ error: null }); },
  from(table) { calls.push(["from", table]); return query; },
  auth: { admin: {
    getUserById() { return Promise.resolve({ data: { user: { id: "user-1", app_metadata: {} } }, error: null }); },
    updateUserById(id, data) { metadataUpdates++; calls.push(["metadata", id, data]); return Promise.resolve({ error: null }); },
  } },
};
const mocks = {
  "next/server": { NextResponse: { json: Response.json } },
  "@/lib/admin-auth": { requireAdminApiAuth: () => null },
  "@/lib/supabase-admin": { supabaseAdmin },
  "@/lib/payment-products": {
    PAYMENT_FEATURE_KEYS: features,
    getPaymentProducts: () => ({ standard_pack: { grants: Object.fromEntries(features.map(key => [key, 2])) } }),
  },
  "@/lib/free-monthly-feature-usage": {
    FREE_MONTHLY_FEATURE_KEYS: features,
    getFreeMonthlyFeatureLimit: () => 1,
    getFreeMonthlyFeatureUsageWindow: () => ({ startIso: "2026-10-01T00:00:00.000Z", endIso: "2026-11-01T00:00:00.000Z" }),
  },
};
const context = vm.createContext({ console: { error() {} }, Response, Date });
const route = new vm.SourceTextModule(await fs.readFile("src/app/api/admin/users/[id]/package/route.js", "utf8"), { context });
await route.link(name => new vm.SyntheticModule(Object.keys(mocks[name]), function () {
  for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
}, { context }));
await route.evaluate();

async function setPackage(packageKey) {
  return route.namespace.PATCH({ json: async () => ({ packageKey }) }, { params: Promise.resolve({ id: "user-1" }) });
}

let response = await setPackage("free");
assert.equal(response.status, 200);
let body = await response.json();
assert.equal(body.packageKey, "free");
assert.deepEqual(body.credits, []);
assert.equal(body.freeMonthlyCredits.length, 6);
assert.ok(body.freeMonthlyCredits.every(row => row.remainingUses === 1 && row.totalUsed === 0));
assert.equal(calls.find(call => call[0] === "rpc")[2].p_clear, true);
assert.deepEqual(calls.filter(call => ["from", "eq", "in", "gte", "lt"].includes(call[0])), [
  ["from", "user_feature_usage_events"],
  ["eq", "user_id", "user-1"],
  ["eq", "source", "free_monthly"],
  ["in", "feature_key", features],
  ["gte", "created_at", "2026-10-01T00:00:00.000Z"],
  ["lt", "created_at", "2026-11-01T00:00:00.000Z"],
]);

calls.length = 0;
response = await setPackage("standard_pack");
body = await response.json();
assert.equal(response.status, 200);
assert.ok(body.credits.every(row => row.remainingUses === 2 && row.totalUsed === 0));
assert.ok(body.freeMonthlyCredits.every(row => row.remainingUses === 1 && row.totalUsed === 0));
assert.equal(calls.find(call => call[0] === "rpc")[2].p_clear, false);

deleteError = new Error("delete failed");
response = await setPackage("free");
assert.equal(response.status, 500);
assert.equal(metadataUpdates, 2, "failed free usage reset must not update package metadata");

console.log("Admin package reset checks passed");
