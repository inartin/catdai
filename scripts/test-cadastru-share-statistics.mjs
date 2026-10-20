// Isolated route, browser tracking and PostgreSQL checks; no live writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-share-statistics.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server.js";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
await db.exec("create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls; create table cadastru_search_events(id bigint primary key, user_id uuid, cadastral_number text, search_address text);");
for (const file of ["20261019184740_cadastru_shared_reports.sql", "20261019185731_cadastru_share_statistics.sql"]) {
  await db.exec(await fs.readFile(`supabase/migrations/${file}`, "utf8"));
}
const owner = crypto.randomUUID(), viewer = crypto.randomUUID(), otherOwner = crypto.randomUUID();
await db.query("insert into auth.users values ($1),($2),($3)", [owner, viewer, otherOwner]);
const number = "0100106.131.01.097";
await db.query("insert into cadastru_search_events values (1,$1,$2,null),(2,$1,$2,null),(3,$3,$2,null),(4,$1,null,'Chișinău, strada Test 1 ap 2')", [owner, number, otherOwner]);
await db.exec("alter table cadastru_search_events add column duplicate_of bigint;");
const slugs = ["a", "b", "c", "d"].map((value) => value.repeat(48));
for (let i = 0; i < slugs.length; i++) {
  await db.query("insert into cadastru_shared_reports(slug,sharer_user_id,report_hash,payload,search_event_id,collect_statistics) values($1,$2,$3,'{}',$4,$5)",
    [slugs[i], owner, String(i), i < 2 ? 1 : 2, i !== 3]);
}
let userId = null, collect = true, persistent = true, allowed = true, offline = false;
const supabaseAdmin = {
  async rpc(name, args) {
    assert.equal(name, "cadastru_share_statistics");
    if (offline) return { error: { message: "offline" } };
    return { data: (await db.query("select * from cadastru_share_statistics($1::bigint[])", [args.p_search_ids])).rows };
  },
  from(table) {
    assert(["cadastru_shared_reports", "cadastru_share_events", "cadastru_search_events"].includes(table));
    let columns = "*", operation = "select", row, options;
    const filters = [];
    const builder = {
      select(value) { columns = value; return builder; },
      eq(key, value) { filters.push([key, value]); return builder; },
      upsert(value, config) { operation = "upsert"; row = value; options = config; return builder; },
      async maybeSingle() {
        if (offline) return { error: { message: "offline" } };
        const result = await db.query(`select ${columns} from ${table} where ${filters.map(([key], index) => `${key}=$${index + 1}`).join(" and ")}`,
          filters.map(([, value]) => value));
        return { data: result.rows[0] || null };
      },
      then(resolve, reject) {
        if (offline) return Promise.resolve({ error: { message: "offline" } }).then(resolve, reject);
        assert.equal(operation, "upsert");
        const keys = Object.keys(row);
        return db.query(`insert into ${table}(${keys.join(",")}) values(${keys.map((_, index) => `$${index + 1}`).join(",")}) on conflict (${options.onConflict}) do nothing`, Object.values(row))
          .then(() => ({ error: null })).then(resolve, reject);
      },
    };
    return builder;
  },
};
const mocks = {
  "node:crypto": { default: crypto },
  "next/server": { NextResponse },
  "@/lib/supabase-admin": { supabaseAdmin },
  "@/lib/access-tier": { resolveAccessTier: async () => ({ user_id: userId }) },
  "@/lib/statistics-context": { shouldCollectStatistics: () => collect, withStatisticsContext: (handler) => handler },
  "@/lib/runtime-persistence": { shouldPersistRuntimeData: () => persistent },
  "@/lib/rate-limit": { rateLimit: () => ({ check: () => ({ allowed }) }) },
  "@/lib/seo": { getCanonicalSiteUrl: () => "https://catdai.md" },
};
const context = vm.createContext({ console: { error() {} }, Buffer, URL, Date,
  process: { env: { NODE_ENV: "production", ADMIN_TOKEN: "test-secret" } } });
const modules = new Map();
async function moduleFor(id) {
  if (modules.has(id)) return modules.get(id);
  const mock = mocks[id];
  const loaded = mock ? new vm.SyntheticModule(Object.keys(mock), function () {
    for (const [key, value] of Object.entries(mock)) this.setExport(key, value);
  }, { context }) : new vm.SourceTextModule(await fs.readFile(id.startsWith("@/") ? `src/${id.slice(2)}.js` : id, "utf8"), { context });
  modules.set(id, loaded);
  return loaded;
}
async function load(id) {
  const loaded = await moduleFor(id);
  if (loaded.status === "unlinked") await loaded.link(moduleFor);
  if (loaded.status !== "evaluated") await loaded.evaluate();
  return loaded.namespace;
}
const { POST } = await load("src/app/api/cadastru/share/[slug]/events/route.js");
const { CADASTRU_SHARE_VISITOR_COOKIE: cookieName, readCadastruShareVisitorCookie } = await load("@/lib/cadastru-share-visitor");
const send = (slug, body, cookie = "", origin = "https://catdai.md") => POST(new NextRequest(`https://catdai.md/api/cadastru/share/${slug}/events`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie ? `${cookieName}=${cookie}` : "" }, body: JSON.stringify(body),
}), { params: Promise.resolve({ slug }) });
const count = async () => Number((await db.query("select count(*) as total from cadastru_share_events")).rows[0].total);
const open = { event: "open" };
assert.equal((await send("invalid", open)).status, 400);
assert.equal((await send(slugs[0], { event: "invalid" })).status, 400);
assert.equal((await send(slugs[0], { event: "share" })).status, 400);
assert.equal((await send(slugs[0], open, "", "https://other.example")).status, 403);
assert.equal((await send("0".repeat(48), open)).status, 404);
allowed = false;
assert.equal((await send(slugs[0], open)).status, 429);
allowed = true;
const first = await send(slugs[0], open);
assert.equal((await first.json()).cookie_required, true);
const cookie = first.cookies.get(cookieName).value;
assert(readCadastruShareVisitorCookie(cookie));
assert(first.headers.get("set-cookie").includes("HttpOnly"));
assert.equal(await count(), 0, "A cookie must return before an anonymous view counts");
await send(slugs[0], open);
assert.equal(await count(), 0, "Blocked cookies do not generate a new visitor on every refresh");
const tampered = cookie.replace(cookie.slice(0, 8), "00000000");
assert.equal(readCadastruShareVisitorCookie(tampered), null);
await send(slugs[0], open, cookie);
await Promise.all([send(slugs[0], open, cookie), send(slugs[0], open, cookie)]);
assert.equal(await count(), 1, "Concurrent repeat opens are deduplicated in PostgreSQL");
await send(slugs[1], open, cookie);
userId = viewer;
await send(slugs[0], open);
await send(slugs[0], open, cookie);
await send(slugs[1], open);
assert.equal(await count(), 4, "The same account across browsers counts once per report link");
userId = owner;
await send(slugs[0], open, cookie);
assert.equal(await count(), 4, "The signed-in report owner is excluded");
userId = viewer;
collect = false;
await send(slugs[0], open);
collect = true;
await send(slugs[3], open);
persistent = false;
await send(slugs[0], open);
persistent = true;
assert.equal(await count(), 4, "Admin and disabled-persistence activity is excluded");
const share = { event: "share", event_id: crypto.randomUUID() };
await send(slugs[0], share);
await send(slugs[0], share);
userId = null;
await send(slugs[0], { event: "share", event_id: crypto.randomUUID() });
await send(slugs[1], { event: "share", event_id: crypto.randomUUID() });
const { loadCadastruShareStatistics, resolveCadastruShareSearch } = await load("@/lib/cadastru-share-statistics");
const stats = await loadCadastruShareStatistics([{ id: 1 }, { id: 2 }, { id: 3 }]);
assert.deepEqual(JSON.parse(JSON.stringify(stats)), [
  { id: 1, share_count: 3, unique_viewers: 2 }, { id: 2, share_count: 0, unique_viewers: 0 }, { id: 3, share_count: 0, unique_viewers: 0 },
], "Unique viewers are deduplicated across snapshots of a single search, never copied to repeated searches");
const { createCadastruEvaluationToken } = await load("@/lib/cadastru-evaluation-tracking");
const token = createCadastruEvaluationToken(1);
assert.equal(await resolveCadastruShareSearch(token, owner, number, "", {}), 1);
assert.equal(await resolveCadastruShareSearch(token, otherOwner, number, "", {}), null);
assert.equal(await resolveCadastruShareSearch(token, owner, "3153208.081", "", {}), null);
assert.equal(await resolveCadastruShareSearch("forged", owner, number, "", {}), null);
assert.equal(await resolveCadastruShareSearch(createCadastruEvaluationToken(4), owner, null,
  "Chișinău, strada Test 1 ap 2", {}), 4);
assert.equal(await resolveCadastruShareSearch(createCadastruEvaluationToken(4), owner, null,
  "Chișinău, strada Test 1 ap 3", {}), null, "Apartment numbers remain distinct");
offline = true;
assert.equal((await send(slugs[0], open, cookie)).status, 503);
await assert.rejects(loadCadastruShareStatistics([{ id: 1 }]), /unavailable/);
offline = false;

for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(db.exec("select * from cadastru_share_events"), /permission denied/);
  await assert.rejects(db.exec("select * from cadastru_share_statistics(array[1::bigint])"), /permission denied/);
  await assert.rejects(db.exec("insert into cadastru_share_events(id,report_slug,event_type) values(gen_random_uuid(),repeat('a',48),'share')"), /permission denied/);
  await db.exec("reset role");
}
await db.exec("set role service_role");
assert.equal((await db.query("select * from cadastru_share_statistics(array[1::bigint])")).rows[0].share_count, 3);
await db.exec("reset role");
await db.exec("insert into cadastru_share_events(id,report_slug,event_type) select gen_random_uuid(),repeat('a',48),'share' from generate_series(1,1001)");
assert.equal((await loadCadastruShareStatistics([{ id: 1 }]))[0].share_count, 1004, "Database aggregation has no API row-limit truncation");
await db.exec("delete from cadastru_search_events where id=1");
assert.equal((await db.query("select count(*)::int as n from cadastru_shared_reports where slug=repeat('a',48)")).rows[0].n, 1,
  "Deleting an admin search detaches its analytics without breaking the public report");
await db.close();
console.log("Share statistics passed: signed anonymous cookies, concurrent/account deduplication, own/admin exclusions, re-shares, exact search attribution, aggregation, errors and RLS.");

// Client requests serialize the anonymous-cookie handshake and retry it once.
let trackingCalls = [];
let blockCookies = false;
const clientContext = vm.createContext({ crypto });
const client = new vm.SourceTextModule(await fs.readFile("src/lib/cadastru-share-tracking.js", "utf8"), { context: clientContext });
await client.link(() => new vm.SyntheticModule(["fetchWithStatisticsAuth"], function () {
  this.setExport("fetchWithStatisticsAuth", async (url, options) => {
    const body = JSON.parse(options.body);
    trackingCalls.push({ url, options, body });
    return { ok: true, json: async () => ({ cookie_required: body.event === "open" && (blockCookies || trackingCalls.length === 1) }) };
  });
}, { context: clientContext }));
await client.evaluate();
await Promise.all([client.namespace.recordCadastruShareOpen(slugs[0]), client.namespace.recordCadastruShareOpen(slugs[0])]);
assert.equal(trackingCalls.length, 3);
trackingCalls = [];
blockCookies = true;
await client.namespace.recordCadastruShareOpen(slugs[0]);
assert.equal(trackingCalls.length, 2, "No infinite retries when cookies are blocked");
trackingCalls = [];
await client.namespace.recordCadastruShareClick(slugs[0]);
assert.equal(trackingCalls[0].body.event, "share");
assert.match(trackingCalls[0].body.event_id, /^[0-9a-f-]{36}$/);
assert.equal(trackingCalls[0].options.credentials, "same-origin");
console.log("Share tracking client passed: authenticated requests, serialized cookie handshake, bounded retry and unique click IDs.");
