// Isolated period, pagination and rendering checks; no network or live writes.
// pnpm exec node --experimental-vm-modules scripts/test-admin-api-response-times.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";

const context = vm.createContext({ console, Date });
const periods = new vm.SourceTextModule(await fs.readFile("src/lib/admin-periods.js", "utf8"), { context });
await periods.link(() => { throw new Error("Unexpected period import"); });
await periods.evaluate();
const rows = [
  ...Array.from({ length: 250 }, () => ({ created_at: "2026-11-03T10:00:00Z", duration_ms: 1000 })),
  ...Array.from({ length: 1000 }, () => ({ created_at: "2026-11-02T10:00:00Z", duration_ms: 5000 })),
  { created_at: "2026-10-15T10:00:00Z", duration_ms: 9000 },
];
const queries = [];
let failAt = -1;
let missingTable = false;
const supabaseAdmin = { from(table) {
  assert.equal(table, "external_api_usage_events");
  const filters = [];
  const query = { filters };
  queries.push(query);
  const builder = {
    select(columns) { assert.equal(columns, "duration_ms", "do not download request payloads"); return builder; },
    gte(column, value) { filters.push((row) => row[column] != null && row[column] >= value); return builder; },
    lt(column, value) { filters.push((row) => row[column] < value); return builder; },
    order(column) { assert.equal(column, "id", "pagination has a stable order"); return builder; },
    range(from, to) {
      query.from = from;
      if (missingTable) return { error: { code: "42P01", message: "missing table" } };
      if (from === failAt) return { error: { message: "database unavailable" } };
      return { data: rows.filter((row) => filters.every((filter) => filter(row))).slice(from, to + 1), error: null };
    },
  };
  return builder;
} };
const mocks = {
  "@/lib/admin-periods": periods.namespace,
  "@/lib/supabase-admin": { supabaseAdmin },
  "@/lib/admin-auth": { requireAdminApiAuth() {} },
  "@/lib/admin-cadastru-favorites": { loadCadastruFavorites() {} },
  "@/lib/cadastru-share-statistics": { loadCadastruShareStatistics() {} },
  "@/lib/admin-cadastru-suggestion-activity": { loadCadastruSuggestionActivity() {} },
  "next/server": { NextResponse: {} },
};
const route = new vm.SourceTextModule(`${await fs.readFile("src/app/api/admin/stats/route.js", "utf8")}\nexport { fetchExternalApiResponseTimes };`, { context });
await route.link((name) => {
  assert(mocks[name], `Unexpected import ${name}`);
  return new vm.SyntheticModule(Object.keys(mocks[name]), function () {
    for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
  }, { context });
});
await route.evaluate();
const { fetchExternalApiResponseTimes } = route.namespace;
const range = (period) => periods.namespace.adminPeriod(period, new Date("2026-11-03T12:00:00Z"));
const day = await fetchExternalApiResponseTimes(range("day"));
assert.equal(day.count, 250, "durations are not capped at the 200 detail rows");
assert.equal(day.averageMs, 1000);
const week = await fetchExternalApiResponseTimes(range("week"));
assert.equal(week.count, 1250, "every page is read for the selected period");
assert.equal(week.averageMs, 4200);
assert.equal(week.medianMs, 5000);
assert(queries.some(({ from }) => from === 1000));
assert.equal((await fetchExternalApiResponseTimes(range("previous_month"))).averageMs, 9000,
  "previous month applies both date boundaries");
assert.equal((await fetchExternalApiResponseTimes(range("all"))).count, 1251);
failAt = 1000;
await assert.rejects(() => fetchExternalApiResponseTimes(range("week")), /database unavailable/,
  "a later-page error cannot produce partial statistics");
failAt = -1;
rows.splice(0, rows.length, ...[0, 100, 300, null, -1].map((duration_ms) => ({ created_at: "2026-11-03T10:00:00Z", duration_ms })));
const valid = await fetchExternalApiResponseTimes(range("day"));
assert.equal(valid.count, 3);
assert.equal(valid.minMs, 0);
assert.equal(valid.medianMs, 100);
rows.pop(); rows.pop(); rows.pop();
assert.equal((await fetchExternalApiResponseTimes(range("day"))).medianMs, 50, "even median");
rows.length = 0;
const empty = await fetchExternalApiResponseTimes(range("day"));
assert.equal(empty.count, 0);
assert.equal(empty.averageMs, null);
missingTable = true;
assert.equal(await fetchExternalApiResponseTimes(range("day")), null);

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require("next/dist/build/swc");
await loadBindings();
const page = await fs.readFile("src/app/admin/page.js", "utf8");
const component = page.slice(page.indexOf("function ApiResponseTimeStats("), page.indexOf("function fmtPaymentAmount("));
const { code } = await transform(`const fmtNum = n => Number(n).toLocaleString("ro-RO");\n${component}\nmodule.exports = ApiResponseTimeStats;`, {
  filename: "stats.js", jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" },
});
const loaded = { exports: {} };
new Function("require", "module", "exports", code)(require, loaded, loaded.exports);
const { renderToStaticMarkup } = require("react-dom/server");
const render = (stats, periodLabel) => renderToStaticMarkup(loaded.exports({ stats, periodLabel }));
assert(render(day, "Today").includes("Today · 250 timed calls"));
assert(render(week, "Last week").includes("4,2 s"));
assert.equal((render(empty, "Today").match(/—/g) || []).length, 4);
assert(render(null, "Today").includes("Unavailable"));
console.log("API response times passed: full-period pagination, date boundaries, errors, medians, zero, empty/unavailable and rendering.");
