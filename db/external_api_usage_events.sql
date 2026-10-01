-- ============================================================
-- external_api_usage_events — request-level external worker telemetry
-- Run this in Supabase SQL Editor after external_api_usage_daily.sql
-- ============================================================

create table if not exists public.external_api_usage_events (
  id               bigserial primary key,
  service          text not null check (service in ('999_listing', 'cadastru_number', 'cadastru_address')),
  status           text not null check (status in ('success', 'failure')),
  endpoint         text,
  request_payload  jsonb,
  response_payload jsonb,
  response_headers jsonb,
  error_code       text,
  error_message    text,
  http_status      integer,
  duration_ms      integer check (duration_ms is null or duration_ms >= 0),
  suggestion_recovery jsonb,
  created_at       timestamptz not null default now()
);

-- Also upgrade existing installations; original failure status/counters stay unchanged.
alter table public.external_api_usage_events
  add column if not exists suggestion_recovery jsonb;

create index if not exists idx_external_api_usage_events_created
  on public.external_api_usage_events (created_at desc);

create index if not exists idx_external_api_usage_events_status_created
  on public.external_api_usage_events (status, created_at desc);

create index if not exists idx_external_api_usage_events_service_created
  on public.external_api_usage_events (service, created_at desc);

alter table public.external_api_usage_events enable row level security;

grant all on public.external_api_usage_events to service_role;
grant usage, select on sequence public.external_api_usage_events_id_seq to service_role;
