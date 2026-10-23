// Isolated post-response scheduling checks. No network, Redis or live DB writes.
import assert from "node:assert/strict";
import { loadAppModule } from "./lib/load-app-module.mjs";

const callbacks = [], leases = new Map();
let refreshes = 0;
const overrides = {
  "next/server": { after: callback => callbacks.push(callback) },
  "@/lib/cache": { getSharedCacheClient: async () => ({
    set: async (key, value, options) => {
      assert.equal(options.NX, true);
      assert.equal(options.EX, 300);
      if (leases.has(key)) return null;
      leases.set(key, value);
      return "OK";
    },
  }) },
};
const first = await loadAppModule("@/lib/cadastru-refresh", overrides);
const otherProcess = await loadAppModule("@/lib/cadastru-refresh", overrides);
first.scheduleCadastruRefresh("number:010010613101059", async () => { refreshes++; });
first.scheduleCadastruRefresh("number:010010613101059", async () => { refreshes++; });
otherProcess.scheduleCadastruRefresh("number:010010613101059", async () => { refreshes++; });
assert.equal(refreshes, 0, "refresh cannot start before the response finishes");
assert.equal(callbacks.length, 2, "one callback per process for the same property");
await Promise.all(callbacks.splice(0).map(callback => callback()));
assert.equal(refreshes, 1, "Redis deduplicates refreshes across app processes");

const offline = await loadAppModule("@/lib/cadastru-refresh", {
  "next/server": overrides["next/server"],
  "@/lib/cache": { getSharedCacheClient: async () => null },
});
offline.scheduleCadastruRefresh("address:test", async () => { refreshes++; });
offline.scheduleCadastruRefresh("address:test", async () => { refreshes++; });
await callbacks.shift()();
assert.equal(refreshes, 2, "process-local deduplication still works without Redis");
offline.scheduleCadastruRefresh("failed:test", async () => { throw new Error("Expected test outage"); });
await callbacks.shift()();
offline.scheduleCadastruRefresh("failed:test", async () => assert.fail("retry storm"));
assert.equal(callbacks.length, 0, "failed refreshes retain the five-minute retry cooldown");

const { isUsableCadastruRefresh } = first;
const saved = { cadastral_number: "0100106.131.01.059", apartment: { area_m2: 41, floor: 4 } };
assert.equal(isUsableCadastruRefresh(saved, { ...saved, apartment: { area_m2: 42, floor: 4 } }), true);
for (const partial of [null, {}, { ...saved, incomplete: true }, { ...saved, cache: { stale: true } },
  { ...saved, cadastral_number: "0100106.131.01.060" },
  { ...saved, apartment: { area_m2: 42 } }]) {
  assert.equal(isUsableCadastruRefresh(saved, partial), false, "failed, wrong-property and incomplete snapshots cannot replace saved data");
}
const aggregate = { lands: [{ cadastral_number: "0100106.131", area_m2: 50 }] };
assert.equal(isUsableCadastruRefresh(aggregate, { lands: [] }), false);
assert.equal(isUsableCadastruRefresh(aggregate, { lands: [{ cadastral_number: "0100106.132", area_m2: 50 }] }), false);

const cache = await loadAppModule("@/lib/cadastru-cache", {
  "@/lib/cache": { getSharedCache: async () => null, setSharedCache: async () => true },
});
const fetchedAt = new Date(Date.now() - 40 * 86400_000).toISOString();
const entry = { payload: saved, fetchedAt, expiresAt: cache.cadastruExpiresAt(fetchedAt) };
assert.equal(cache.cadastruNeedsRefresh(entry), false, "technical property data remains fresh at 40 days");
assert.equal(cache.cadastruNeedsRefresh({ ...entry, payload: { ...saved, apartment: { ...saved.apartment, ownership_type: "Private" } } }), true,
  "registry data retains the shorter 30-day refresh target");
assert.equal(cache.withCadastruFreshness(entry).data_freshness.property.fetched_at, fetchedAt);
console.log("Refresh checks passed: post-response work, shared leases, offline cooldown, safe replacement and independent registry freshness.");
