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
  // Bounded calendar periods retain historical events after latest-visit rows advance.
  await db.exec(`
    create table external_api_usage_daily (usage_date date, service text, status text, count bigint);
    alter table external_api_usage_events add column service text, add column status text;
  `);
  const journeySql = await fs.readFile("supabase/migrations/20261020093634_cadastru_search_journeys.sql", "utf8");
  await db.exec(journeySql.slice(journeySql.indexOf("create function public.admin_external_api_usage_since")));
  await db.exec(await fs.readFile("supabase/migrations/20261102124827_admin_calendar_month_periods.sql", "utf8"));
  await db.query(`insert into auth.users (id, created_at) values
    ($1, '2039-01-01'), ($2, '2040-10-15'), ($3, '2040-10-31 22:00:00+00')`, [id(31), id(32), id(33)]);
  await db.query(`insert into visitor_activity (device_id, user_id, last_seen_at) values
    ($1, $2, '2040-11-05'), ($3, $4, '2040-11-05')`, [id(41), id(31), id(43), id(33)]);
  for (const [userId, deviceId, visitor, date, duplicate] of [
    [id(31), id(41), {}, "2040-10-10", null],
    [id(31), id(42), {}, "2040-10-11", null],
    [id(33), id(43), {}, "2040-10-31 22:00:00+00", null],
    [id(4), id(44), {}, "2040-10-10", null],
    [null, id(45), { device_type: "Bot" }, "2040-10-10", null],
    [null, id(46), {}, "2040-10-10", 99],
    [null, id(47), {}, "2040-10-10", null],
  ]) {
    await db.query(`insert into cadastru_search_events (user_id, visitor, created_at, duplicate_of)
      values ($1, $2, $3, $4)`, [userId, JSON.stringify({ ...visitor, device_id: deviceId }), date, duplicate]);
  }
  const bounds = ["2040-09-30 21:00:00+00", "2040-10-31 22:00:00+00"];
  assert.deepEqual((await db.query("select * from admin_active_user_stats($1, $2)", bounds)).rows[0],
    { active_users: 3, new_registered_users: 1, old_registered_users: 1 },
    "Historical visits count once; later registrations, bots, admins and duplicates are excluded");
  await db.exec(`insert into external_api_usage_daily values
    ('2040-09-30', 'cadastru_number', 'success', 2),
    ('2040-10-01', 'cadastru_number', 'success', 2),
    ('2040-10-15', 'cadastru_number', 'success', 5),
    ('2040-10-31', 'cadastru_number', 'success', 2),
    ('2040-11-01', 'cadastru_number', 'success', 4);
    insert into external_api_usage_events (created_at, service, status) values
    ('2040-09-30 20:59:59+00', 'cadastru_number', 'success'),
    ('2040-09-30 21:00:00+00', 'cadastru_number', 'success'),
    ('2040-10-31 21:59:59+00', 'cadastru_number', 'success'),
    ('2040-10-31 22:00:00+00', 'cadastru_number', 'success');`);
  assert.equal(Number((await db.query("select count from admin_external_api_usage_since($1, $2)", bounds)).rows[0].count), 9,
    "Both partial UTC boundary days are exact, with aggregate-only full days retained");
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select * from admin_active_user_stats($1, $2)", bounds), /permission denied/);
    await assert.rejects(db.query("select * from admin_external_api_usage_since($1, $2)", bounds), /permission denied/);
    await db.exec("reset role");
  }
  console.log("Calendar-month database checks passed: exact bounds, historical activity, aggregates and permissions.");
  console.log("Active visitor database checks passed: backfill, deduplication, periods, guests, exclusions, throttling and permissions.");
} finally {
  await db.close();
}
