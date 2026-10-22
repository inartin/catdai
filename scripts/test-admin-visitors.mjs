// Isolated visitor identity, history authorization, UI and additive schema checks.
// pnpm exec node --experimental-vm-modules scripts/test-admin-visitors.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const visitorId = "11111111-1111-4111-8111-111111111111";
const storage = new Map([["catdai-device-id", visitorId]]);
let blocked = false, authorized = true, failHistory = false;
const queries = [];
const context = vm.createContext({ console, crypto, Headers, Date, URL, URLSearchParams,
  localStorage: { getItem: (key) => { if (blocked) throw new Error("blocked"); return storage.get(key); }, setItem: (key, value) => storage.set(key, value) },
  document: { cookie: "" }, window: { location: { protocol: "https:" } },
});
const mocks = {
  "next/server": { NextResponse: { json: (data, options) => Response.json(data, options) } },
  "@/lib/admin-auth": { requireAdminApiAuth: () => authorized ? null : Response.json({}, { status: 401 }) },
  "@/lib/supabase-admin": { supabaseAdmin: {
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "member@example.test" } } }) } },
    from(source) {
      const query = { source }; queries.push(query);
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        or(filter) { query.or = filter; return builder; },
        eq(column, value) { query.eq = [column, value]; return builder; },
        is(column, value) { query.is = [column, value]; return builder; },
        order() { return builder; },
        async limit(value) { query.limit = value; return { error: failHistory ? { message: "unavailable" } : null,
          data: source === "cadastru_search_events" ? [{ id: 1, created_at: "2026-10-22T12:00:00Z", user_id: null, visitor: { device_id: visitorId }, search_address: "Example 1" }]
            : source === "estimate_log" ? [{ id: "estimate", created_at: "2026-10-22T13:00:00Z", user_id: "member", device_id: visitorId }] : [] }; },
      };
      return builder;
    },
  } },
  "react": React, "react-dom": ReactDOM, "react/jsx-runtime": jsxRuntime,
};
const modules = new Map();
async function moduleFor(id) {
  if (modules.has(id)) return modules.get(id);
  const mock = mocks[id];
  let source;
  if (!mock) {
    const file = id.startsWith("@/") ? `src/${id.slice(2)}.js` : id;
    source = await fs.readFile(file, "utf8");
    if (file.includes("AdminUserCell")) {
      const require = createRequire(import.meta.url);
      const { transform, loadBindings } = require("next/dist/build/swc");
      await loadBindings();
      source = (await transform(source, { filename: file,
        jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "es6" } })).code;
    }
  }
  const mod = mock ? new vm.SyntheticModule(Object.keys(mock), function () {
    for (const [key, value] of Object.entries(mock)) this.setExport(key, value);
  }, { context }) : new vm.SourceTextModule(source, { context, identifier: id });
  modules.set(id, mod); return mod;
}
async function load(id) {
  const mod = await moduleFor(id);
  if (mod.status === "unlinked") await mod.link(moduleFor);
  await mod.evaluate(); return mod.namespace;
}
const { getRequestVisitor, normalizeVisitorId } = await load("@/lib/visitor");
const visitor = (ua, headers = {}) => getRequestVisitor({ headers: new Headers({ "user-agent": ua, cookie: `other=x; catdai-device-id=${visitorId}`, ...headers }) });
assert.equal(visitor("Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/143.0.0.0 Mobile Safari/537.36").device_type, "Mobile");
assert.equal(visitor("Mozilla/5.0 (Linux; Android 10; K) Chrome/143.0.0.0 Mobile Safari/537.36").os, "Android");
assert.equal(visitor("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1").browser, "Safari");
assert.equal(visitor("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18 Mobile/15 Safari/605").device_type, "Tablet");
assert.equal(visitor("Mozilla/5.0 (Linux; Android 10) Chrome/143 Safari/537 SamsungBrowser/28.0").browser, "Samsung Internet");
assert.equal(visitor("Mozilla/5.0 (Windows NT 10.0) Chrome/143 Safari/537 Edg/143.0").browser, "Edge");
assert.equal(visitor("Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0").device_type, "Desktop");
assert.equal(visitor("Googlebot/2.1").device_type, "Bot");
assert.equal(getRequestVisitor({}).device_type, null, "Missing UA must not invent a desktop device");
assert.equal(visitor("test").device_id, visitorId);
assert.equal(normalizeVisitorId("bad,or=(user_id.not.is.null)"), null);
assert.equal(visitor("test", { "x-catdai-device-id": "invalid" }).device_id, visitorId);
const { getDeviceId } = await load("@/lib/visitor-browser");
assert.equal(getDeviceId(), visitorId, "Reuse existing browser identities");
assert.match(context.document.cookie, /SameSite=Lax; Secure/);
assert.equal(getDeviceId(), visitorId, "Repeat visits retain the same ID");
storage.clear(); const newId = getDeviceId(); assert.notEqual(newId, visitorId);
assert.equal(normalizeVisitorId(newId), newId);
blocked = true; assert.equal(getDeviceId(), null, "Blocked storage does not create false persistent identities"); blocked = false;

const { default: AdminUserCell } = await load("@/components/admin/AdminUserCell");
const snapshot = { device_id: visitorId, device_type: "Mobile", os: "Android", browser: "Chrome" };
const anonymous = renderToStaticMarkup(React.createElement(AdminUserCell, { row: { visitor: snapshot } }));
assert.match(anonymous, />Anonymous<\/button>/);
assert.match(anonymous, /#11111111/);
for (const token of ["Mobile", "Android", "Chrome", "bg-blue-50", "bg-emerald-50", "bg-violet-50", "text-\[10px\]"]) assert(anonymous.includes(token), token);
const signedIn = renderToStaticMarkup(React.createElement(AdminUserCell, { row: { visitor: snapshot, user_id: "member", user_name: "Alex" } }));
assert.match(signedIn, />Alex<\/button>/); assert(!signedIn.includes("Anonymous"));
assert(!renderToStaticMarkup(React.createElement(AdminUserCell, { row: {} })).includes("Mobile"));
assert.match(renderToStaticMarkup(React.createElement(AdminUserCell, { row: { device_id: visitorId } })), /11111111/);

const { GET } = await load("src/app/api/admin/visitors/[id]/route.js");
const history = (id = visitorId) => GET({}, { params: Promise.resolve({ id }) });
authorized = false; assert.equal((await history()).status, 401); assert.equal(queries.length, 0);
authorized = true; assert.equal((await history("invalid")).status, 400); assert.equal(queries.length, 0);
const response = await history(); assert.equal(response.status, 200);
const data = await response.json(); assert.equal(data.events.length, 2);
assert.equal(data.events[0].user_name, "member@example.test"); assert.equal(data.events[1].user_id, null);
assert.equal(response.headers.get("cache-control"), "private, no-store");
assert(queries.every((query) => query.limit === 100 && (query.or?.includes(visitorId) || query.eq?.[1] === visitorId)));
assert.deepEqual(queries.find((query) => query.source === "cadastru_search_events").is, ["duplicate_of", null]);
failHistory = true; assert.equal((await history()).status, 500, "Partial history must not masquerade as complete");

const db = new PGlite();
const tables = ["estimate_log", "cadastru_search_events", "external_api_usage_events", "pdf_generation_events", "calculator_usage_events", "listing_link_analysis_events", "payment_checkout_events", "ad_source_events", "user_activity", "user_feedback", "user_listing_alerts"];
for (const table of tables) await db.exec(`create table ${table}(id text, created_at timestamptz); alter table ${table} enable row level security; insert into ${table}(id) values ('historical');`);
const migration = await fs.readFile("supabase/migrations/20261022191206_admin_visitor_device_tags.sql", "utf8");
await db.exec(migration); await db.exec(migration);
for (const table of tables) {
  assert.equal((await db.query(`select visitor from ${table} where id='historical'`)).rows[0].visitor, null);
  assert.equal((await db.query("select relrowsecurity from pg_class where relname=$1", [table])).rows[0].relrowsecurity, true);
}
await db.query("insert into cadastru_search_events(id,visitor) values ('new',$1)", [JSON.stringify(snapshot)]);
assert.equal((await db.query("select id from cadastru_search_events where visitor->>'device_id'=$1", [visitorId])).rows[0].id, "new");
await db.close();
console.log("Visitor checks passed: identity reuse, UA labels, missing/blocked storage, shared user-cell tags, protected history, additive/idempotent schema and preserved RLS/history.");
