// Isolated URL routing checks; no server, network or live database writes.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-number-urls.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { validateCadastralNumber } from "../src/lib/validation.js";

globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
const { NextRequest, NextResponse } = await import("next/server.js");
const { unstable_doesMiddlewareMatch } = await import("next/experimental/testing/server.js");
const context = vm.createContext({ Headers, crypto, process: { env: {} } });
const proxyModule = new vm.SourceTextModule(await fs.readFile("src/proxy.js", "utf8"), { context });
const imports = {
  "next/server": { NextResponse },
  "@/lib/validation": { validateCadastralNumber },
};
await proxyModule.link((name) => {
  assert(imports[name], `Unexpected import: ${name}`);
  return new vm.SyntheticModule(Object.keys(imports[name]), function () {
    for (const [key, value] of Object.entries(imports[name])) this.setExport(key, value);
  }, { context });
});
await proxyModule.evaluate();
const { proxy, config } = proxyModule.namespace;
const request = (path, cookie = "") => new NextRequest(`https://catdai.md${path}`, {
  headers: cookie ? { cookie } : {},
});
const matches = (url) => unstable_doesMiddlewareMatch({ config, url });
const lookupIds = new Set();

for (const prefix of ["", "/ro", "/ru"]) {
  for (const route of ["c", "cadastru"]) {
    for (const number of ["01001017", "01001011234", "3153208.081", "0100201.999.01.0101", "4301211156.01.030"]) {
      for (const trailingSlash of ["", "/"]) {
        const path = `${prefix}/${route}/${number}${trailingSlash}`;
        assert(matches(path), `${path} must reach the proxy`);
        const response = await proxy(request(path));
        assert.equal(response.status, 307, path);
        const target = new URL(response.headers.get("location"));
        assert.equal(target.origin, "https://catdai.md");
        assert.equal(target.pathname.replace(/\/$/, ""), `${prefix || "/ro"}/cadastru/rezultat`);
        assert.equal(target.searchParams.get("cadastral_number"), validateCadastralNumber(number).value);
        assert.equal(target.searchParams.get("source"), "number");
        const id = target.searchParams.get("lookup_id");
        assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        assert(!lookupIds.has(id), "Each shortcut visit starts a fresh search");
        lookupIds.add(id);
      }
    }
  }
}

for (const [path, cookie, language] of [
  ["/c/01001017", "catdai-lang=ru", "ru"],
  ["/cadastru/01001017", "catdai-lang=invalid", "ro"],
  ["/ro/c/01001017", "catdai-lang=ru", "ro"],
  ["/ru/cadastru/01001017", "catdai-lang=ro", "ru"],
]) {
  const target = new URL((await proxy(request(path, cookie))).headers.get("location"));
  assert.equal(target.pathname, `/${language}/cadastru/rezultat`);
}

const conflicting = await proxy(request("/ru/c/01001017?skipcache=true&src=999&utm_source=ad&cadastral_number=wrong&source=address&lookup_id=old&share_slug=public-report"));
const params = new URL(conflicting.headers.get("location")).searchParams;
assert.equal(params.get("cadastral_number"), "0100101.7");
assert.equal(params.get("source"), "number");
assert.notEqual(params.get("lookup_id"), "old");
assert(!params.has("share_slug"), "Number shortcuts cannot open a public report instead");
for (const [key, value] of [["skipcache", "true"], ["src", "999"], ["utm_source", "ad"]]) {
  assert.equal(params.get(key), value);
}

for (const prefix of ["", "/ro", "/ru"]) {
  for (const path of ["/c/Abc_123-xYz9", `/c/${"0".repeat(12)}`, `/c/${"0".repeat(32)}`,
    "/c/123", "/c/0100101..7", "/cadastru", "/cadastru/rezultat?cadastral_number=0100101.7&source=number", "/cadastru/invalid"]) {
    const response = await proxy(request(`${prefix}${path}`));
    assert.equal(response.headers.get("location"), null, `${prefix}${path} keeps its existing routing`);
    assert.equal(response.headers.get("x-middleware-rewrite") !== null, Boolean(prefix), "Localized routing is preserved");
  }
}
assert(!matches("/api/cadastral"), "Lookup API routing stays unchanged");
assert(!matches("/api/cadastru/address"));
assert(matches("/admin/cadastru"));
assert.equal((await proxy(request("/admin/cadastru"))).status, 404, "Admin authentication stays intact");
console.log("Cadastru URL checks passed: localized aliases, formats, language, search identity, query options and existing routes.");
