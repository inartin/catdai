// Isolated map geometry and authenticated resource proxy checks; no live calls.
// pnpm exec node --experimental-vm-modules scripts/test-cadastru-map.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { cadastruMapFeatures, validMapGeometry } from "../src/lib/cadastru-map.js";
import { mapmdResourceUrl, proxyMapmdResources } from "../src/lib/mapmd.js";

const polygon = { type: "Polygon", coordinates: [[[28.891, 47.085], [28.892, 47.085], [28.892, 47.086], [28.891, 47.085]]] };
const multipolygon = { type: "MultiPolygon", coordinates: [polygon.coordinates, polygon.coordinates] };
assert(validMapGeometry(polygon));
assert(validMapGeometry(multipolygon));
for (const geometry of [null, {}, { type: "Point", coordinates: [28, 47] },
  { type: "Polygon", coordinates: [] }, { type: "MultiPolygon", coordinates: [[]] },
  { type: "Polygon", coordinates: [[[181, 47], [28, 47], [29, 48], [181, 47]]] },
  { type: "Polygon", coordinates: [[[28, 47], [29, 47], [29, 48]]] },
  { type: "Polygon", coordinates: [[[28, 47], [29, 47], [29, NaN], [28, 47]]] },
  { type: "Polygon", coordinates: [Array.from({ length: 20_001 }, () => [28, 47])] },
]) assert.equal(validMapGeometry(geometry), false);
assert.deepEqual(cadastruMapFeatures({ lands: [{ map_geometry: polygon, cadastral_number: "private" }], buildings: [{ map_geometry: multipolygon }] }),
  { type: "FeatureCollection", features: [
    { type: "Feature", properties: { kind: "land" }, geometry: polygon },
    { type: "Feature", properties: { kind: "building" }, geometry: multipolygon },
  ] });
assert.equal(cadastruMapFeatures({ map_geometry: polygon, lands: [{ map_geometry: polygon }] }).features.length, 1);
assert.deepEqual(cadastruMapFeatures({ map_geometry: polygon, buildings: [{ map_geometry: polygon }] }).features[0].properties,
  { kind: "building" }, "a repeated top-level building footprint keeps its building color");
assert.equal(cadastruMapFeatures({ lands: [{ map_geometry: "||||" }] }).features.length, 0);
assert.equal(cadastruMapFeatures({ lands: {}, buildings: "invalid" }).features.length, 0);

for (const parts of [["styles", "satelite", "style.json"], ["styles", "osm-bright", "sprite@2x.png"],
  ["fonts", "Open Sans Regular,Arial Unicode MS Regular", "0-255.pbf"], ["data", "v3.json"], ["data", "v3", "18", "152110", "92000.pbf"]]) {
  assert(mapmdResourceUrl(parts)?.startsWith("https://map.md/api/tiles/"));
}
for (const parts of [["..", "companies"], ["https:", "evil.test"], ["styles", "map/../../companies", "style.json"],
  ["data", "v3", "23", "0", "0.pbf"], ["data", "v3", "2", "4", "0.pbf"], ["styles", "map", "style.json?key=secret"]]) {
  assert.equal(mapmdResourceUrl(parts), null);
}
const proxied = proxyMapmdResources({ glyphs: "https://map.md/api/tiles/fonts/{fontstack}/{range}.pbf?key=private",
  sources: { map: { url: "https://map.md/api/tiles/data/v3.json?v=123" },
    satellite: { tiles: ["https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"] } } });
assert.equal(proxied.glyphs, "/api/cadastru/map/fonts/{fontstack}/{range}.pbf");
assert.equal(proxied.sources.map.url, "/api/cadastru/map/data/v3.json");
assert(!JSON.stringify(proxied).includes("private"));
assert(proxied.sources.satellite.tiles[0].startsWith("https://mt1.google.com/"));

const calls = [];
const env = { MAPMD_API: "test-private-map-key" };
let mockResponse = new Response(JSON.stringify({ version: 8, sources: { "simple-tiles": {} }, glyphs: "https://map.md/api/tiles/fonts/{fontstack}/{range}.pbf" }), { status: 200 });
const context = vm.createContext({ Buffer, Response, AbortSignal, process: { env }, fetch: async (...args) => { calls.push(args); return mockResponse; } });
const route = new vm.SourceTextModule(await fs.readFile("src/app/api/cadastru/map/[...path]/route.js", "utf8"), { context });
await route.link((name) => {
  const exports = name === "next/server" ? { NextResponse: { json: (body, options) => Response.json(body, options) } }
    : name === "@/lib/mapmd" ? { mapmdResourceUrl, proxyMapmdResources }
    : { rateLimit: () => ({ check: () => ({ allowed: true }) }) };
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
  }, { context });
});
await route.evaluate();
const request = new Request("http://localhost/api/cadastru/map/styles/satelite/style.json");
const get = (path) => route.namespace.GET(request, { params: Promise.resolve({ path }) });
const response = await get(["styles", "satelite", "style.json"]);
assert.equal(response.status, 200);
const body = await response.text();
assert(!body.includes(env.MAPMD_API));
assert(body.includes("/api/cadastru/map/fonts/"));
assert(body.includes("© Google"));
assert.equal(calls[0][1].headers.Authorization, `Basic ${Buffer.from(`${env.MAPMD_API}:`).toString("base64")}`);
assert.equal(calls[0][1].redirect, "error", "credentials cannot follow a redirect to another host");
assert(response.headers.get("cache-control").includes("max-age=3600"));
assert.equal((await get(["..", "companies"])).status, 400);
assert.equal(calls.length, 1, "invalid resources cannot reach upstream");
mockResponse = new Response("unauthorized provider detail", { status: 401 });
const failure = await get(["data", "v3.json"]);
assert.equal(failure.status, 503);
assert.equal(await failure.text(), '{"error":"map_unavailable"}');
env.MAPMD_API = "";
assert.equal((await get(["styles", "map", "style.json"])).status, 503);
assert.equal(calls.length, 2);

const previewContext = vm.createContext({});
const preview = new vm.SourceTextModule(await fs.readFile("src/lib/cadastru-preview.js", "utf8"), { context: previewContext });
await preview.link(() => new vm.SyntheticModule(["buildFeatureCreditRequiredPayload"], function () {
  this.setExport("buildFeatureCreditRequiredPayload", () => ({}));
}, { context: previewContext }));
await preview.evaluate();
const masked = preview.namespace.buildCadastruPreviewPayload({ map_geometry: polygon,
  lands: [{ map_geometry: polygon, cadastral_number: "3153208.081", area_m2: 607 }] });
assert.equal(masked.map_geometry, polygon);
assert.equal(masked.lands[0].map_geometry, polygon);
assert.notEqual(masked.lands[0].cadastral_number, "3153208.081");
assert.notEqual(masked.lands[0].area_m2, 607);
console.log("Cadastru map passed: polygon validation, private-field masking, resource allowlist, authenticated proxy, caching and safe failures.");
