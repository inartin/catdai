-- ============================================================
-- market_trends_popup_daily — daily landing district-chart popup opens
-- Run this in Supabase SQL Editor
-- ============================================================

begin;

create table if not exists public.market_trends_popup_daily (
  event_date date primary key,
  open_count bigint not null default 0 check (open_count >= 0),
  updated_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.market_trends_popup_events') is not null then
    insert into public.market_trends_popup_daily (event_date, open_count)
    select
      (created_at at time zone 'Europe/Chisinau')::date,
      count(*)::bigint
    from public.market_trends_popup_events
    group by 1
    on conflict (event_date) do update
      set open_count = public.market_trends_popup_daily.open_count + excluded.open_count,
      updated_at = now();
  end if;
end;
$$;

drop table if exists public.market_trends_popup_events;

create or replace function public.increment_market_trends_popup_daily()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.market_trends_popup_daily (event_date, open_count)
  values ((now() at time zone 'Europe/Chisinau')::date, 1)
  on conflict (event_date) do update
    set open_count = public.market_trends_popup_daily.open_count + 1,
        updated_at = now();
$$;

alter table public.market_trends_popup_daily enable row level security;

revoke all on public.market_trends_popup_daily from anon, authenticated;
grant all on public.market_trends_popup_daily to service_role;

revoke all on function public.increment_market_trends_popup_daily() from public, anon, authenticated;
grant execute on function public.increment_market_trends_popup_daily() to service_role;

commit;
