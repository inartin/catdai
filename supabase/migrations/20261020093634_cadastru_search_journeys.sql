-- Retain old event IDs for signed evaluation/share links when repairing known duplicates.
alter table public.cadastru_search_events
  add column lookup_id uuid,
  add column duplicate_of bigint references public.cadastru_search_events(id) on delete cascade,
  add constraint cadastru_search_events_not_self_duplicate check (duplicate_of is distinct from id);
create index cadastru_search_events_duplicate_idx on public.cadastru_search_events(duplicate_of)
  where duplicate_of is not null;
alter table public.cadastru_search_events drop constraint cadastru_search_events_lookup_source_check;
alter table public.cadastru_search_events add constraint cadastru_search_events_lookup_source_check
  check (lookup_source in ('api', 'local', 'cache'));

-- Full UTC days retain aggregate-only history. Only the partial boundary day needs
-- timestamp-level logs, so Today starts at Chișinău midnight rather than yesterday UTC.
create function public.admin_external_api_usage_since(p_since timestamptz default null)
returns table(service text, status text, count bigint)
language sql stable security invoker set search_path = public
as $$
  with boundary as (
    select (p_since at time zone 'UTC')::date as day,
      (date_trunc('day', p_since at time zone 'UTC') + interval '1 day') at time zone 'UTC' as next_day
  ), counts as (
    select d.service, d.status, d.count::bigint as count
    from public.external_api_usage_daily d, boundary b
    where p_since is null or d.usage_date > b.day
    union all
    select e.service, e.status, count(*)::bigint
    from public.external_api_usage_events e, boundary b
    where p_since is not null and e.created_at >= p_since and e.created_at < b.next_day
    group by e.service, e.status
  )
  select c.service, c.status, sum(c.count)::bigint from counts c group by c.service, c.status;
$$;
revoke all on function public.admin_external_api_usage_since(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_external_api_usage_since(timestamptz) to service_role;
