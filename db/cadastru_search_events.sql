-- ============================================================
-- cadastru_search_events — tracks /cadastru lookup usage
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists cadastru_search_events (
  id               bigserial primary key,
  search_type      text not null check (search_type in ('address', 'number')),
  user_id          uuid references auth.users(id) on delete set null,
  district         text,
  cadastral_number text,
  result_type      text check (result_type in ('no_data', 'address_only', 'apartment_only', 'full_data')),
  created_at       timestamptz not null default now()
);

alter table if exists cadastru_search_events
  add column if not exists district text;

alter table if exists cadastru_search_events
  add column if not exists cadastral_number text;

alter table if exists cadastru_search_events
  add column if not exists result_type text;

do $$
begin
  alter table cadastru_search_events
    add constraint cadastru_search_events_result_type_check
    check (result_type in ('no_data', 'address_only', 'apartment_only', 'full_data'));
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_cadastru_search_events_created
  on cadastru_search_events (created_at desc);

create index if not exists idx_cadastru_search_events_type_created
  on cadastru_search_events (search_type, created_at desc);

create index if not exists idx_cadastru_search_events_user_created
  on cadastru_search_events (user_id, created_at desc);

create index if not exists idx_cadastru_search_events_district_created
  on cadastru_search_events (district, created_at desc);

create index if not exists idx_cadastru_search_events_number_created
  on cadastru_search_events (cadastral_number, created_at desc);

create index if not exists idx_cadastru_search_events_result_created
  on cadastru_search_events (result_type, created_at desc);
