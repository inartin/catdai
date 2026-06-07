-- ============================================================
-- external_api_usage_daily — daily counters for external worker calls
-- Run this in Supabase SQL Editor
-- ============================================================

create table if not exists external_api_usage_daily (
  usage_date date not null default current_date,
  service    text not null check (service in ('999_listing', 'cadastru_number', 'cadastru_address')),
  status     text not null check (status in ('success', 'failure')),
  count      integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (usage_date, service, status)
);

create index if not exists idx_external_api_usage_daily_service_date
  on external_api_usage_daily (service, usage_date desc);

create or replace function increment_external_api_usage(
  p_service text,
  p_status text,
  p_usage_date date default current_date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_service not in ('999_listing', 'cadastru_number', 'cadastru_address') then
    return;
  end if;

  if p_status not in ('success', 'failure') then
    return;
  end if;

  insert into external_api_usage_daily (usage_date, service, status, count, updated_at)
  values (p_usage_date, p_service, p_status, 1, now())
  on conflict (usage_date, service, status)
  do update set
    count = external_api_usage_daily.count + 1,
    updated_at = now();
end;
$$;
