// Run with pnpm exec node --experimental-vm-modules scripts/test-cadastru-pdf-access.mjs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { validateCadastralNumber } from "../src/lib/validation.js";
import { cadastruReportBlockedByRegistry } from "../src/lib/cadastru-property-details.js";

const number = "0100201.999.01.0101";
const other = "0100201.999.01.0102";
const address = "Chișinău, str Exemplului 7";
const slug = "a".repeat(48);
const payload = { cadastral_number: number, apartment: { address } };
const addressPayload = { resolved_address: address, lands: [{ cadastral_number: "0100201.999" }] };
const key = (criteria) => JSON.stringify(criteria);
const usage = new Map();
const orders = [];
let renders = 0;
let spends = 0;
let allowSpend = false;
let persistStatistics = true;
let collectStatistics = true;
let failRender = false;
let failInsert = false;
const deferred = [];
const pdfEvents = [];
const errors = [];

const supabaseAdmin = {
  from(table) {
    if (table === "cadastru_pdf_events") {
      return {
        async insert(row) {
          assert.deepEqual(Object.keys(row), ["created_at"]);
          assert(Number.isFinite(Date.parse(row.created_at)));
          if (failInsert) return { error: { message: "Statistics unavailable" } };
          pdfEvents.push(row);
          return { error: null };
        },
      };
    }
    const predicates = [];
    const builder = {
      select() { return this; },
      eq(field, value) { predicates.push((row) => row[field] === value); return this; },
      in(field, values) { predicates.push((row) => values.includes(row[field])); return this; },
      not(field, operator, value) {
        assert.equal(operator, "is");
        predicates.push((row) => row[field] !== value);
        return this;
      },
      contains(field, values) {
        predicates.push((row) => Object.entries(values).every(([k, v]) => row[field]?.[k] === v));
        return this;
      },
      limit() { return this; },
      async maybeSingle() {
        const rows = table === "maib_payment_orders" ? orders
          : [{ slug, sharer_user_id: "buyer", payload }];
        return { data: rows.find((row) => predicates.every((predicate) => predicate(row))) || null };
      },
    };
    return builder;
  },
};

const getPaidFeatureUsageEvent = async ({ userId, featureKey, idempotencyKey, includeMetadata }) => {
  assert.equal(featureKey, "cadastru_lookup");
  assert.equal(includeMetadata, true);
  return usage.get(`${userId}:${idempotencyKey}`);
};
const mocks = {
  "next/server": { NextResponse: { json: Response.json }, after: (callback) => deferred.push(callback) },
  "@/lib/runtime-persistence": { shouldPersistRuntimeData: () => persistStatistics },
  "@/lib/statistics-context": {
    shouldCollectStatistics: () => collectStatistics,
    withStatisticsContext: (handler) => handler,
  },
  "@/lib/access-tier": { resolveAccessTier: async (req) => {
    const auth = req.headers.get("authorization");
    return { user_id: auth === "Bearer buyer" ? "buyer" : auth === "Bearer other" ? "other" : null };
  } },
  "@/lib/supabase-admin": { supabaseAdmin },
  "@/lib/paid-feature-usage": {
    getPaidFeatureUsageEvent,
    getUserFeatureCreditBalance: async () => ({ remaining_uses: 1 }),
    makePaidFeatureUsageKey: (feature, criteria) => {
      assert.equal(feature, "cadastru_lookup");
      return key(criteria);
    },
    consumePaidFeatureCredit: async ({ userId, idempotencyKey }) => {
      spends++;
      if (!allowSpend) return { allowed: false };
      usage.set(`${userId}:${idempotencyKey}`, { source: "paid_credit" });
      return { allowed: true };
    },
  },
  "@/lib/cadastru-records": {
    getCadastruRecordByNumber: async (value) => ({ payload: value === number ? payload : { cadastral_number: value } }),
    getCadastruRecordByAddress: async (value) => value === address ? { payload: addressPayload } : null,
  },
  "@/lib/cadastru-cache": { withCadastruFreshness: (entry) => entry.payload },
  "@/lib/cadastru-property-details": { cadastruReportBlockedByRegistry },
  "@/lib/cadastru-nearby": { nearbyAddressFromCadastru: () => null, nearbyInputFromCadastru: () => null, validNearbyResult: () => false },
  "@/lib/cadastru-nearby-storage": { nearbyFromStorage: () => null, getStoredNearby: () => null },
  "@/lib/cadastru-public-transport": { publicTransportInputFromCadastru: () => null },
  "@/lib/cadastru-public-transport-storage": { publicTransportFromStorage: () => null, getStoredPublicTransport: () => null },
  "@/lib/cadastru-municipal-reports": { municipalReportsAvailableForCadastru: () => false, municipalReportsInputFromCadastru: () => null },
  "@/lib/cadastru-municipal-reports-storage": { municipalReportsFromStorage: () => null, getStoredMunicipalReports: () => null },
  "@/lib/cadastru-map": { cadastruMapLocation: () => null },
  "@/lib/cadastru-map-preview": { renderCadastruReportMap: () => assert.fail("no coordinates") },
  "@/lib/cadastru-market": { loadCadastruMarket: async () => null },
  "@/lib/validation": { validateCadastralNumber },
  "@/lib/rate-limit": { rateLimit: () => ({ check: () => ({ allowed: true }) }) },
  "@/lib/cadastru-report-pdf": { renderCadastruReport: async (report) => {
    if (failRender) throw new Error("Render failed");
    renders++;
    assert(report.cadastral === payload || report.cadastral === addressPayload, "only stored payloads reach the renderer");
    return { bytes: new TextEncoder().encode("%PDF"), fileName: "catdai-cadastru.pdf" };
  } },
  "@/lib/language": { normalizeLanguage: () => "ro" },
  "@/lib/maib/client.mjs": { environment: () => "production" },
};

const context = vm.createContext({ console: { error: (...args) => errors.push(args) }, Response });
const routeModule = new vm.SourceTextModule(await readFile("src/app/api/cadastru/pdf/route.js", "utf8"), { context });
await routeModule.link((name) => {
  const exports = mocks[name] || (name.startsWith("@/locales/") ? { default: {} } : null);
  assert(exports, `Missing mock ${name}`);
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
});
await routeModule.evaluate();
const post = (body, user = "buyer") => routeModule.namespace.POST(new Request("https://catdai.md/api/cadastru/pdf", {
  method: "POST", body: JSON.stringify(body), headers: user ? { Authorization: `Bearer ${user}` } : {},
}));
const search = { cadastral_number: number };
const usageKey = key(search);
const buyerUsage = `buyer:${usageKey}`;
const order = { id: "paid-order", user_id: "buyer", product_key: "cadastru_lookup_single",
  environment: "production", status: "paid", paid_at: "2026-11-11",
  cadastru_delivery: { usage_key: usageKey, slug } };

usage.set(buyerUsage, { source: "free_monthly" });
assert.equal((await post(search, null)).status, 402);
const denied = await post({ ...search, paid: true, full_access: true, reportData: payload });
assert.equal(denied.status, 402);
assert.equal((await denied.json()).paid_credit_available, true);
assert.equal((await post({ ...search, check_only: true, use_paid_credit: true })).status, 402);
assert.equal((await post({ share_slug: slug }, null)).status, 402);
assert.equal(renders, 0);
assert.equal(spends, 0);

payload.registry_unavailable = true;
assert.equal((await (await post(search)).json()).paid_credit_available, false, "bare recovery cannot apply a credit");
payload.lands = [{ cadastral_number: "0100201.999", estimated_value_lei: "120000" }];
assert.equal((await (await post(search)).json()).paid_credit_available, true, "a verified parcel report can apply a credit");
delete payload.registry_unavailable;
delete payload.lands;

orders.push({ ...order, status: "registered", paid_at: null });
assert.equal((await post(search)).status, 402, "pending order cannot export");
orders[0] = { ...order, environment: "sandbox" };
usage.set(buyerUsage, { source: "paid_credit", metadata: { maib_order_id: order.id } });
assert.equal((await post(search)).status, 402, "sandbox payment cannot authorize a production PDF");
orders[0] = { ...order, status: "refunded" };
assert.equal((await post(search)).status, 402, "refunded MAIB credit cannot authorize a PDF");

orders[0] = order;
usage.delete(buyerUsage);
allowSpend = true;
assert.equal((await post(search, "other")).status, 402, "another user cannot reuse an order");
assert.equal((await post({ cadastral_number: other, address })).status, 402, "the order cannot authorize another property");
assert.equal((await post({ ...search, check_only: true })).status, 200);
assert.equal(renders, 0, "the entitlement check does not render");
assert.equal(spends, 0, "the entitlement check does not consume the purchase");
assert.equal(deferred.length, 0, "denied requests and entitlement checks do not schedule events");
const pdf = await post({ ...search, payload: { untrusted: true } });
assert.equal(pdf.headers.get("Content-Type"), "application/pdf");
assert.equal(pdf.headers.get("Cache-Control"), "private, no-store");
assert.equal(await pdf.text(), "%PDF");
assert.equal((await post({ share_slug: slug }, null)).status, 200, "verified receipt link can export");
assert.equal(spends, 1, "a verified checkout uses one paid credit for its result");

orders.length = 0;
assert.equal((await post({ address, use_paid_credit: true })).status, 200);
assert.equal((await post({ address })).status, 200);
assert.equal((await post({ address, use_paid_credit: true })).status, 200, "retries reuse the same paid unlock");
assert.equal(spends, 2);
assert.equal(pdfEvents.length, 0, "statistics writes run after the response");
assert.equal(deferred.length, 5, "every successful generation, including a paid share and repeat exports, schedules one event");
for (const callback of deferred.splice(0)) await callback();
assert.equal(pdfEvents.length, 5);

failRender = true;
assert.equal((await post({ address })).status, 503);
failRender = false;
collectStatistics = false;
assert.equal((await post({ address })).status, 200);
collectStatistics = true;
persistStatistics = false;
assert.equal((await post({ address })).status, 200);
persistStatistics = true;
assert.equal(deferred.length, 0, "failed renders and excluded requests do not schedule events");

failInsert = true;
assert.equal((await post({ address })).status, 200);
await deferred.shift()();
assert.equal(pdfEvents.length, 5);
assert(errors.some(([message]) => message === "[cadastru/pdf] statistics insert failed:"));
console.log("Cadastru PDF entitlement and generation statistics checks passed.");
