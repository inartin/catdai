-- ============================================================
-- external_api_usage_events — request-level external worker telemetry
-- Run this in Supabase SQL Editor after external_api_usage_daily.sql
-- ============================================================

create table if not exists public.external_api_usage_events (
  id               bigserial primary key,
  service          text not null check (service in ('999_listing', 'cadastru_number', 'cadastru_address', 'cadastru_nearby')),
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
  user_id          uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

alter table public.external_api_usage_events
  drop constraint if exists external_api_usage_events_service_check;
alter table public.external_api_usage_events
  add constraint external_api_usage_events_service_check
  check (service in ('999_listing', 'cadastru_number', 'cadastru_address', 'cadastru_nearby'));

-- Also upgrade existing installations; original failure status/counters stay unchanged.
alter table public.external_api_usage_events
  add column if not exists suggestion_recovery jsonb;

alter table public.external_api_usage_events
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_external_api_usage_events_created
  on public.external_api_usage_events (created_at desc);

create index if not exists idx_external_api_usage_events_status_created
  on public.external_api_usage_events (status, created_at desc);

create index if not exists idx_external_api_usage_events_service_created
  on public.external_api_usage_events (service, created_at desc);

create index if not exists idx_external_api_usage_events_user_created
  on public.external_api_usage_events (user_id, created_at desc);

alter table public.external_api_usage_events enable row level security;

grant all on public.external_api_usage_events to service_role;
grant usage, select on sequence public.external_api_usage_events_id_seq to service_role;

-- Delete one request of either status and adjust its matching daily counter atomically.
create or replace function public.delete_external_api_log(p_event_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
  deleted_service text;
  deleted_date date;
  deleted_status text;
begin
  if p_event_id is null or p_event_id <= 0 then
    raise exception 'Invalid API log id';
  end if;
  delete from public.external_api_usage_events
    where id = p_event_id
    returning service, (created_at at time zone 'UTC')::date, status
    into deleted_service, deleted_date, deleted_status;
  get diagnostics deleted_count = row_count;
  if deleted_count > 0 then
    update public.external_api_usage_daily
      set count = greatest(count - 1, 0), updated_at = now()
      where service = deleted_service and usage_date = deleted_date and status = deleted_status;
  end if;
  return deleted_count;
end;
$$;

revoke all on function public.delete_external_api_log(bigint) from public, anon, authenticated;
grant execute on function public.delete_external_api_log(bigint) to service_role;

-- Delete request details and adjust counters in one transaction.
-- NULL means all failed logs, including aggregate-only history.
create or replace function public.delete_failed_external_api_logs(p_event_id bigint default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
  deleted_service text;
  deleted_date date;
begin
  if p_event_id is null then
    delete from public.external_api_usage_events where status = 'failure';
    get diagnostics deleted_count = row_count;
    delete from public.external_api_usage_daily where status = 'failure';
  else
    if p_event_id <= 0 then
      raise exception 'Invalid failed API log id';
    end if;
    delete from public.external_api_usage_events
      where id = p_event_id and status = 'failure'
      returning service, created_at::date into deleted_service, deleted_date;
    get diagnostics deleted_count = row_count;
    if deleted_count > 0 then
      update public.external_api_usage_daily
        set count = greatest(count - 1, 0), updated_at = now()
        where service = deleted_service and usage_date = deleted_date and status = 'failure';
    end if;
  end if;
  return deleted_count;
end;
$$;

revoke all on function public.delete_failed_external_api_logs(bigint) from public, anon, authenticated;
grant execute on function public.delete_failed_external_api_logs(bigint) to service_role;
