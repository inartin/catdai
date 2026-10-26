// Live presence regression checks against a disposable Redis, without Supabase calls.
// pnpm exec node --experimental-vm-modules scripts/test-online-users.mjs
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createClient } from "redis";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "catdai-presence-"));
const socket = path.join(directory, "redis.sock");
const server = spawn("redis-server", ["--port", "0", "--unixsocket", socket,
  "--save", "", "--appendonly", "no"], { stdio: ["ignore", "pipe", "pipe"] });
let output = "";
server.stdout.on("data", (data) => { output += data; });
server.stderr.on("data", (data) => { output += data; });
const ready = new Promise((resolve, reject) => {
  server.once("error", reject);
  server.once("exit", () => reject(new Error(output || "Redis exited before starting")));
  server.stdout.on("data", () => { if (output.toLowerCase().includes("ready to accept connections")) resolve(); });
});
const startupTimeout = setTimeout(() => server.kill("SIGTERM"), 5_000);
const client = createClient({ socket: { path: socket, reconnectStrategy: false } });
client.on("error", () => {});

try {
  await ready;
  clearTimeout(startupTimeout);
  await client.connect();
  let now = Date.now();
  class Clock extends Date { static now() { return now; } }
  let available = true;
  const key = "catdai:online-users:v1";
  const browserA = "11111111-1111-4111-8111-111111111111";
  const browserB = "22222222-2222-4222-8222-222222222222";
  const users = {
    admin: { id: "admin", app_metadata: { catdai_is_admin: true } },
    member: { id: "member", app_metadata: {}, user_metadata: { catdai_is_admin: true } },
  };
  const mocks = {
    "node:async_hooks": { AsyncLocalStorage },
    "@/lib/cache": { getSharedCacheClient: async () => available ? client : null },
    "@/lib/seo": { getCanonicalSiteUrl: () => "https://catdai.test" },
    "@/lib/access-tier": { getRequestUser: async (request) => {
      const token = request.headers.get("authorization")?.replace("Bearer ", "");
      if (token === "outage") throw new Error("Auth unavailable");
      return { data: { user: users[token] || null }, error: token && !users[token] ? new Error("Invalid token") : null };
    } },
  };
  const context = vm.createContext({ Date: Clock, URL, Response, console: { error() {} } });
  const modules = new Map();
  async function moduleFor(id) {
    if (modules.has(id)) return modules.get(id);
    const mock = mocks[id];
    const mod = mock ? new vm.SyntheticModule(Object.keys(mock), function () {
      for (const [key, value] of Object.entries(mock)) this.setExport(key, value);
    }, { context }) : new vm.SourceTextModule(await fs.readFile(id.startsWith("@/") ? `src/${id.slice(2)}.js` : id, "utf8"), { context });
    modules.set(id, mod);
    return mod;
  }
  const route = await moduleFor("src/app/api/online-users/route.js");
  await route.link(moduleFor);
  await route.evaluate();
  const { GET, POST } = route.namespace;
  const request = (id = browserA, headers = {}, url = "https://catdai.test/api/online-users") => new Request(url, {
    method: "POST", headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/143.0 Safari/537.36",
      ...(id ? { "x-catdai-device-id": id } : {}), ...headers,
    },
  });
  async function count(response, expected) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(await response.text(), String(expected));
  }

  await count(await GET(), 0);
  assert.equal(await client.exists(key), 0, "Reading never creates presence");
  assert.equal((await POST(request(null))).status, 400);
  assert.equal((await POST(request("bad-id"))).status, 400);
  assert.equal((await POST(request(browserA, { origin: "https://other.test" }))).status, 403);
  assert.equal((await POST(request(browserA, { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal(await client.exists(key), 0, "Invalid requests do not write");

  await count(await POST(request()), 1);
  await count(await POST(request()), 1);
  const concurrent = await Promise.all(Array.from({ length: 10 }, () => POST(request())));
  for (const response of concurrent) await count(response, 1);
  await count(await POST(request(browserB, { Authorization: "Bearer member" })), 2);
  const ttl = await client.ttl(key);
  assert(ttl > 90 && ttl <= 180, "Idle sets expire without a cleanup job");
  const before = await client.zRangeWithScores(key, 0, -1);
  for (const token of ["admin", "invalid", "outage"]) {
    await count(await POST(request("33333333-3333-4333-8333-333333333333", { Authorization: `Bearer ${token}` })), 2);
  }
  await count(await POST(request("44444444-4444-4444-8444-444444444444", { "user-agent": "Googlebot/2.1" })), 2);
  await count(await GET(request("55555555-5555-4555-8555-555555555555")), 2);
  assert.deepEqual(await client.zRangeWithScores(key, 0, -1), before, "Reads, bots and excluded sessions do not write");

  now += 60_000;
  await count(await POST(request(browserA)), 2);
  now += 30_000;
  await count(await GET(), 1, "90-second-old browsers drop out even without new writes");
  now += 60_000;
  await count(await GET(), 0);
  await count(await POST(request(null, { cookie: `catdai-device-id=${browserB.toUpperCase()}` })), 1);
  assert.equal(await client.zCard(key), 1, "A heartbeat removes expired members");
  await count(await POST(request(browserB, { origin: "https://catdai.test" }, "http://internal:3000/api/online-users")), 1);
  await count(await POST(request(browserB, { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" }, "http://localhost:3000/api/online-users")), 1);
  assert.equal((await POST(request(browserB, { origin: "https://other.test", host: "catdai.test" }))).status, 403);

  available = false;
  for (const response of [await GET(), await POST(request())]) {
    assert.equal(response.status, 503);
    assert.equal(await response.text(), "Unavailable");
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  available = true;
  await client.quit();
  assert.equal((await GET()).status, 503, "Redis command failures are unavailable, not zero");
  console.log("Online users: plain text, uniqueness, concurrent tabs, expiry, auth exclusions, origin validation and Redis failures passed.");
} finally {
  clearTimeout(startupTimeout);
  if (client.isOpen) await client.quit();
  if (server.exitCode === null && server.signalCode === null && server.pid) {
    const stopped = once(server, "exit");
    server.kill("SIGTERM");
    await stopped;
  }
  await fs.rm(directory, { recursive: true, force: true });
}
