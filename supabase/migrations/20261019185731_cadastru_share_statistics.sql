alter table public.cadastru_shared_reports
  add column search_event_id bigint references public.cadastru_search_events(id) on delete set null;
create index cadastru_shared_reports_search_idx on public.cadastru_shared_reports(search_event_id)
  where collect_statistics = true;

create table public.cadastru_share_events (
  id uuid primary key,
  report_slug text not null references public.cadastru_shared_reports(slug) on delete cascade,
  event_type text not null check (event_type in ('share', 'open')),
  viewer_key text,
  created_at timestamptz not null default now(),
  check ((event_type = 'open' and viewer_key is not null) or (event_type = 'share' and viewer_key is null)),
  unique (report_slug, event_type, viewer_key)
);
alter table public.cadastru_share_events enable row level security;
revoke all on public.cadastru_share_events from public, anon, authenticated;
grant select, insert on public.cadastru_share_events to service_role;

-- Aggregate only the displayed search IDs; never transfer a truncated event list.
create function public.cadastru_share_statistics(p_search_ids bigint[])
returns table(search_event_id bigint, share_count bigint, unique_viewers bigint)
language sql stable security invoker set search_path = public
as $$
  select r.search_event_id,
    count(e.id) filter (where e.event_type = 'share'),
    count(distinct e.viewer_key) filter (where e.event_type = 'open')
  from public.cadastru_shared_reports r
  left join public.cadastru_share_events e on e.report_slug = r.slug
  where r.search_event_id = any(p_search_ids) and r.collect_statistics = true
  group by r.search_event_id;
$$;
revoke all on function public.cadastru_share_statistics(bigint[]) from public, anon, authenticated;
grant execute on function public.cadastru_share_statistics(bigint[]) to service_role;
