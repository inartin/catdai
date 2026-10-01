// Isolated API regression checks; no network or live database writes.
// pnpm exec node --experimental-vm-modules scripts/test-news-views.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import * as crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server.js";

const postId = "11111111-1111-4111-8111-111111111111";
const otherPost = "22222222-2222-4222-8222-222222222222";
const visitorId = "33333333-3333-4333-8333-333333333333";
const otherVisitor = "44444444-4444-4444-8444-444444444444";
const rows = new Set();
let persist = true;
let allowed = true;
let databaseError = null;
let rpcCalls = 0;
let aggregateRows = null;
const supabaseAdmin = {
  from(table) {
    assert.equal(table, "news_post_views");
    return {
      async upsert(row, options) {
        assert.equal(options.onConflict, "news_post_id,visitor_id");
        assert.equal(options.ignoreDuplicates, true);
        if (databaseError) return { error: databaseError };
        if (![postId, otherPost].includes(row.news_post_id)) return { error: { code: "23503" } };
        rows.add(`${row.news_post_id}:${row.visitor_id}`);
        return { error: null };
      },
    };
  },
  async rpc(name, { post_ids: ids }) {
    assert.equal(name, "news_post_view_counts");
    rpcCalls++;
    return {
      data: aggregateRows || ids.map((id) => ({
        news_post_id: id,
        view_count: [...rows].filter((key) => key.startsWith(`${id}:`)).length,
      })),
      error: null,
    };
  },
};
const mocks = {
  "node:crypto": crypto,
  "@/lib/supabase-admin": { supabaseAdmin },
  "@/lib/runtime-persistence": { shouldPersistRuntimeData: () => persist },
  "@/lib/rate-limit": { rateLimit: () => ({ check: () => ({ allowed }) }) },
  "next/server": { NextResponse },
};
const environment = { NEWS_VIEW_COOKIE_SECRET: "isolated-news-view-test-secret" };
let now = Date.now();
const context = vm.createContext({
  console: { error() {} }, URL, Response, Buffer,
  process: { env: environment },
  Date: class extends Date { static now() { return now; } },
});
const modules = new Map();
async function load(id) {
  if (modules.has(id)) return modules.get(id);
  const mock = mocks[id];
  const loadedModule = mock
    ? new vm.SyntheticModule(Object.keys(mock), function () {
      for (const [key, value] of Object.entries(mock)) this.setExport(key, value);
    }, { context })
    : new vm.SourceTextModule(await fs.readFile(id.startsWith("@/") ? `src/${id.slice(2)}.js` : id, "utf8"), { context });
  modules.set(id, loadedModule);
  await loadedModule.link(load);
  return loadedModule;
}
const route = await load("src/app/api/news/views/route.js");
await route.evaluate();
const { POST } = route.namespace;
const { createNewsVisitorCookie, readNewsVisitorCookie, NEWS_VISITOR_COOKIE } = modules.get("@/lib/news-visitor-cookie").namespace;
const firstCookie = createNewsVisitorCookie(visitorId);
const otherCookie = createNewsVisitorCookie(otherVisitor);
function request(body, cookie = firstCookie, origin = "https://catdai.md", url = "https://catdai.md/api/news/views") {
  return new NextRequest(url, {
    method: "POST", headers: {
      "Content-Type": "application/json", origin,
      ...(cookie ? { cookie: `${NEWS_VISITOR_COOKIE}=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
const view = (post = postId, cookie = firstCookie) => POST(request({ post_id: post }, cookie));

assert.equal(readNewsVisitorCookie(firstCookie), visitorId);
assert.equal(readNewsVisitorCookie(firstCookie.replace(visitorId, otherVisitor)), null, "Changing the visitor ID breaks the signature");
assert.equal(readNewsVisitorCookie(`${firstCookie}.extra`), null);
assert.equal(readNewsVisitorCookie("invalid"), null);
now += 366 * 86400 * 1000;
assert.equal(readNewsVisitorCookie(firstCookie), null, "Expired signatures are rejected");
now -= 366 * 86400 * 1000;

const bootstrap = await view(postId, null);
assert.equal((await bootstrap.json()).cookie_required, true);
assert.equal(rows.size, 0, "Cookie issuance must not record a view");
const issuedCookie = bootstrap.cookies.get(NEWS_VISITOR_COOKIE).value;
assert.ok(readNewsVisitorCookie(issuedCookie));
const cookieHeader = bootstrap.headers.get("set-cookie");
assert.match(cookieHeader, /HttpOnly/);
assert.match(cookieHeader, /Secure/);
assert.match(cookieHeader, /SameSite=lax/i);
assert.match(cookieHeader, /Path=\/api\/news\/views/);
assert.match(cookieHeader, /Max-Age=31536000/);
const localBootstrap = await POST(request({ post_id: postId }, null, "http://localhost:3000", "http://localhost:3000/api/news/views"));
assert.doesNotMatch(localBootstrap.headers.get("set-cookie"), /Secure/);
const proxiedRequest = request({ post_id: postId }, null, "https://catdai.md", "http://localhost:3000/api/news/views");
proxiedRequest.headers.set("x-forwarded-proto", "https");
const proxiedBootstrap = await POST(proxiedRequest);
assert.equal(proxiedBootstrap.status, 200, "Public origin is accepted behind the internal HTTP proxy");
assert.equal((await proxiedBootstrap.json()).cookie_required, true);
assert.match(proxiedBootstrap.headers.get("set-cookie"), /Secure/);
const foreignRequest = request({ post_id: postId }, firstCookie, "https://example.com", "http://localhost:3000/api/news/views");
foreignRequest.headers.set("x-forwarded-host", "example.com");
assert.equal((await POST(foreignRequest)).status, 403, "Untrusted forwarded hosts cannot allow a foreign origin");
environment.NEXT_PUBLIC_SITE_URL = "https://preview.catdai.md";
assert.equal((await POST(request({ post_id: "invalid" }, null, "https://preview.catdai.md", "http://localhost:3000/api/news/views"))).status, 400, "Configured public origins reach article validation");
delete environment.NEXT_PUBLIC_SITE_URL;
const invalidCookie = await view(postId, firstCookie.replace(visitorId, otherVisitor));
assert.equal((await invalidCookie.json()).cookie_required, true);
assert.equal(rows.size, 0, "Tampered cookies cannot select a visitor or create a view");

assert.equal((await (await view()).json()).count, 1);
await Promise.all([view(), view(), view()]);
assert.equal((await (await view()).json()).count, 1, "Repeat and concurrent visits count once");
assert.equal((await (await view(postId, otherCookie)).json()).count, 2, "Another browser adds one view");
assert.equal((await (await POST(request({ post_id: postId, visitor_id: otherVisitor }))).json()).count, 2, "Submitted visitor IDs cannot inflate views");
assert.equal((await (await view(otherPost)).json()).count, 1, "Each article has independent views");
persist = false;
const localResponse = await view(otherPost, null);
assert.equal((await localResponse.json()).count, 1, "Default local mode does not write");
assert.equal(localResponse.headers.get("set-cookie"), null, "Read-only local mode does not create a tracking cookie");
persist = true;
assert.equal((await view("invalid")).status, 400);
assert.equal((await view("55555555-5555-4555-8555-555555555555")).status, 404);
assert.equal((await POST(request({ post_id: postId }, firstCookie, "https://example.com"))).status, 403);
assert.equal((await POST(new NextRequest("https://catdai.md/api/news/views", { method: "POST", body: "{" }))).status, 400);
allowed = false;
assert.equal((await view()).status, 429);
allowed = true;
databaseError = { code: "42P01", message: "Missing table" };
assert.equal((await view()).status, 503, "Missing migration is not reported as a recorded view");
databaseError = null;

delete environment.NEWS_VIEW_COOKIE_SECRET;
assert.equal((await view()).status, 503, "Signing without a configured secret fails closed");
environment.SUPABASE_SERVICE_KEY = "isolated-fallback-secret";
assert.equal(readNewsVisitorCookie(createNewsVisitorCookie(visitorId)), visitorId, "Existing server key supports deployment without extra configuration");
delete environment.SUPABASE_SERVICE_KEY;
environment.NEWS_VIEW_COOKIE_SECRET = "isolated-news-view-test-secret";

// Simulate automatic browser cookie handling for the actual client helper.
let browserCookie = null;
let requests = 0;
context.fetch = async (url, options) => {
  assert.equal(url, "/api/news/views");
  assert.equal(options.credentials, "same-origin");
  requests++;
  const response = await POST(request(JSON.parse(options.body), browserCookie));
  browserCookie = response.cookies.get(NEWS_VISITOR_COOKIE)?.value || browserCookie;
  return response;
};
const tracking = await load("src/lib/news-view-tracking.js");
await tracking.evaluate();
const { recordNewsView } = tracking.namespace;
const [firstVisit, duplicateVisit] = await Promise.all([recordNewsView(postId), recordNewsView(postId)]);
assert.equal(firstVisit.count, 3);
assert.equal(duplicateVisit.count, 3, "Simultaneous mounts establish one browser identity");
assert.equal(requests, 3, "One cookie bootstrap plus one request per mount");
assert.equal((await recordNewsView(postId)).count, 3);
assert.equal(requests, 4, "Established cookies need only one request");
context.fetch = async () => {
  requests++;
  return NextResponse.json({ cookie_required: true });
};
const beforeBlocked = requests;
assert.equal(await recordNewsView(postId), null);
assert.equal(requests - beforeBlocked, 2, "Cookie-blocked browsers stop after one retry");
context.fetch = async () => { throw new Error("Offline"); };
await assert.rejects(recordNewsView(postId), /Offline/);
context.fetch = async () => NextResponse.json({ count: 3 });
assert.equal((await recordNewsView(postId)).count, 3, "A failed request does not block later views");

const { fetchNewsViewCounts } = modules.get("@/lib/news-views").namespace;
const callsBefore = rpcCalls;
assert.equal(Object.keys(await fetchNewsViewCounts(["invalid"])).length, 0);
assert.equal(rpcCalls, callsBefore);
aggregateRows = [{ news_post_id: postId, view_count: "1501" }];
assert.equal((await fetchNewsViewCounts([postId, postId]))[postId], 1501, "Aggregate totals can exceed 1000 rows");
console.log("News view checks passed: signed/expired/tampered cookies, cookie flags and bootstrap, ignored body IDs, deduplication, persistence guard, API errors, concurrent mounts, blocked cookies, network recovery, aggregate counts.");
