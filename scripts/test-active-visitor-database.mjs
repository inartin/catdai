// Isolated PostgreSQL checks; no network or live database writes.
// pnpm exec node scripts/test-active-visitor-database.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const id = (n) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key, created_at timestamptz not null,
      raw_app_meta_data jsonb default '{}', is_anonymous boolean default false
    );
    create table public.user_activity (user_id uuid, visitor jsonb, last_seen_at timestamptz);
  `);
  for (const table of ["estimate_log", "cadastru_search_events", "external_api_usage_events", "pdf_generation_events",
    "calculator_usage_events", "listing_link_analysis_events", "payment_checkout_events", "ad_source_events"]) {
    await db.exec(`create table public.${table} (user_id uuid, device_id text, visitor jsonb, created_at timestamptz, duplicate_of bigint)`);
  }
  // Returning member, new member, inactive older member, marked admin and anonymous guest account.
  await db.query(`insert into auth.users (id, created_at, raw_app_meta_data, is_anonymous) values
    ($1, now() - interval '90 days', '{}', false),
    ($2, now() - interval '1 hour', '{}', false),
    ($3, now() - interval '90 days', '{}', false),
    ($4, now() - interval '90 days', '{"catdai_is_admin": true}', false),
    ($5, now() - interval '1 hour', '{}', true)`, [id(1), id(2), id(3), id(4), id(5)]);
  const event = async (table, userId, deviceId, visitor = {}, age = "1 hour", duplicate = null) => {
    await db.query(`insert into public.${table} (user_id, device_id, visitor, created_at, duplicate_of)
      values ($1, $2, $3, now() - $4::interval, $5)`, [userId, deviceId, JSON.stringify(visitor), age, duplicate]);
  };
  await event("payment_checkout_events", null, id(11));
  await event("ad_source_events", null, id(11)); // Same anonymous browser, another feature.
  await event("payment_checkout_events", null, id(12)); // Before login.
  await event("payment_checkout_events", id(1), id(12));
  await event("estimate_log", id(1), id(13)); // Same member, another browser.
  await event("payment_checkout_events", null, id(13));
  await event("payment_checkout_events", id(5), id(14)); // Guest counts as anonymous.
  await event("payment_checkout_events", id(4), id(15)); // Admin excluded.
  await event("payment_checkout_events", null, id(16), { device_type: "Bot" });
  await event("cadastru_search_events", null, null, { device_id: id(17) }, "1 hour", 99);
  await event("payment_checkout_events", null, id(18), {}, "2 days");
  await event("payment_checkout_events", null, "bad-id");
  // Modern visitor snapshots take precedence over legacy fields.
  await event("calculator_usage_events", null, "bad-id", { device_id: id(19) });
  await db.query("insert into user_activity values ($1, $2, now() - interval '1 hour')", [id(1), JSON.stringify({ device_id: id(12) })]);
  const migration = (await fs.readdir("supabase/migrations")).find((name) => name.endsWith("_active_visitor_stats.sql"));
  await db.exec(await fs.readFile(`supabase/migrations/${migration}`, "utf8"));
  const stats = async (since = "24 hours") => (await db.query(`select * from public.admin_active_user_stats(
    case when $1::text is null then null else now() - $1::interval end)`, [since])).rows[0];
  assert.deepEqual(await stats(), { active_users: 5, new_registered_users: 1, old_registered_users: 1 },
    "Two registered accounts plus three anonymous browsers; login and repeat features do not double-count");
  assert.deepEqual(await stats("7 days"), { active_users: 6, new_registered_users: 1, old_registered_users: 1 });
  assert.deepEqual(await stats(null), { active_users: 7, new_registered_users: 3, old_registered_users: 0 },
    "All time includes previous registrations; anonymous guest and marked admin are not registered users");

  // Service-only writes and reads: public roles cannot access private browser/account associations.
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select * from public.visitor_activity"), /permission denied/);
    await assert.rejects(db.query("select public.record_visitor_activity($1, null)", [id(20)]), /permission denied/);
    await assert.rejects(db.query("select * from public.admin_active_user_stats(null)"), /permission denied/);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  await db.query("select public.record_visitor_activity($1, null)", [id(20)]);
  assert.equal((await stats()).active_users, 6);
  await db.exec("reset role");

  // Repeat heartbeats retain a single row, with updates throttled for ten minutes.
  const seen = async () => (await db.query("select last_seen_at::text as seen from visitor_activity where device_id=$1", [id(20)])).rows[0].seen;
  const original = await seen();
  await db.query("select public.record_visitor_activity($1, null)", [id(20)]);
  assert.equal(await seen(), original);
  await db.query("update visitor_activity set last_seen_at=now()-interval '11 minutes' where device_id=$1", [id(20)]);
  const stale = await seen();
  await db.query("select public.record_visitor_activity($1, null)", [id(20)]);
  assert.notEqual(await seen(), stale);
  await db.query("select public.record_visitor_activity($1, $2)", [id(20), id(1)]);
  assert.equal((await stats()).active_users, 5, "Signing in merges the browser into its existing member");
  await db.query("select public.record_visitor_activity($1, $2)", [id(21), id(1)]);
  assert.equal((await stats()).active_users, 5, "A member on another browser still counts once");
  await db.query("select public.record_visitor_activity($1, $2)", [id(22), id(4)]);
  assert.equal((await stats()).active_users, 5, "Aggregation excludes an admin even if a row exists");
  console.log("Active visitor database checks passed: backfill, deduplication, periods, guests, exclusions, throttling and permissions.");
} finally {
  await db.close();
}
