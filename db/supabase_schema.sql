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
  estimate_type         text not null default 'sale' check (estimate_type in ('sale', 'rent')),
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
create index idx_estimate_log_type_created on estimate_log (estimate_type, created_at desc);

-- ============================================================
-- pdf_generation_events — tracks valuation PDF generation
-- ============================================================
create table pdf_generation_events (
  id                   bigserial primary key,
  user_id              uuid references auth.users(id) on delete set null,
  device_id            text,
  session_id           text,
  estimate_log_id      text references estimate_log(id) on delete set null,
  included_cadastral   boolean not null default false,
  created_at           timestamptz not null default now()
);

create index idx_pdf_generation_events_created on pdf_generation_events (created_at);
create index idx_pdf_generation_events_user    on pdf_generation_events (user_id);
create index idx_pdf_generation_events_session on pdf_generation_events (session_id);

-- ============================================================
-- cadastru_search_events — tracks /cadastru lookup usage
-- ============================================================
create table cadastru_search_events (
  id               bigserial primary key,
  search_type      text not null check (search_type in ('address', 'number')),
  user_id          uuid references auth.users(id) on delete set null,
  city             text,
  district         text,
  cadastral_number text,
  result_type      text check (result_type in ('no_data', 'address_only', 'apartment_only', 'full_data')),
  lookup_source    text check (lookup_source in ('api', 'local')),
  created_at       timestamptz not null default now()
);

create index idx_cadastru_search_events_created      on cadastru_search_events (created_at desc);
create index idx_cadastru_search_events_type_created on cadastru_search_events (search_type, created_at desc);
create index idx_cadastru_search_events_user_created on cadastru_search_events (user_id, created_at desc);
create index idx_cadastru_search_events_city_created on cadastru_search_events (city, created_at desc);
create index idx_cadastru_search_events_district_created on cadastru_search_events (district, created_at desc);
create index idx_cadastru_search_events_number_created on cadastru_search_events (cadastral_number, created_at desc);
create index idx_cadastru_search_events_result_created on cadastru_search_events (result_type, created_at desc);
create index idx_cadastru_search_events_source_created on cadastru_search_events (lookup_source, created_at desc);

-- ============================================================
-- listing_link_analysis_events — tracks 999.md link analyzer usage
-- ============================================================
create table listing_link_analysis_events (
  id               bigserial primary key,
  status           text not null check (
    status in (
      'success',
      'unsupported_listing_type',
      'not_chisinau',
      'insufficient_data',
      'not_a_listing',
      'fetch_failed',
      'upstream_blocked'
    )
  ),
  error_code       text,
  user_id          uuid references auth.users(id) on delete set null,
  external_id      text,
  listing_url      text,
  city             text,
  district         text,
  rooms_count      int,
  listing_price    numeric(12,2),
  listing_currency text,
  created_at       timestamptz not null default now()
);

create index idx_listing_link_analysis_events_created on listing_link_analysis_events (created_at desc);
create index idx_listing_link_analysis_events_status_created on listing_link_analysis_events (status, created_at desc);
create index idx_listing_link_analysis_events_user_created on listing_link_analysis_events (user_id, created_at desc);
create index idx_listing_link_analysis_events_external_created on listing_link_analysis_events (external_id, created_at desc);

-- ============================================================
-- calculator_usage_events — tracks /calculator result usage
-- ============================================================
create table calculator_usage_events (
  id                       bigserial primary key,
  event_id                 text unique,
  user_id                  uuid references auth.users(id) on delete set null,
  device_id                text,
  session_id               text,

  city                     text,
  district                 text,
  rooms_count              int,
  area_m2                  numeric(10,2),
  building_type            text,
  renovation               text,

  apartment_price          numeric(12,2) not null,
  additional_investments   numeric(12,2) not null default 0,
  total_investment         numeric(12,2) not null,
  include_rent_tax         boolean not null default false,
  estimated_monthly_rent   numeric(12,2),
  annual_gross_yield_pct   numeric(8,4),
  effective_yield_pct      numeric(8,4),
  payback_years            numeric(8,2),
  language                 text,
  created_at               timestamptz not null default now()
);

create index idx_calculator_usage_events_created on calculator_usage_events (created_at desc);
create index idx_calculator_usage_events_user_created on calculator_usage_events (user_id, created_at desc);
create index idx_calculator_usage_events_session on calculator_usage_events (session_id);
create index idx_calculator_usage_events_city_created on calculator_usage_events (city, district, created_at desc);

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
-- market_trends_popup_daily — daily landing district-chart popup opens
-- ============================================================
create table market_trends_popup_daily (
  event_date  date primary key,
  open_count  bigint not null default 0 check (open_count >= 0),
  updated_at  timestamptz not null default now()
);

create or replace function increment_market_trends_popup_daily()
returns void
language sql
security definer
set search_path = public
as $$
  insert into market_trends_popup_daily (event_date, open_count)
  values ((now() at time zone 'Europe/Chisinau')::date, 1)
  on conflict (event_date) do update
    set open_count = market_trends_popup_daily.open_count + 1,
        updated_at = now();
$$;

alter table market_trends_popup_daily enable row level security;

revoke all on market_trends_popup_daily from anon, authenticated;
grant all on market_trends_popup_daily to service_role;

revoke all on function increment_market_trends_popup_daily() from public, anon, authenticated;
grant execute on function increment_market_trends_popup_daily() to service_role;

-- ============================================================
-- user_activity — last authenticated user visit timestamp
-- ============================================================
create table user_activity (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index idx_user_activity_last_seen on user_activity (last_seen_at desc);
