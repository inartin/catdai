-- ============================================================
-- calculator_usage_events — tracks /calculator result usage
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists calculator_usage_events (
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

create index if not exists idx_calculator_usage_events_created
  on calculator_usage_events (created_at desc);

create index if not exists idx_calculator_usage_events_user_created
  on calculator_usage_events (user_id, created_at desc);

create index if not exists idx_calculator_usage_events_session
  on calculator_usage_events (session_id);

create index if not exists idx_calculator_usage_events_city_created
  on calculator_usage_events (city, district, created_at desc);
