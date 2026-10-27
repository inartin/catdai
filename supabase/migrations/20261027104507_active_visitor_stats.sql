-- One latest visit per browser/account pair, including signed-out browsers.
create table public.visitor_activity (
  device_id uuid,
  user_id uuid references auth.users(id) on delete cascade,
  activity_key text generated always as (
    coalesce(user_id::text, 'anonymous') || ':' || coalesce(device_id::text, '')
  ) stored primary key,
  last_seen_at timestamptz not null default now(),
  check (device_id is not null or user_id is not null)
);
create index visitor_activity_last_seen_idx on public.visitor_activity (last_seen_at);
create index visitor_activity_user_idx on public.visitor_activity (user_id);
alter table public.visitor_activity enable row level security;
revoke all on public.visitor_activity from public, anon, authenticated;
grant select, insert, update, delete on public.visitor_activity to service_role;

create function public.record_visitor_activity(p_device_id uuid, p_user_id uuid default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.visitor_activity (device_id, user_id)
  values (p_device_id, p_user_id)
  on conflict (activity_key) do update set last_seen_at = excluded.last_seen_at
  where public.visitor_activity.last_seen_at < now() - interval '10 minutes'
     or (public.visitor_activity.last_seen_at at time zone 'Europe/Chisinau')::date
        < (now() at time zone 'Europe/Chisinau')::date;
$$;
revoke all on function public.record_visitor_activity(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_visitor_activity(uuid, uuid) to service_role;

-- Recover only real retained visits. Visits without any saved event cannot be backfilled.
with events as (
  select user_id, coalesce(visitor->>'device_id', device_id) as device_id, visitor, created_at from public.estimate_log
  union all
  select user_id, visitor->>'device_id', visitor, created_at from public.cadastru_search_events where duplicate_of is null
  union all
  select user_id, visitor->>'device_id', visitor, created_at from public.external_api_usage_events
  union all
  select user_id, coalesce(visitor->>'device_id', device_id), visitor, created_at from public.pdf_generation_events
  union all
  select user_id, coalesce(visitor->>'device_id', device_id), visitor, created_at from public.calculator_usage_events
  union all
  select user_id, visitor->>'device_id', visitor, created_at from public.listing_link_analysis_events
  union all
  select user_id, coalesce(visitor->>'device_id', device_id), visitor, created_at from public.payment_checkout_events
  union all
  select user_id, coalesce(visitor->>'device_id', device_id), visitor, created_at from public.ad_source_events
  union all
  select user_id, visitor->>'device_id', visitor, last_seen_at from public.user_activity
), eligible as (
  select u.id as user_id,
    case when e.device_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then e.device_id::uuid end as device_id,
    e.created_at
  from events e
  left join auth.users u on u.id = e.user_id
  where e.visitor->>'device_type' is distinct from 'Bot'
    and u.raw_app_meta_data->>'catdai_is_admin' is distinct from 'true'
)
insert into public.visitor_activity (device_id, user_id, last_seen_at)
select device_id, user_id, max(created_at)
from eligible
where (device_id is not null or user_id is not null) and created_at is not null
group by device_id, user_id;

-- Auth metadata is private; only the admin API's service role may call this function.
create function public.admin_active_user_stats(p_since timestamptz default null)
returns table (active_users bigint, new_registered_users bigint, old_registered_users bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with visits as materialized (
    select a.device_id, a.user_id
    from public.visitor_activity a
    left join auth.users u on u.id = a.user_id
    where (p_since is null or a.last_seen_at >= p_since)
      and u.raw_app_meta_data->>'catdai_is_admin' is distinct from 'true'
    union
    select case when a.visitor->>'device_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (a.visitor->>'device_id')::uuid end, a.user_id
    from public.user_activity a
    join auth.users u on u.id = a.user_id
    where (p_since is null or a.last_seen_at >= p_since)
      and u.raw_app_meta_data->>'catdai_is_admin' is distinct from 'true'
  ), registered as materialized (
    select u.id, u.created_at
    from auth.users u
    where not coalesce(u.is_anonymous, false)
      and u.raw_app_meta_data->>'catdai_is_admin' is distinct from 'true'
      and (exists (select 1 from visits v where v.user_id = u.id)
        or p_since is null or u.created_at >= p_since)
  ), anonymous as (
    select distinct v.device_id
    from visits v
    where v.device_id is not null
      and not exists (select 1 from registered r where r.id = v.user_id)
      -- A browser that signed in during this period already counts with its account.
      and not exists (
        select 1 from visits signed_in
        join registered r on r.id = signed_in.user_id
        where signed_in.device_id = v.device_id
      )
  )
  select (select count(*) from registered) + (select count(*) from anonymous),
    count(*) filter (where p_since is null or created_at >= p_since),
    count(*) filter (where p_since is not null and created_at < p_since)
  from registered;
$$;
revoke all on function public.admin_active_user_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_active_user_stats(timestamptz) to service_role;
