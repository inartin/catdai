-- ============================================================
-- cadastru_records — long-lived official cadastru lookup cache
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists public.cadastru_records (
  id bigserial primary key,

  cadastral_number text not null,
  cadastral_number_digits text generated always as (
    regexp_replace(cadastral_number, '[^0-9]', '', 'g')
  ) stored,
  official_cadastral_number text,
  raw_cadastral_number text,
  building_cadastral_number text,

  full_address text not null check (length(btrim(full_address)) > 0),
  address_ro text,
  address_ru text,
  city text,
  region text,
  district text,
  street text,
  house_number text,
  apartment_number text,

  result_type text not null default 'address_only'
    check (result_type in ('no_data', 'address_only', 'apartment_only', 'full_data')),
  lookup_source text check (lookup_source in ('api', 'local')),
  source text,
  partial boolean not null default false,

  apartment_area_m2 numeric(10,2),
  apartment_floor integer,
  apartment_estimated_value_lei numeric(14,2),

  building_total_floors integer,
  building_construction_year integer,

  apartment_data jsonb not null default '{}'::jsonb,
  building_data jsonb not null default '{}'::jsonb,
  location_data jsonb not null default '{}'::jsonb,
  form_fields jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,

  payload_hash text,
  lookup_count integer not null default 1 check (lookup_count >= 0),

  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  data_updated_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  last_official_fetch_at timestamptz,
  next_refresh_after timestamptz,

  constraint cadastru_records_cadastral_number_key unique (cadastral_number),
  constraint cadastru_records_digits_key unique (cadastral_number_digits)
);

create index if not exists idx_cadastru_records_city_region_district
  on public.cadastru_records (city, region, district);

create index if not exists idx_cadastru_records_address_parts
  on public.cadastru_records (city, house_number, apartment_number);

create index if not exists idx_cadastru_records_refresh
  on public.cadastru_records (next_refresh_after)
  where next_refresh_after is not null;

create index if not exists idx_cadastru_records_payload
  on public.cadastru_records using gin (raw_payload);

create or replace function public.touch_cadastru_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cadastru_records_updated_at on public.cadastru_records;
create trigger trg_cadastru_records_updated_at
before update on public.cadastru_records
for each row execute function public.touch_cadastru_updated_at();

alter table public.cadastru_records enable row level security;

drop table if exists public.cadastru_address_aliases;
