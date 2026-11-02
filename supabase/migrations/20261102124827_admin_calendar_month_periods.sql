-- Preserve the one-argument RPCs for existing deployments and open-ended periods.
-- Subtracting cumulative usage preserves full UTC-day aggregate-only history and
-- timestamp filtering on both partial boundary days.
create function public.admin_external_api_usage_since(p_since timestamptz, p_until timestamptz)
returns table(service text, status text, count bigint)
language sql stable security invoker set search_path = ''
as $$
  select c.service, c.status, sum(c.count)::bigint
  from (
    select s.service, s.status, s.count from public.admin_external_api_usage_since(p_since) s
    union all
    select e.service, e.status, -e.count from public.admin_external_api_usage_since(p_until) e
    where p_until is not null
  ) c
  group by c.service, c.status
  having sum(c.count) > 0;
$$;
revoke all on function public.admin_external_api_usage_since(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_external_api_usage_since(timestamptz, timestamptz) to service_role;

-- Recover previous-period visits from retained events when latest-visit rows
-- have advanced into a later month. Visits without retained evidence are unknown.
create function public.admin_active_user_stats(p_since timestamptz, p_until timestamptz)
returns table (active_users bigint, new_registered_users bigint, old_registered_users bigint)
language sql
stable
security definer
set search_path = ''
as $$
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
  ), visits as materialized (
    select a.device_id, a.user_id
    from public.visitor_activity a
    left join auth.users u on u.id = a.user_id
    where (p_since is null or a.last_seen_at >= p_since)
      and (p_until is null or a.last_seen_at < p_until)
      and u.raw_app_meta_data->>'catdai_is_admin' is distinct from 'true'
    union
    select case when a.visitor->>'device_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (a.visitor->>'device_id')::uuid end, a.user_id
    from public.user_activity a
    join auth.users u on u.id = a.user_id
    where (p_since is null or a.last_seen_at >= p_since)
      and (p_until is null or a.last_seen_at < p_until)
      and u.raw_app_meta_data->>'catdai_is_admin' is distinct from 'true'
    union
    select case when e.device_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then e.device_id::uuid end, e.user_id
    from events e
    left join auth.users u on u.id = e.user_id
    where (p_since is null or e.created_at >= p_since)
      and (p_until is null or e.created_at < p_until)
      and e.visitor->>'device_type' is distinct from 'Bot'
      and u.raw_app_meta_data->>'catdai_is_admin' is distinct from 'true'
  ), registered as materialized (
    select u.id, u.created_at
    from auth.users u
    where not coalesce(u.is_anonymous, false)
      and (p_until is null or u.created_at < p_until)
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
revoke all on function public.admin_active_user_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_active_user_stats(timestamptz, timestamptz) to service_role;
