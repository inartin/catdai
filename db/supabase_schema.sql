-- ============================================================
-- catdai_parser — Supabase schema (run once in SQL Editor)
-- ============================================================

-- Helper: auto-update "updated_at" on row change
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- owner
-- ============================================================
create table owner (
  id                text primary key default gen_random_uuid()::text,
  source            text not null,
  external_owner_id text,
  display_name      text,
  login             text,
  avatar_url        text,
  owner_type        text,
  business_plan     text,
  business_id       text,
  is_verified       boolean,
  verified_at       timestamptz,
  phones            jsonb,
  emails            jsonb,
  contact_methods   jsonb,
  metadata          jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint owner_source_external_owner_id_key unique (source, external_owner_id)
);

create index owner_source_idx on owner (source);

create trigger owner_updated_at
  before update on owner
  for each row execute function update_updated_at();

-- ============================================================
-- listing
-- ============================================================
create table listing (
  id                text primary key default gen_random_uuid()::text,
  source            text not null,
  external_id       text not null,
  source_url        text,
  is_active         boolean not null default true,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  source_created_at timestamptz,
  source_updated_at timestamptz,
  deleted_at        timestamptz,

  title             text not null,
  description       text,
  price_amount      numeric(12,2),
  price_currency    text,
  price_per_m2      numeric(12,2),
  old_price_amount  numeric(12,2),
  images_count      int not null default 0,

  property_type     text,
  deal_type         text,
  area_m2           numeric(10,2),
  rooms_count       int,
  floor             int,
  total_floors      int,
  building_type     text,
  renovation        text,
  bathrooms_count   int,
  balconies_count   int,

  country           text,
  city              text,
  district          text,
  sector            text,
  address_text      text,
  latitude          numeric(9,6),
  longitude         numeric(9,6),

  owner_id          text references owner(id) on delete set null,

  attributes        jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint listing_source_external_id_key unique (source, external_id)
);

create index listing_source_idx            on listing (source);
create index listing_is_active_idx         on listing (is_active);
create index listing_source_updated_at_idx on listing (source_updated_at);
create index listing_location_idx          on listing (city, district, sector);
create index listing_price_amount_idx      on listing (price_amount);
create index listing_area_m2_idx           on listing (area_m2);
create index listing_owner_id_idx          on listing (owner_id);

create trigger listing_updated_at
  before update on listing
  for each row execute function update_updated_at();

-- ============================================================
-- listing_price_history
-- ============================================================
create table listing_price_history (
  id                text primary key default gen_random_uuid()::text,
  listing_id        text not null references listing(id) on delete cascade,
  price_amount      numeric(12,2) not null,
  price_currency    text not null,
  price_per_m2      numeric(12,2),
  source_updated_at timestamptz,
  observed_at       timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index listing_price_history_listing_observed_idx
  on listing_price_history (listing_id, observed_at);

create index listing_price_history_source_updated_at_idx
  on listing_price_history (source_updated_at);

-- ============================================================
-- estimate_log — tracks every evaluation request for analytics
-- ============================================================
create table estimate_log (
  id                    text primary key default gen_random_uuid()::text,
  user_id               uuid references auth.users(id) on delete set null,
  device_id             text,
  session_id            text,
  evaluation_group_id   text,
  ip_hash               text,

  city                  text,
  district              text,
  rooms_count           int,
  area_m2               numeric(10,2),
  building_type         text,
  renovation            text,
  floor                 int,
  total_floors          int,
  bathrooms_count       int,
  balconies_count       int,

  estimated_price       numeric(12,2),
  price_per_m2          numeric(12,2),

  language              text,
  response_time_ms      int,
  created_at            timestamptz not null default now()
);

create index idx_estimate_log_device  on estimate_log (device_id);
create index idx_estimate_log_user    on estimate_log (user_id);
create index idx_estimate_log_session on estimate_log (session_id);
create index idx_estimate_log_group   on estimate_log (evaluation_group_id);
create index idx_estimate_log_created on estimate_log (created_at);
create index idx_estimate_log_city    on estimate_log (city, district);

-- ============================================================
-- ad_source_events — first-party source tracking events
-- ============================================================
create table ad_source_events (
  id          bigserial primary key,
  source      text not null,
  event_name  text not null,
  user_id     uuid references auth.users(id) on delete set null,
  device_id   text,
  session_id  text,
  path        text,
  referrer    text,
  ip_hash     text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index idx_ad_source_events_source_created
  on ad_source_events (source, created_at desc);

create index idx_ad_source_events_session
  on ad_source_events (session_id);

create index idx_ad_source_events_event_created
  on ad_source_events (event_name, created_at desc);

create index idx_ad_source_events_user_created
  on ad_source_events (user_id, created_at desc);

-- ============================================================
-- user_activity — last authenticated user visit timestamp
-- ============================================================
create table user_activity (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index idx_user_activity_last_seen on user_activity (last_seen_at desc);
