// Isolated sharing API and PostgreSQL access checks. No live database writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-sharing.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { validateCadastralNumber } from "../src/lib/validation.js";
import { decodeCadastruShareCode, getCadastruSharePath } from "../src/lib/cadastru-share-url.js";

// Every saved slug has a reversible, URL-safe short form, including leading zeros.
for (const slug of ["0".repeat(48), "f".repeat(48), "fb".repeat(24),
  "000102030405060708090a0b0c0d0e0f1011121314151617", ...Array.from({ length: 100 }, () => crypto.randomBytes(24).toString("hex"))]) {
  for (const lang of ["ro", "ru"]) {
    const path = getCadastruSharePath(slug, lang);
    const code = path.split("/").at(-1);
    assert.match(path, new RegExp(`^/${lang}/c/[A-Za-z0-9_-]{32}$`));
    assert.equal(code, Buffer.from(slug, "hex").toString("base64url"));
    assert.equal(decodeCadastruShareCode(code), slug);
    assert.equal(`https://catdai.md${path}`.length, 55);
  }
}
for (const code of [null, undefined, "", "a".repeat(31), "a".repeat(33), "/".repeat(32), "+".repeat(32), "a".repeat(31) + "=", "é".repeat(32)]) {
  assert.equal(decodeCadastruShareCode(code), null);
}
assert.throws(() => getCadastruSharePath("invalid"));
assert(getCadastruSharePath("0".repeat(48), "invalid").startsWith("/ro/c/"));

const number = "0100106.131.01.097";
const address = "Chișinău, strada Test 1";
const official = { status: "success", cadastral_number: number, apartment: { area_m2: 52 },
  cadastru_evaluation_token: "private-search-token", access_limit: { purchase: {} }, access_tier: "free" };
let payload = official;
let userId = "user-1", persistent = true, collect = true, creditReason = "already_consumed";
let storageError = false, lookupCalls = [], creditKeys = [], rows = [];
let allowed = true;
const clone = (value) => structuredClone(value);
const supabaseAdmin = { from(table) {
  assert.equal(table, "cadastru_shared_reports");
  const filters = [];
  const query = {
    select: () => query,
    eq(key, value) { filters.push((row) => row[key] === value); return query; },
    async maybeSingle() {
      return storageError ? { error: { message: "offline" } }
        : { data: clone(rows.find((row) => filters.every((filter) => filter(row))) || null) };
    },
    async insert(row) {
      if (storageError) return { error: { message: "offline" } };
      rows.push(clone(row));
      return { error: null };
    },
  };
  return query;
} };
const stable = (value) => value && typeof value === "object"
  ? Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const keyFor = (feature, value) => `${feature}:${JSON.stringify(stable(value))}`;
const mocks = {
  "node:crypto": { default: crypto },
  "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
  "@/lib/supabase-admin": { supabaseAdmin },
  "@/lib/access-tier": { resolveAccessTier: async () => ({ user_id: userId }) },
  "@/lib/cadastru-share-statistics": { resolveCadastruShareSearch: async (token) => token === "source-1" ? 1 : token === "source-2" ? 2 : null },
  "@/lib/paid-feature-usage": {
    makePaidFeatureUsageKey: keyFor,
    checkFeatureAccess: async (args) => {
      creditKeys.push(args);
      return { allowed: ["already_consumed", "has_credit", "has_free_credit"].includes(creditReason), reason: creditReason };
    },
  },
  "@/lib/cadastru-records": {
    getCadastruRecordByNumber: async (value) => { lookupCalls.push(["number", value]); return payload ? { payload: clone(payload) } : null; },
    getCadastruRecordByAddress: async (value) => { lookupCalls.push(["address", value]); return payload ? { payload: clone(payload) } : null; },
  },
  "@/lib/cadastru-cache": { cleanCadastruPayload: (value) => {
    const result = { ...value };
    for (const key of ["access_tier", "access_limit", "locked_sections"]) delete result[key];
    return result;
  } },
  "@/lib/runtime-persistence": { shouldPersistRuntimeData: () => persistent },
  "@/lib/statistics-context": { shouldCollectStatistics: () => collect, withStatisticsContext: (handler) => handler },
  "@/lib/rate-limit": { rateLimit: () => ({ check: () => ({ allowed, retryAfter: 60 }) }) },
  "@/lib/validation": { validateCadastralNumber },
  "@/lib/cadastru-share-url": { getCadastruSharePath },
};
async function load(file) {
  const context = vm.createContext({ console: { error() {} }, URL, process: { env: { NODE_ENV: "production" } } });
  const loadedModule = new vm.SourceTextModule(await fs.readFile(file, "utf8"), { context });
  await loadedModule.link((name) => {
    assert(mocks[name], `Unexpected import: ${name}`);
    return new vm.SyntheticModule(Object.keys(mocks[name]), function () {
      for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
    }, { context });
  });
  await loadedModule.evaluate();
  return loadedModule.namespace;
}
const { POST } = await load("src/app/api/cadastru/share/route.js");
const { GET } = await load("src/app/api/cadastru/share/[slug]/route.js");
const post = (body = { cadastral_number: number }) => POST(new Request("https://catdai.md/api/cadastru/share", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));
const get = (slug) => GET(new Request(`https://catdai.md/api/cadastru/share/${slug}`), { params: Promise.resolve({ slug }) });

userId = null;
assert.equal((await post()).status, 401);
assert.equal(lookupCalls.length, 0, "anonymous requests never read the official payload");
userId = "user-1";
assert.equal((await post({ cadastral_number: "invalid" })).status, 400);
assert.equal((await post({ address: "x".repeat(501) })).status, 400);
assert.equal((await post(null)).status, 400);
allowed = false;
assert.equal((await post()).status, 429);
allowed = true;
persistent = false;
assert.equal((await post()).status, 503, "no ordinary URL fallback when persistence is disabled");
persistent = true;
for (const reason of ["has_credit", "has_free_credit", "no_credit", "free_monthly_limit_reached"]) {
  creditReason = reason;
  assert.equal((await post()).status, 403, "unused balances never authorize unlimited public reports");
}
creditReason = "already_consumed";
payload = null;
assert.equal((await post()).status, 404);
payload = { ...official, locked_sections: { cadastru_details: true } };
assert.equal((await post()).status, 404);
payload = official;
const created = await post({ cadastral_number: number, lang: "ru", payload: { apartment: { area_m2: 999 } } });
assert.equal(created.status, 200);
const shared = await created.json();
assert.match(shared.slug, /^[a-f0-9]{48}$/);
assert.equal(shared.url, `https://catdai.md${getCadastruSharePath(shared.slug, "ru")}`);
assert.equal(rows.length, 1);
assert.equal(rows[0].payload.apartment.area_m2, 52, "the server ignores injected client report data");
assert(!("cadastru_evaluation_token" in rows[0].payload));
assert(!("access_limit" in rows[0].payload));
assert.equal(rows[0].collect_statistics, true);
const repeated = await (await post()).json();
assert.equal(repeated.slug, shared.slug);
assert.equal(repeated.url, `https://catdai.md${getCadastruSharePath(shared.slug, "ro")}`);
assert.equal(rows.length, 1, "unchanged reports reuse their link");
const firstSearch = await (await post({ cadastral_number: number, search_token: "source-1" })).json();
const sameSearch = await (await post({ cadastral_number: number, search_token: "source-1" })).json();
const repeatedSearch = await (await post({ cadastral_number: number, search_token: "source-2" })).json();
assert.equal(firstSearch.slug, sameSearch.slug);
assert.notEqual(firstSearch.slug, repeatedSearch.slug, "Repeated searches retain separate share attribution");
assert.equal(rows.find((row) => row.slug === firstSearch.slug).search_event_id, 1);

userId = null;
payload = null;
const beforeReads = lookupCalls.length;
const publicResponse = await get(shared.slug);
assert.equal(publicResponse.status, 200);
assert.equal(publicResponse.headers.get("Cache-Control"), "no-store");
assert.equal((await publicResponse.json()).cadastral.apartment.area_m2, 52);
assert.equal(lookupCalls.length, beforeReads, "public reads survive missing/expired source records");
assert.equal((await get("not-a-slug")).status, 404);
assert.equal((await get("0".repeat(48))).status, 404);
storageError = true;
assert.equal((await get(shared.slug)).status, 503);
storageError = false;

// Address aggregates authorize the exact same usage key as the existing address API.
userId = "user-2";
collect = false;
payload = { status: "success", request_address: address, lands: [{ cadastral_number: "0100106.131" }], buildings: [] };
const aggregate = await post({ address: `  ${address}  ` });
assert.equal(aggregate.status, 200);
assert.equal(creditKeys.at(-1).idempotencyKey, keyFor("cadastru_lookup", { address: address.toLowerCase() }));
assert.equal(rows.at(-1).collect_statistics, false);
assert.equal(lookupCalls.at(-1)[0], "address");
payload = { ...official, cadastral_number: "1014203.418" };
assert.equal((await post({ cadastral_number: "1014203418" })).status, 200);
assert.equal(lookupCalls.at(-1)[1], "1014203.418");
storageError = true;
assert.equal((await post()).status, 503);
console.log("Sharing API passed: login/unlock checks, no new credit consumption, official snapshots, public reads, deduplication, address/number identities and storage failures.");

const db = new PGlite();
await db.exec("create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls;");
await db.exec(await fs.readFile("supabase/migrations/20261019184740_cadastru_shared_reports.sql", "utf8"));
const owner = crypto.randomUUID();
await db.query("insert into auth.users values ($1)", [owner]);
await db.exec("set role service_role");
await db.query("insert into cadastru_shared_reports(slug,sharer_user_id,report_hash,payload) values ($1,$2,$3,$4)",
  [shared.slug, owner, "report-hash", { status: "success" }]);
assert.equal((await db.query("select count(*)::int as total from cadastru_shared_reports")).rows[0].total, 1);
await assert.rejects(db.query("update cadastru_shared_reports set payload='{}'"), /permission denied/);
await db.exec("reset role");
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  for (const sql of ["select * from cadastru_shared_reports", "insert into cadastru_shared_reports(slug,report_hash,payload) values (repeat('a',48),'forged','{}')",
    "update cadastru_shared_reports set payload='{}'", "delete from cadastru_shared_reports"]) {
    await assert.rejects(db.exec(sql), /permission denied/, `${role}: ${sql}`);
  }
  await db.exec("reset role");
}
await db.query("delete from auth.users where id=$1", [owner]);
assert.equal((await db.query("select sharer_user_id from cadastru_shared_reports")).rows[0].sharer_user_id, null,
  "an explicitly shared report remains available if its creator deletes their account");
await db.close();
console.log("Sharing SQL passed: server-only reads/inserts, denied browser listing/writes, immutable snapshots and retained public links.");

// The button copies only a generated public URL, including clipboard-denied cases.
const require = createRequire(import.meta.url);
const { transform, loadBindings } = require("next/dist/build/swc");
await loadBindings();
const slots = [];
let cursor = 0, shareCalls = 0, copied = "", failedRequest = false, deniedClipboard = false;
const recordedClicks = [];
const jsx = (type, props) => ({ type, props });
const { code } = await transform(await fs.readFile("src/components/CadastruShareButton.js", "utf8"), {
  filename: "src/components/CadastruShareButton.js",
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  module: { type: "es6" },
});
const context = vm.createContext({ URLSearchParams, window: { location: { origin: "https://catdai.md" } },
  navigator: { clipboard: { writeText: async (url) => { if (deniedClipboard) throw new Error("denied"); copied = url; } } },
  fetch: async (url) => {
    assert.equal(url, "/api/cadastru/share");
    shareCalls++;
    return { ok: !failedRequest, json: async () => ({ url: shared.url, slug: shared.slug }) };
  },
});
const component = new vm.SourceTextModule(code, { context });
const jsxMocks = {
  react: { useEffect() {}, useState(initial) {
    const index = cursor++;
    if (!(index in slots)) slots[index] = initial;
    return [slots[index], (value) => { slots[index] = value; }];
  } },
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
  "@/context/AuthContext": { useAuth: () => ({ session: { access_token: "token" } }) },
  "@/lib/cadastru-share-tracking": { recordCadastruShareClick: (slug) => recordedClicks.push(slug) },
  "@/lib/cadastru-share-url": { getCadastruSharePath },
  "@/context/LanguageContext": { useTranslation: () => ({ lang: "ru", t: (key) => key }) },
};
await component.link((name) => new vm.SyntheticModule(Object.keys(jsxMocks[name]), function () {
  for (const [key, value] of Object.entries(jsxMocks[name])) this.setExport(key, value);
}, { context }));
await component.evaluate();
function renderButton(props = {}) { cursor = 0; return component.namespace.default({ cadastralNumber: number, ...props }); }
function find(node, predicate) {
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (!node || typeof node !== "object") return null;
  return predicate(node) ? node : find(node.props?.children, predicate);
}
await find(renderButton(), (node) => node.type === "button").props.onClick();
assert.equal(copied, shared.url);
assert.equal(recordedClicks.length, 1);
slots.length = 0;
copied = "";
failedRequest = true;
await find(renderButton(), (node) => node.type === "button").props.onClick();
assert.equal(copied, "", "a failed share never copies the normal browser URL");
assert.equal(recordedClicks.length, 1, "Failed creation does not record a share");
assert(find(renderButton(), (node) => node.props?.role === "alert"));
slots.length = 0;
failedRequest = false;
deniedClipboard = true;
await find(renderButton(), (node) => node.type === "button").props.onClick();
assert.equal(find(renderButton(), (node) => node.type === "input").props.value, shared.url,
  "the generated public link can be copied manually if clipboard access fails");
slots.length = 0;
deniedClipboard = false;
const beforeShareCalls = shareCalls;
await find(renderButton({ shareSlug: shared.slug }), (node) => node.type === "button").props.onClick();
assert.equal(shareCalls, beforeShareCalls, "public viewers can re-share without creating another report");
assert.equal(recordedClicks.length, 3, "Both manual-copy shares and public re-shares are counted");
assert.equal(copied, shared.url);
console.log("Share button passed: generated link copying, explicit errors, clipboard fallback and public re-sharing.");

// The short route decodes into the existing viewer and rejects malformed codes.
const { code: routeCode } = await transform(await fs.readFile("src/app/c/[code]/page.js", "utf8"), {
  filename: "src/app/c/[code]/page.js",
  jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
  module: { type: "es6" },
});
const shortRoute = new vm.SourceTextModule(routeCode, { context });
const ResultPage = () => null;
const routeMocks = {
  "next/navigation": { notFound() { throw new Error("404"); } },
  "@/app/cadastru/rezultat/page": { default: ResultPage },
  "@/lib/cadastru-share-url": { decodeCadastruShareCode },
  "react/jsx-runtime": { jsx },
};
await shortRoute.link((name) => new vm.SyntheticModule(Object.keys(routeMocks[name]), function () {
  for (const [key, value] of Object.entries(routeMocks[name])) this.setExport(key, value);
}, { context }));
await shortRoute.evaluate();
const shortPage = await shortRoute.namespace.default({ params: Promise.resolve({ code: new URL(shared.url).pathname.split("/").at(-1) }) });
assert.equal(shortPage.type, ResultPage);
assert.equal(shortPage.props.shareSlug, shared.slug);
await assert.rejects(shortRoute.namespace.default({ params: Promise.resolve({ code: "invalid" }) }), /404/);
console.log("Compact sharing passed: reversible 55-character RO/RU URLs, existing report reuse and invalid-route rejection.");
